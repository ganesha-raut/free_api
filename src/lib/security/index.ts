import crypto from "crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import type { OpenAIErrorPayload } from "@/types";

export function generateRequestId(prefix = "req"): string {
  return `${prefix}_${crypto.randomBytes(12).toString("hex")}`;
}

export function getSecurityHeaders(): Record<string, string> {
  return {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "X-XSS-Protection": "1; mode=block",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Cache-Control": "no-store, no-cache, must-revalidate",
  };
}

export function getCorsHeaders(origin = "*"): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, X-Request-ID, OpenAI-Beta",
    ...getSecurityHeaders(),
  };
}

export function createOpenAIErrorPayload(
  message: string,
  type: OpenAIErrorPayload["error"]["type"],
  code: string,
  param?: string | null
): OpenAIErrorPayload {
  return {
    error: {
      message,
      type,
      ...(param !== undefined ? { param } : {}),
      code,
    },
  };
}

export function createOpenAIErrorResponse(
  message: string,
  type: OpenAIErrorPayload["error"]["type"],
  code: string,
  status: number,
  headers?: Record<string, string>
): NextResponse<OpenAIErrorPayload> {
  const payload = createOpenAIErrorPayload(message, type, code);
  return NextResponse.json(payload, {
    status,
    headers: {
      ...getCorsHeaders(),
      ...(headers || {}),
    },
  });
}

/**
 * Constant-time string comparison to prevent timing side-channel attacks.
 */
export function safeTimingCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) {
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Extracts client IP from request headers safely.
 */
export function extractClientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  const realIp = headers.get("x-real-ip");
  if (realIp) {
    return realIp.trim();
  }
  return "127.0.0.1";
}

/**
 * Checks whether a client IP is permitted by the gateway IP allowlist.
 * "*" or empty string allows all IPs.
 */
export function checkIpAllowlist(
  clientIp: string,
  allowlistSetting?: string
): boolean {
  const raw = (allowlistSetting || "*").trim();
  if (!raw || raw === "*") return true;

  const allowedIps = raw
    .split(",")
    .map((ip) => ip.trim())
    .filter(Boolean);

  if (allowedIps.includes("*")) return true;
  if (
    (clientIp === "127.0.0.1" || clientIp === "::1" || clientIp === "localhost") &&
    (allowedIps.includes("127.0.0.1") ||
      allowedIps.includes("::1") ||
      allowedIps.includes("localhost"))
  ) {
    return true;
  }
  return allowedIps.includes(clientIp);
}

// Sliding window rate limiter per API key ID
const rateLimitBuckets = new Map<string, number[]>();

// Brute-force failed authentication tracker per IP/identifier
const failedAuthBuckets = new Map<string, number[]>();

export function resetRateLimiter(): void {
  rateLimitBuckets.clear();
  failedAuthBuckets.clear();
}

export function checkRateLimit(
  keyIdentifier: string,
  maxRequestsPerMinute: number
): { allowed: boolean; remaining: number; resetMs: number } {
  if (maxRequestsPerMinute <= 0) {
    return { allowed: true, remaining: 999, resetMs: 0 };
  }

  const now = Date.now();
  const windowMs = 60_000;
  const timestamps = rateLimitBuckets.get(keyIdentifier) || [];
  const active = timestamps.filter((t) => now - t < windowMs);

  if (active.length >= maxRequestsPerMinute) {
    const oldest = active[0] || now;
    rateLimitBuckets.set(keyIdentifier, active);
    return {
      allowed: false,
      remaining: 0,
      resetMs: Math.max(0, windowMs - (now - oldest)),
    };
  }

  active.push(now);
  rateLimitBuckets.set(keyIdentifier, active);
  return {
    allowed: true,
    remaining: Math.max(0, maxRequestsPerMinute - active.length),
    resetMs: windowMs,
  };
}

/**
 * Brute-force protection for failed API key or 2FA authentication attempts.
 */
