import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  buildOtpAuthUri,
  createTotpSessionToken,
  generateTotpSecret,
  verifyTotpCode,
  verifyTotpSessionToken,
} from "@/lib/security/totp";
import { generateQrCodeSvg } from "@/lib/security/qrcode";
import {
  checkAuthBruteForce,
  clearFailedAuth,
  extractClientIp,
  getSecurityHeaders,
  recordFailedAuth,
} from "@/lib/security";

const SESSION_COOKIE_NAME = "gateway_2fa_session";

export async function GET(request: NextRequest) {
  const settings = await db.getSettings();
  const isEnabled = Boolean(settings.totp_enabled && settings.totp_secret);

  if (!isEnabled) {
    return NextResponse.json(
      {
        enabled: false,
        verified_session: true,
      },
      { headers: getSecurityHeaders() }
    );
  }

  const cookieToken = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const headerToken = request.headers.get("x-2fa-session");
  const token = cookieToken || headerToken;

  const verified = verifyTotpSessionToken(token, settings.totp_secret);

  return NextResponse.json(
    {
      enabled: true,
      verified_session: verified,
    },
    { headers: getSecurityHeaders() }
  );
}

export async function POST(request: NextRequest) {
  try {
    const clientIp = extractClientIp(request.headers);
    const bruteForce = checkAuthBruteForce(`2fa:${clientIp}`, 8);
    if (bruteForce.blocked) {
      return NextResponse.json(
        {
          error: `Too many failed 2FA attempts. Please wait ${bruteForce.retryAfterSeconds}s before trying again.`,
        },
        {
          status: 429,
          headers: {
            ...getSecurityHeaders(),
            "Retry-After": String(bruteForce.retryAfterSeconds),
          },
        }
      );
    }

    const body = (await request.json()) as {
      action?: "setup" | "enable" | "disable" | "verify" | "lock";
      secret?: string;
      code?: string;
    };

    const action = body.action;
    const settings = await db.getSettings();

    // 1. Generate QR Code & Secret for Setup
    if (action === "setup") {
      const secret = generateTotpSecret(20);
      const otpauthUrl = buildOtpAuthUri({
        secret,
        accountName: "admin@gateway",
        issuer: "AI-Gateway",
      });
      const qrSvg = generateQrCodeSvg(otpauthUrl);

      return NextResponse.json(
        {
          secret,
          otpauth_url: otpauthUrl,
          qr_svg: qrSvg,
        },
        { headers: getSecurityHeaders() }
      );
    }

    // 2. Verify 6-Digit Code & Enable Google Authenticator
    if (action === "enable") {
      const secret = (body.secret || "").trim().toUpperCase();
      const code = (body.code || "").trim();

      if (!secret || secret.length < 16) {
        return NextResponse.json(
          { error: "Missing or invalid TOTP setup secret." },
          { status: 400, headers: getSecurityHeaders() }
        );
      }

      if (!verifyTotpCode(secret, code)) {
        recordFailedAuth(`2fa:${clientIp}`);
        return NextResponse.json(
          {
            error:
              "Invalid 6-digit code. Scan the QR code in Google Authenticator and enter the current 6-digit code.",
          },
          { status: 400, headers: getSecurityHeaders() }
        );
      }

      clearFailedAuth(`2fa:${clientIp}`);
      await db.updateSettings({
        totp_enabled: true,
        totp_secret: secret,
      });

      const sessionToken = createTotpSessionToken(secret);
      const res = NextResponse.json(
        {
          enabled: true,
          verified_session: true,
          session_token: sessionToken,
          message: "Google Authenticator 2FA has been enabled.",
        },
        { headers: getSecurityHeaders() }
      );

      res.cookies.set(SESSION_COOKIE_NAME, sessionToken, {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 12 * 60 * 60,
      });
      return res;
    }

    // 3. Verify 6-Digit Code & Disable Google Authenticator
    if (action === "disable") {
      const code = (body.code || "").trim();
      const activeSecret = settings.totp_secret;

      if (!settings.totp_enabled || !activeSecret) {
        await db.updateSettings({
          totp_enabled: false,
          totp_secret: null,
        });
        return NextResponse.json(
          {
            enabled: false,
            verified_session: true,
            message: "Google Authenticator 2FA is already disabled.",
          },
          { headers: getSecurityHeaders() }
        );
      }

      if (!verifyTotpCode(activeSecret, code)) {
        recordFailedAuth(`2fa:${clientIp}`);
        return NextResponse.json(
          {
            error:
              "Invalid 6-digit Google Authenticator code. Enter the current code to disable 2FA.",
          },
          { status: 400, headers: getSecurityHeaders() }
        );
      }

      clearFailedAuth(`2fa:${clientIp}`);
      await db.updateSettings({
        totp_enabled: false,
        totp_secret: null,
      });

      const res = NextResponse.json(
        {
          enabled: false,
          verified_session: true,
          message: "Google Authenticator 2FA has been disabled.",
        },
        { headers: getSecurityHeaders() }
      );
      res.cookies.delete(SESSION_COOKIE_NAME);
      return res;
    }

    // 4. Verify 6-Digit Code to Unlock Dashboard Session
    if (action === "verify") {
      const code = (body.code || "").trim();
      const activeSecret = settings.totp_secret;

      if (!settings.totp_enabled || !activeSecret) {
        return NextResponse.json(
          { enabled: false, verified_session: true },
          { headers: getSecurityHeaders() }
        );
      }

      if (!verifyTotpCode(activeSecret, code)) {
        recordFailedAuth(`2fa:${clientIp}`);
        return NextResponse.json(
          {
            error: "Invalid 6-digit code from Google Authenticator.",
          },
          { status: 401, headers: getSecurityHeaders() }
        );
      }

      clearFailedAuth(`2fa:${clientIp}`);
      const sessionToken = createTotpSessionToken(activeSecret);
      const res = NextResponse.json(
        {
          enabled: true,
          verified_session: true,
          session_token: sessionToken,
        },
        { headers: getSecurityHeaders() }
      );

      res.cookies.set(SESSION_COOKIE_NAME, sessionToken, {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 12 * 60 * 60,
      });
      return res;
    }

    // 5. Lock Dashboard Session Immediately
    if (action === "lock") {
      const res = NextResponse.json(
        {
          enabled: Boolean(settings.totp_enabled && settings.totp_secret),
          verified_session: false,
        },
        { headers: getSecurityHeaders() }
      );
      res.cookies.delete(SESSION_COOKIE_NAME);
      return res;
    }

    return NextResponse.json(
      { error: "Unsupported 2FA action" },
      { status: 400, headers: getSecurityHeaders() }
    );
  } catch {
    return NextResponse.json(
      { error: "Failed to process Google Authenticator request" },
      { status: 500, headers: getSecurityHeaders() }
    );
  }
}
