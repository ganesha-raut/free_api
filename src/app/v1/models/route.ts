import { NextRequest, NextResponse } from "next/server";
import { verifyBearerToken } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  checkRateLimit,
  createOpenAIErrorResponse,
  generateRequestId,
  getCorsHeaders,
} from "@/lib/security";
import type { OpenAIModelListResponse } from "@/types";

export async function OPTIONS() {
  const settings = await db.getSettings();
  return new NextResponse(null, {
    status: 204,
    headers: getCorsHeaders(settings.cors_origins),
  });
}

export async function GET(request: NextRequest) {
  const requestId = generateRequestId("req");
  const settings = await db.getSettings();
  const baseHeaders = {
    ...getCorsHeaders(settings.cors_origins),
    "X-Request-ID": requestId,
  };

  const authResult = await verifyBearerToken(
    request.headers.get("authorization")
  );
  if (!authResult.valid) {
    return createOpenAIErrorResponse(
      authResult.message,
      "authentication_error",
      authResult.code,
      401,
      baseHeaders
    );
  }

  const rateLimit = checkRateLimit(
    authResult.apiKey.id,
    settings.rate_limit_rpm
  );
  if (!rateLimit.allowed) {
    return createOpenAIErrorResponse(
      "Rate limit exceeded. Please slow down requests.",
      "rate_limit_error",
      "rate_limit_exceeded",
      429,
      baseHeaders
    );
  }

  const enabledModels = await db.listModels(true);
  const existingIds = new Set(enabledModels.map((m) => m.public_id));

  const knownActiveGeminiModels = [
    "gemini-3.7-flash",
    "gemini-3.6-flash",
    "gemini-3.5-flash",
    "gemini-3.5-flash-thinking",
    "gemini-3.1-pro",
    "gemini-3.1-pro-enhanced",
    "gemini-auto",
    "gemini-flash-lite",
    "gemini-fast",
    "gemini-pro",
    "gemini-thinking",
  ];

  const nowSeconds = Math.floor(Date.now() / 1000);
  const modelList = enabledModels.map((model) => ({
    id: model.public_id,
    object: "model" as const,
    created: Math.floor(new Date(model.created_at).getTime() / 1000),
    owned_by: "ai-gateway",
  }));

  for (const mid of knownActiveGeminiModels) {
    if (!existingIds.has(mid)) {
      modelList.push({
        id: mid,
        object: "model" as const,
        created: nowSeconds,
        owned_by: "gemini-web2api",
      });
    }
  }

  const responsePayload: OpenAIModelListResponse = {
    object: "list",
    data: modelList,
  };

  return NextResponse.json(responsePayload, {
    status: 200,
    headers: baseHeaders,
  });
}