export function checkAuthBruteForce(
  identifier: string,
  maxFailuresPerMinute = 10
): { blocked: boolean; retryAfterSeconds: number; attemptsRemaining: number } {
  const now = Date.now();
  const windowMs = 60_000;
  const failures = (failedAuthBuckets.get(identifier) || []).filter(
    (t) => now - t < windowMs
  );
  failedAuthBuckets.set(identifier, failures);

  if (failures.length >= maxFailuresPerMinute) {
    const oldest = failures[0] || now;
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((windowMs - (now - oldest)) / 1000)
    );
    return {
      blocked: true,
      retryAfterSeconds,
      attemptsRemaining: 0,
    };
  }

  return {
    blocked: false,
    retryAfterSeconds: 0,
    attemptsRemaining: Math.max(0, maxFailuresPerMinute - failures.length),
  };
}

export function recordFailedAuth(identifier: string): void {
  const now = Date.now();
  const windowMs = 60_000;
  const failures = (failedAuthBuckets.get(identifier) || []).filter(
    (t) => now - t < windowMs
  );
  failures.push(now);
  failedAuthBuckets.set(identifier, failures);
}

export function clearFailedAuth(identifier: string): void {
  failedAuthBuckets.delete(identifier);
}

// Sanitize error messages so internal stack traces, URLs, or secrets are never leaked
export function sanitizeProviderErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    const msg = err.message
      .replace(/sk_[a-zA-Z0-9_-]+/g, "sk_***")
      .replace(/Bearer\s+[^\s]+/gi, "Bearer ***");
    return msg.slice(0, 300);
  }
  return "Upstream provider request failed";
}

// Zod validation schemas
export const chatMessageSchema = z.object({
  role: z.enum(["system", "developer", "user", "assistant", "tool"]),
  content: z.union([
    z.string(),
    z.array(z.record(z.unknown())).transform((arr) =>
      arr
        .map((part) => (typeof part.text === "string" ? part.text : ""))
        .join("\n")
    ),
  ]),
  name: z.string().optional(),
  tool_call_id: z.string().optional(),
  tool_calls: z.array(z.unknown()).optional(),
});

export const chatCompletionRequestSchema = z.object({
  model: z.string().min(1, "Model ID is required"),
  messages: z
    .array(chatMessageSchema)
    .min(1, "At least one message is required"),
  temperature: z.number().min(0).max(2).optional(),
  top_p: z.number().min(0).max(1).optional(),
  max_tokens: z.number().int().positive().optional(),
  max_completion_tokens: z.number().int().positive().optional(),
  stream: z.boolean().optional().default(false),
  stop: z.union([z.string(), z.array(z.string())]).optional(),
  presence_penalty: z.number().min(-2).max(2).optional(),
  frequency_penalty: z.number().min(-2).max(2).optional(),
  user: z.string().optional(),
});

export const createKeySchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Key name is required")
    .max(80, "Key name must be 80 characters or fewer"),
});

export const createModelSchema = z.object({
  public_id: z
    .string()
    .trim()
    .min(1, "Public model ID is required")
    .max(80)
    .regex(
      /^[a-zA-Z0-9._:@/-]+$/,
      "Public model ID may only contain letters, numbers, '.', '_', ':', '@', '/', and '-'"
    ),
  name: z.string().trim().min(1, "Display name is required").max(100),
  provider_id: z.string().trim().min(1, "Provider ID is required"),
  provider_model: z
    .string()
    .trim()
    .min(1, "Provider model identifier is required"),
  type: z.enum(["chat", "completion", "reasoning"]).optional().default("chat"),
  enabled: z.boolean().optional().default(true),
  description: z.string().max(300).optional().default(""),
});

export const updateModelSchema = createModelSchema.partial();

export const updateProviderSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  base_url: z.string().trim().url("Must be a valid URL").optional(),
  enabled: z.boolean().optional(),
  timeout_ms: z.number().int().min(0).max(600000).optional(),
});

export const updateSettingsSchema = z.object({
  default_model: z.string().trim().min(1).optional(),
  request_timeout_ms: z.number().int().min(0).max(600000).optional(),
  logging_enabled: z.boolean().optional(),
  rate_limit_rpm: z.number().int().min(0).max(100000).optional(),
  max_request_bytes: z.number().int().min(1024).max(52428800).optional(),
  cors_origins: z.string().trim().min(1).optional(),
  ip_allowlist: z.string().trim().min(1).optional(),
  strict_security_headers: z.boolean().optional(),
});
