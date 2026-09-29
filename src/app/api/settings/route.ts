import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSecurityHeaders, updateSettingsSchema } from "@/lib/security";

export async function GET() {
  const rawSettings = await db.getSettings();
  const safeSettings = {
    ...rawSettings,
    totp_enabled: Boolean(rawSettings.totp_enabled && rawSettings.totp_secret),
    totp_secret: undefined,
  };

  return NextResponse.json(
    {
      settings: safeSettings,
      storage_engine: db.getStorageEngine(),
      env: {
        gemini_base_url:
          process.env.GEMINI_WEB2API_BASE_URL || "http://localhost:8081/v1",
        ollama_base_url:
          process.env.OLLAMA_BASE_URL || "http://localhost:11434",
        app_url: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
        api_key_prefix: process.env.API_KEY_PREFIX || "sk_live_",
        database_configured: Boolean(process.env.DATABASE_URL?.trim()),
      },
    },
    { headers: getSecurityHeaders() }
  );
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = updateSettingsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error:
            parsed.error.issues[0]?.message || "Invalid settings values",
        },
        { status: 400, headers: getSecurityHeaders() }
      );
    }

    const updated = await db.updateSettings(parsed.data);
    const safeSettings = {
      ...updated,
      totp_enabled: Boolean(updated.totp_enabled && updated.totp_secret),
      totp_secret: undefined,
    };

    return NextResponse.json(
      { settings: safeSettings },
      { headers: getSecurityHeaders() }
    );
  } catch {
    return NextResponse.json(
      { error: "Failed to update gateway settings" },
      { status: 500, headers: getSecurityHeaders() }
    );
  }
}
