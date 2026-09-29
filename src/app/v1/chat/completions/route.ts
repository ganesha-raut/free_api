import { NextRequest, NextResponse } from "next/server";
import { verifyBearerToken } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  chatCompletionRequestSchema,
  checkAuthBruteForce,
  checkIpAllowlist,
  checkRateLimit,
  clearFailedAuth,
  createOpenAIErrorResponse,
  extractClientIp,
  generateRequestId,
  getCorsHeaders,
  recordFailedAuth,
  sanitizeProviderErrorMessage,
} from "@/lib/security";
import {
  routeChatCompletion,
  routeStreamChatCompletion,
  RouterResolutionError,
} from "@/lib/router";
import { ProviderError } from "@/lib/providers/provider.interface";
import { recordGatewayUsage } from "@/lib/usage";
import { estimateTokens } from "@/lib/utils";
import type { ChatCompletionChunk } from "@/types";

export async function OPTIONS() {
  const settings = await db.getSettings();
  return new NextResponse(null, {
    status: 204,
    headers: getCorsHeaders(settings.cors_origins),
  });
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const requestId = generateRequestId("req");
  const settings = await db.getSettings();
  const baseHeaders = {
    ...getCorsHeaders(settings.cors_origins),
    "X-Request-ID": requestId,
  };

  const clientIp = extractClientIp(request.headers);

  // 0. Enforce IP Allowlist & Brute-Force Protection
  if (!checkIpAllowlist(clientIp, settings.ip_allowlist)) {
    return createOpenAIErrorResponse(
      `Client IP (${clientIp}) is not permitted by the gateway IP allowlist`,
      "authentication_error",
      "ip_not_allowed",
      403,
      baseHeaders
    );
  }

  const bruteForce = checkAuthBruteForce(`v1:${clientIp}`);
  if (bruteForce.blocked) {
    return createOpenAIErrorResponse(
      `Too many failed authentication attempts. Retry after ${bruteForce.retryAfterSeconds}s`,
      "rate_limit_error",
      "auth_lockout",
      429,
      {
        ...baseHeaders,
        "Retry-After": String(bruteForce.retryAfterSeconds),
      }
    );
  }

  // 1. Authenticate Bearer API Key
  const authResult = await verifyBearerToken(
    request.headers.get("authorization")
  );
  if (!authResult.valid) {
    recordFailedAuth(`v1:${clientIp}`);
    return createOpenAIErrorResponse(
      authResult.message,
      "authentication_error",
      authResult.code,
      401,
      baseHeaders
    );
  }

  clearFailedAuth(`v1:${clientIp}`);

  // 2. Enforce Rate Limit
  const rateLimit = checkRateLimit(
    authResult.apiKey.id,
    settings.rate_limit_rpm
  );
  if (!rateLimit.allowed) {
    await recordGatewayUsage({
      request_id: requestId,
      api_key_id: authResult.apiKey.id,
      model: "unknown",
      provider: "gateway",
      status_code: 429,
      latency_ms: Date.now() - startTime,
      error_code: "rate_limit_exceeded",
    });

    return createOpenAIErrorResponse(
      "Rate limit exceeded for this API key",
      "rate_limit_error",
      "rate_limit_exceeded",
      429,
      baseHeaders
    );
  }

  // 3. Enforce Request Size Limits & Parse Body
  let rawText: string;
  try {
    rawText = await request.text();
  } catch {
    return createOpenAIErrorResponse(
      "Failed to read request body",
      "invalid_request_error",
      "invalid_body",
      400,
      baseHeaders
    );
  }

  const maxBytes = settings.max_request_bytes || 1_048_576;
  if (Buffer.byteLength(rawText, "utf8") > maxBytes) {
    return createOpenAIErrorResponse(
      `Request payload exceeds maximum size of ${maxBytes} bytes`,
      "invalid_request_error",
      "payload_too_large",
      413,
      baseHeaders
    );
  }

  let jsonBody: unknown;
  try {
    jsonBody = JSON.parse(rawText);
  } catch {
    return createOpenAIErrorResponse(
      "Malformed JSON in request body",
      "invalid_request_error",
      "invalid_json",
      400,
      baseHeaders
    );
  }

  // 4. Validate Request with Zod
  const parsed = chatCompletionRequestSchema.safeParse(jsonBody);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    const fieldPath = firstIssue?.path?.join(".") || "body";
    const isMissingModel = fieldPath === "model";

    return createOpenAIErrorResponse(
      firstIssue
        ? `${fieldPath}: ${firstIssue.message}`
        : "Invalid chat completion request payload",
      "invalid_request_error",
      isMissingModel ? "missing_model" : "invalid_request_payload",
      400,
      baseHeaders
    );
  }

  const completionReq = parsed.data;

  // 5. Handle Streaming vs Non-Streaming
  try {
    if (completionReq.stream) {
      const { stream, route } = await routeStreamChatCompletion(completionReq);
      const encoder = new TextEncoder();
      const promptText = completionReq.messages
        .map((m) => (typeof m.content === "string" ? m.content : ""))
        .join(" ");
      const estimatedPromptTokens = estimateTokens(promptText);
      let accumulatedText = "";

      const readable = new ReadableStream({
        async start(controller) {
          try {
            for await (const chunkStr of stream) {
              try {
                const parsedChunk = JSON.parse(chunkStr) as ChatCompletionChunk;
                const deltaText = parsedChunk.choices?.[0]?.delta?.content;
                if (deltaText) {
                  accumulatedText += deltaText;
                }
              } catch {
                // Ignore token accumulation parse error
              }
              controller.enqueue(encoder.encode(`data: ${chunkStr}\n\n`));
            }
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();

            const completionTokens = estimateTokens(accumulatedText);
            await recordGatewayUsage({
              request_id: requestId,
              api_key_id: authResult.apiKey.id,
              model: route.modelRecord.public_id,
              provider: route.providerRecord.name,
              status_code: 200,
              latency_ms: Date.now() - startTime,
              prompt_tokens: estimatedPromptTokens,
              completion_tokens: completionTokens,
              total_tokens: estimatedPromptTokens + completionTokens,
              is_stream: true,
            });
          } catch (streamErr) {
            const errMsg = sanitizeProviderErrorMessage(streamErr);
            const errorEvent = JSON.stringify({
              error: {
                message: errMsg,
                type: "provider_error",
                code: "stream_interrupted",
              },
            });
            controller.enqueue(encoder.encode(`data: ${errorEvent}\n\n`));
            controller.close();

            await recordGatewayUsage({
              request_id: requestId,
              api_key_id: authResult.apiKey.id,
              model: route.modelRecord.public_id,
              provider: route.providerRecord.name,
              status_code: 502,
              latency_ms: Date.now() - startTime,
              is_stream: true,
              error_code: "stream_interrupted",
            });
          }
        },
      });

      return new NextResponse(readable, {
        status: 200,
        headers: {
          ...baseHeaders,
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
        },
      });
    }

    // Non-streaming chat completion
    const { response, route } = await routeChatCompletion(completionReq);
    const latencyMs = Date.now() - startTime;

    await recordGatewayUsage({
      request_id: requestId,
      api_key_id: authResult.apiKey.id,
      model: route.modelRecord.public_id,
      provider: route.providerRecord.name,
      status_code: 200,
      latency_ms: latencyMs,
      prompt_tokens: response.usage?.prompt_tokens ?? null,
      completion_tokens: response.usage?.completion_tokens ?? null,
      total_tokens: response.usage?.total_tokens ?? null,
      is_stream: false,
    });

    return NextResponse.json(response, {
      status: 200,
      headers: baseHeaders,
    });
  } catch (err) {
    const latencyMs = Date.now() - startTime;

    if (err instanceof RouterResolutionError) {
      await recordGatewayUsage({
        request_id: requestId,
        api_key_id: authResult.apiKey.id,
        model: completionReq.model,
        provider: "router",
        status_code: err.statusCode,
        latency_ms: latencyMs,
        is_stream: Boolean(completionReq.stream),
        error_code: err.code,
      });

      return createOpenAIErrorResponse(
        err.message,
        err.type,
        err.code,
        err.statusCode,
        baseHeaders
      );
    }

    if (err instanceof ProviderError) {
      await recordGatewayUsage({
        request_id: requestId,
        api_key_id: authResult.apiKey.id,
        model: completionReq.model,
        provider: "upstream",
        status_code: err.statusCode,
        latency_ms: latencyMs,
        is_stream: Boolean(completionReq.stream),
        error_code: err.code,
      });

      return createOpenAIErrorResponse(
        sanitizeProviderErrorMessage(err),
        err.type,
        err.code,
        err.statusCode,
        baseHeaders
      );
    }

    await recordGatewayUsage({
      request_id: requestId,
      api_key_id: authResult.apiKey.id,
      model: completionReq.model,
      provider: "gateway",
      status_code: 500,
      latency_ms: latencyMs,
      is_stream: Boolean(completionReq.stream),
      error_code: "internal_gateway_error",
    });

    return createOpenAIErrorResponse(
      sanitizeProviderErrorMessage(err),
      "internal_error",
      "internal_gateway_error",
      500,
      baseHeaders
    );
  }
}
