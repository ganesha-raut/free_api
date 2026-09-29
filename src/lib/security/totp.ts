import crypto from "crypto";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";

  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i];
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

export function base32Decode(input: string): Buffer {
  const cleaned = input
    .toUpperCase()
    .replace(/=+$/, "")
    .replace(/[^A-Z2-7]/g, "");

  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (let i = 0; i < cleaned.length; i++) {
    const idx = BASE32_ALPHABET.indexOf(cleaned[i]);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

/**
 * Generates a cryptographically random 160-bit (32 Base32 characters) secret
 * compatible with Google Authenticator, Authy, 1Password, and Microsoft Authenticator.
 */
export function generateTotpSecret(byteLength = 20): string {
  const randomBytes = crypto.randomBytes(byteLength);
  return base32Encode(randomBytes);
}

/**
 * Computes the 6-digit RFC 6238 TOTP code for a given Base32 secret and timestamp.
 */
export function generateTotpCode(
  secretBase32: string,
  timestampMs = Date.now(),
  stepSeconds = 30,
  digits = 6
): string {
  const key = base32Decode(secretBase32);
  const counter = Math.floor(timestampMs / 1000 / stepSeconds);

  const counterBuf = Buffer.alloc(8);
  counterBuf.writeBigUInt64BE(BigInt(counter), 0);

  const hmac = crypto.createHmac("sha1", key).update(counterBuf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;

  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  const otp = binary % Math.pow(10, digits);
  return otp.toString().padStart(digits, "0");
}

/**
 * Verifies a 6-digit Google Authenticator TOTP code with constant-time comparison
 * and configurable clock-drift window (default ±1 step = ±30 seconds).
 */
export function verifyTotpCode(
  secretBase32: string,
  code: string,
  window = 1,
  timestampMs = Date.now()
): boolean {
  const sanitized = (code || "").replace(/\s+/g, "").trim();
  if (!/^\d{6}$/.test(sanitized) || !secretBase32) {
    return false;
  }

  const stepMs = 30_000;
  for (let errorWindow = -window; errorWindow <= window; errorWindow++) {
    const candidate = generateTotpCode(
      secretBase32,
      timestampMs + errorWindow * stepMs
    );
    const bufA = Buffer.from(sanitized, "utf8");
    const bufB = Buffer.from(candidate, "utf8");
    if (bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB)) {
      return true;
    }
  }

  return false;
}

/**
 * Builds standard otpauth://totp URI for Google Authenticator QR scanning.
 */
export function buildOtpAuthUri({
  secret,
  accountName = "admin@gateway",
  issuer = "AI-Gateway",
}: {
  secret: string;
  accountName?: string;
  issuer?: string;
}): string {
  const cleanIssuer = encodeURIComponent(issuer);
  const cleanAccount = encodeURIComponent(accountName);
  return `otpauth://totp/${cleanIssuer}:${cleanAccount}?secret=${secret}&issuer=${cleanIssuer}&algorithm=SHA1&digits=6&period=30`;
}

/**
 * Creates a signed session token valid for 12 hours once 2FA is verified.
 */
export function createTotpSessionToken(
  secretBase32: string,
  ttlMs = 12 * 60 * 60 * 1000
): string {
  const expiresAt = Date.now() + ttlMs;
  const payload = `${expiresAt}`;
  const sig = crypto
    .createHmac("sha256", `totp_session:${secretBase32}`)
    .update(payload)
    .digest("hex");
  return `${payload}.${sig}`;
}

/**
 * Verifies a signed 2FA session token.
 */
export function verifyTotpSessionToken(
  token: string | undefined | null,
  secretBase32: string | undefined | null
): boolean {
  if (!token || !secretBase32) return false;
  const parts = token.split(".");
  if (parts.length !== 2) return false;

  const [expiresStr, sig] = parts;
  const expiresAt = Number(expiresStr);
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) {
    return false;
  }

  const expectedSig = crypto
    .createHmac("sha256", `totp_session:${secretBase32}`)
    .update(expiresStr)
    .digest("hex");

  const bufA = Buffer.from(sig, "utf8");
  const bufB = Buffer.from(expectedSig, "utf8");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}
