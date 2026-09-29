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

  const responsePayload: OpenAIModelListResponse = {
    object: "list",
    data: enabledModels.map((model) => ({
      id: model.public_id,
      object: "model",
      created: Math.floor(new Date(model.created_at).getTime() / 1000),
      owned_by: "ai-gateway",
    })),
  };

  return NextResponse.json(responsePayload, {
    status: 200,
    headers: baseHeaders,
  });
}
