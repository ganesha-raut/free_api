import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import {
  createNewApiKey,
  generateApiKey,
  hashApiKey,
  maskApiKey,
  verifyBearerToken,
} from "@/lib/auth";
import { resetRateLimiter } from "@/lib/security";
import {
  generateTotpCode,
  generateTotpSecret,
  verifyTotpCode,
} from "@/lib/security/totp";
import { GeminiWeb2APIProvider } from "@/lib/providers/gemini";
import { OllamaProvider } from "@/lib/providers/ollama";
import { GET as getV1Models } from "@/app/v1/models/route";
import { POST as postV1ChatCompletions } from "@/app/v1/chat/completions/route";
import {
  GET as getTwoFaStatus,
  POST as postTwoFaAction,
} from "@/app/api/auth/2fa/route";
import { GET as getSettingsRoute } from "@/app/api/settings/route";

describe("Private AI API Gateway & Model Router", () => {
  beforeEach(() => {
    db.resetForTests();
    resetRateLimiter();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ---------------------------------------------------------------------------
  // 1. API Key Management (create, revoke, hash verification)
  // ---------------------------------------------------------------------------
  describe("API Key Management", () => {
    it("generates secure random API keys with sk_live_ prefix and hashes them with SHA-256", () => {
      const { rawKey, keyPrefix, keyHash } = generateApiKey();
      expect(rawKey.startsWith("sk_live_")).toBe(true);
      expect(rawKey.length).toBeGreaterThan(20);
      expect(keyHash).toBe(hashApiKey(rawKey));
      expect(keyHash).not.toBe(rawKey);
      expect(maskApiKey(keyPrefix)).toBe("sk_live_************");
    });

    it("stores only the hashed API key and never stores plaintext in the database", async () => {
      const { rawKey, apiKey } = await createNewApiKey("My Development Key");
      expect(apiKey.name).toBe("My Development Key");
      expect(apiKey.masked_key).toBe("sk_live_************");
      expect(apiKey.status).toBe("active");

      const storedRecords = await db.listApiKeys();
      expect(storedRecords).toHaveLength(1);
      expect(storedRecords[0].key_hash).toBe(hashApiKey(rawKey));
      expect(JSON.stringify(storedRecords[0])).not.toContain(rawKey);
    });

    it("revokes an API key and marks its status as revoked", async () => {
      const { rawKey, apiKey } = await createNewApiKey("Temporary Key");
      const revoked = await db.revokeApiKey(apiKey.id);
      expect(revoked?.revoked_at).not.toBeNull();

      const verification = await verifyBearerToken(`Bearer ${rawKey}`);
      expect(verification.valid).toBe(false);
      if (!verification.valid) {
        expect(verification.code).toBe("revoked_api_key");
      }
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Authentication (valid API key, invalid API key, revoked API key)
  // ---------------------------------------------------------------------------
  describe("Authentication", () => {
    it("accepts a valid API key", async () => {
      const { rawKey } = await createNewApiKey("Valid Key");
      const req = new NextRequest("http://localhost:3000/v1/models", {
        method: "GET",
        headers: { Authorization: `Bearer ${rawKey}` },
      });

      const res = await getV1Models(req);
      expect(res.status).toBe(200);
    });

    it("rejects an invalid API key with 401 Unauthorized and OpenAI error format", async () => {
      const req = new NextRequest("http://localhost:3000/v1/models", {
        method: "GET",
        headers: { Authorization: "Bearer sk_live_invalid_secret_key_12345" },
      });

      const res = await getV1Models(req);
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body).toEqual({
        error: {
          message: "Invalid API key provided",
          type: "authentication_error",
          code: "invalid_api_key",
        },
      });
    });

    it("rejects a revoked API key with 401 Unauthorized", async () => {
      const { rawKey, apiKey } = await createNewApiKey("Revoked Test Key");
      await db.revokeApiKey(apiKey.id);

      const req = new NextRequest("http://localhost:3000/v1/models", {
        method: "GET",
        headers: { Authorization: `Bearer ${rawKey}` },
      });

      const res = await getV1Models(req);
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error.type).toBe("authentication_error");
      expect(body.error.code).toBe("revoked_api_key");
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Models (list models, disabled model, unknown model)
  // ---------------------------------------------------------------------------
  describe("Models & Router", () => {
    it("lists only enabled models on GET /v1/models", async () => {
      const { rawKey } = await createNewApiKey("Models Test Key");
      const req = new NextRequest("http://localhost:3000/v1/models", {
        method: "GET",
        headers: { Authorization: `Bearer ${rawKey}` },
      });

      const res = await getV1Models(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.object).toBe("list");
      const modelIds = body.data.map((m: { id: string }) => m.id);
      expect(modelIds).toContain("gemini-fast");
      expect(modelIds).toContain("gemini-pro");
      expect(modelIds).toContain("gemma4:31b-cloud");
      // disabled-test-model is disabled by default
      expect(modelIds).not.toContain("disabled-test-model");
    });

    it("returns 403 model_disabled when calling a disabled model", async () => {
      const { rawKey } = await createNewApiKey("Disabled Model Key");
      const req = new NextRequest("http://localhost:3000/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${rawKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "disabled-test-model",
          messages: [{ role: "user", content: "Hello" }],
        }),
      });

      const res = await postV1ChatCompletions(req);
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error.code).toBe("model_disabled");
    });

    it("returns 404 model_not_found when calling an unknown model", async () => {
      const { rawKey } = await createNewApiKey("Unknown Model Key");
      const req = new NextRequest("http://localhost:3000/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${rawKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "non-existent-model",
          messages: [{ role: "user", content: "Hello" }],
        }),
      });

      const res = await postV1ChatCompletions(req);
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error.code).toBe("model_not_found");
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Providers (Gemini connection, Ollama connection, timeout, error)
  // ---------------------------------------------------------------------------
  describe("Providers", () => {
    it("connects to Gemini Web2API provider and lists models", async () => {
      vi.spyOn(global, "fetch").mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            object: "list",
            data: [
              { id: "gemini-3.6-flash", owned_by: "google" },
              { id: "gemini-3.1-pro", owned_by: "google" },
            ],
          }),
          { status: 200 }
        )
      );

      const gemini = new GeminiWeb2APIProvider({
        baseUrl: "http://localhost:8081/v1",
      });
      const result = await gemini.testConnection();
      expect(result.connected).toBe(true);
      expect(result.models).toHaveLength(2);
      expect(result.models[0].id).toBe("gemini-3.6-flash");
    });

    it("connects to Ollama provider and dynamically reads available models", async () => {
      vi.spyOn(global, "fetch").mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            models: [{ name: "qwen2.5:latest" }, { name: "deepseek-r1:8b" }],
          }),
          { status: 200 }
        )
      );

      const ollama = new OllamaProvider({
        baseUrl: "http://localhost:11434",
      });
      const models = await ollama.listModels();
      expect(models.map((m) => m.id)).toEqual([
        "qwen2.5:latest",
        "deepseek-r1:8b",
      ]);
    });

    it("handles provider timeout gracefully with 504 provider_timeout", async () => {
      vi.spyOn(global, "fetch").mockImplementationOnce(() => {
        const abortErr = new Error("The operation was aborted");
        abortErr.name = "AbortError";
        return Promise.reject(abortErr);
      });

      const gemini = new GeminiWeb2APIProvider({
        baseUrl: "http://localhost:8081/v1",
        timeoutMs: 100,
      });

      await expect(
        gemini.chatCompletion({
          model: "gemini-3.6-flash",
          messages: [{ role: "user", content: "Hello" }],
        })
      ).rejects.toMatchObject({
        statusCode: 504,
        code: "provider_timeout",
      });
    });

    it("normalizes upstream provider errors cleanly", async () => {
      vi.spyOn(global, "fetch").mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: { message: "Upstream model overloaded" },
          }),
          { status: 503 }
        )
      );

      const gemini = new GeminiWeb2APIProvider({
        baseUrl: "http://localhost:8081/v1",
      });

      await expect(
        gemini.chatCompletion({
          model: "gemini-3.6-flash",
          messages: [{ role: "user", content: "Hello" }],
        })
      ).rejects.toMatchObject({
        statusCode: 503,
        code: "provider_completion_error",
      });
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Chat Completions (normal request, streaming request, invalid request, missing model)
  // ---------------------------------------------------------------------------
  describe("Chat Completions (/v1/chat/completions)", () => {
    it("routes a normal chat completion request and returns OpenAI-compatible response", async () => {
      const { rawKey } = await createNewApiKey("Chat Completion Key");

      const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "chatcmpl_upstream123",
            object: "chat.completion",
            created: 1700000000,
            model: "gemini-3.6-flash",
            choices: [
              {
                index: 0,
                message: {
                  role: "assistant",
                  content: "Hello from Gemini Web2API!",
                },
                finish_reason: "stop",
              },
            ],
            usage: {
              prompt_tokens: 5,
              completion_tokens: 6,
              total_tokens: 11,
            },
          }),
          { status: 200 }
        )
      );

      const req = new NextRequest("http://localhost:3000/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${rawKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gemini-fast",
          messages: [{ role: "user", content: "Hello" }],
        }),
      });

      const res = await postV1ChatCompletions(req);
      expect(res.status).toBe(200);
      const data = await res.json();

      // Verify public model ID is preserved and upstream model ID is sent to provider
      expect(data.object).toBe("chat.completion");
      expect(data.model).toBe("gemini-fast");
      expect(data.choices[0].message.content).toBe("Hello from Gemini Web2API!");
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      const upstreamCallBody = JSON.parse(
        fetchSpy.mock.calls[0][1]?.body as string
      );
      expect(upstreamCallBody.model).toBe("gemini-3.6-flash");

      // Verify usage log was recorded without prompt/response text
      const logs = await db.listUsageLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0].model).toBe("gemini-fast");
      expect(logs[0].status_code).toBe(200);
      expect(JSON.stringify(logs[0])).not.toContain("Hello from Gemini Web2API!");
    });

    it("streams SSE chunks when stream: true is requested", async () => {
      const { rawKey } = await createNewApiKey("Stream Key");

      const ssePayload = [
        `data: ${JSON.stringify({
          id: "chatcmpl_s1",
          object: "chat.completion.chunk",
          created: 1700000000,
          model: "gemini-3.6-flash",
          choices: [
            {
              index: 0,
              delta: { role: "assistant", content: "Hello " },
              finish_reason: null,
            },
          ],
        })}\n\n`,
        `data: ${JSON.stringify({
          id: "chatcmpl_s1",
          object: "chat.completion.chunk",
          created: 1700000000,
          model: "gemini-3.6-flash",
          choices: [
            {
              index: 0,
              delta: { content: "World!" },
              finish_reason: "stop",
            },
          ],
        })}\n\n`,
        "data: [DONE]\n\n",
      ].join("");

      const encoder = new TextEncoder();
      const upstreamStream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(ssePayload));
          controller.close();
        },
      });

      vi.spyOn(global, "fetch").mockResolvedValueOnce(
        new Response(upstreamStream, {
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
        })
      );

      const req = new NextRequest("http://localhost:3000/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${rawKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gemini-fast",
          stream: true,
          messages: [{ role: "user", content: "Say hello" }],
        }),
      });

      const res = await postV1ChatCompletions(req);
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toContain("text/event-stream");

      const text = await res.text();
      expect(text).toContain('"model":"gemini-fast"');
      expect(text).toContain('"content":"Hello "');
      expect(text).toContain('"content":"World!"');
      expect(text).toContain("data: [DONE]");
    });

    it("rejects an invalid request with empty messages array (400)", async () => {
      const { rawKey } = await createNewApiKey("Validation Key");
      const req = new NextRequest("http://localhost:3000/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${rawKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gemini-fast",
          messages: [],
        }),
      });

      const res = await postV1ChatCompletions(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.type).toBe("invalid_request_error");
    });

    it("rejects a request missing the model field with 400 missing_model", async () => {
      const { rawKey } = await createNewApiKey("Missing Model Key");
      const req = new NextRequest("http://localhost:3000/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${rawKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: [{ role: "user", content: "Hello" }],
        }),
      });

      const res = await postV1ChatCompletions(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe("missing_model");
    });
  });

  // ---------------------------------------------------------------------------
  // 6. Advanced Security & Google Authenticator (TOTP 2FA)
  // ---------------------------------------------------------------------------
  describe("Security Policies & Google Authenticator (TOTP 2FA)", () => {
    it("generates and verifies RFC 6238 Google Authenticator 6-digit TOTP codes", () => {
      const secret = generateTotpSecret(20);
      expect(secret.length).toBeGreaterThanOrEqual(32);

      const code = generateTotpCode(secret);
      expect(code).toMatch(/^\d{6}$/);
      expect(verifyTotpCode(secret, code)).toBe(true);
      expect(verifyTotpCode(secret, "000000" === code ? "999999" : "000000")).toBe(false);
    });

    it("supports full Google Authenticator setup, enable, lock, verify, and disable lifecycle", async () => {
      // 1. Setup: generates secret + otpauth URI + SVG QR code
      const setupReq = new NextRequest("http://localhost:3000/api/auth/2fa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "setup" }),
      });
      const setupRes = await postTwoFaAction(setupReq);
      expect(setupRes.status).toBe(200);
      const setupData = await setupRes.json();
      expect(setupData.secret).toBeDefined();
      expect(setupData.otpauth_url).toContain("otpauth://totp/");
      expect(setupData.qr_svg).toContain("<svg");

      // 2. Reject invalid 6-digit code during enable
      const badEnableReq = new NextRequest("http://localhost:3000/api/auth/2fa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "enable",
          secret: setupData.secret,
          code: "111111" === generateTotpCode(setupData.secret) ? "222222" : "111111",
        }),
      });
      const badEnableRes = await postTwoFaAction(badEnableReq);
      expect(badEnableRes.status).toBe(400);

      // 3. Enable with valid Google Authenticator 6-digit code
      const validCode = generateTotpCode(setupData.secret);
      const enableReq = new NextRequest("http://localhost:3000/api/auth/2fa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "enable",
          secret: setupData.secret,
          code: validCode,
        }),
      });
      const enableRes = await postTwoFaAction(enableReq);
      expect(enableRes.status).toBe(200);
      const enableData = await enableRes.json();
      expect(enableData.enabled).toBe(true);
      expect(enableData.session_token).toBeDefined();

      // 4. Ensure GET /api/settings never leaks totp_secret
      const settingsRes = await getSettingsRoute();
      const settingsJson = await settingsRes.json();
      expect(settingsJson.settings.totp_enabled).toBe(true);
      expect(settingsJson.settings.totp_secret).toBeUndefined();

      // 5. Verify status without session cookie is locked (verified_session: false)
      const unauthStatusReq = new NextRequest("http://localhost:3000/api/auth/2fa", {
        method: "GET",
      });
      const unauthStatusRes = await getTwoFaStatus(unauthStatusReq);
      const unauthStatusData = await unauthStatusRes.json();
      expect(unauthStatusData.enabled).toBe(true);
      expect(unauthStatusData.verified_session).toBe(false);

      // 6. Verify status with valid session header is unlocked (verified_session: true)
      const authStatusReq = new NextRequest("http://localhost:3000/api/auth/2fa", {
        method: "GET",
        headers: { "x-2fa-session": enableData.session_token },
      });
      const authStatusRes = await getTwoFaStatus(authStatusReq);
      const authStatusData = await authStatusRes.json();
      expect(authStatusData.enabled).toBe(true);
      expect(authStatusData.verified_session).toBe(true);

      // 7. Disable Google Authenticator using valid 6-digit code
      const disableReq = new NextRequest("http://localhost:3000/api/auth/2fa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "disable",
          code: generateTotpCode(setupData.secret),
        }),
      });
      const disableRes = await postTwoFaAction(disableReq);
      expect(disableRes.status).toBe(200);
      const disableData = await disableRes.json();
      expect(disableData.enabled).toBe(false);
    });

    it("enforces IP allowlist and blocks unauthorized client IPs with 403 ip_not_allowed", async () => {
      const { rawKey } = await createNewApiKey("IP Allowlist Key");
      await db.updateSettings({ ip_allowlist: "10.20.30.40" });

      const req = new NextRequest("http://localhost:3000/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${rawKey}`,
          "Content-Type": "application/json",
          "X-Forwarded-For": "192.168.1.99",
        },
        body: JSON.stringify({
          model: "gemini-fast",
          messages: [{ role: "user", content: "Hello" }],
        }),
      });

      const res = await postV1ChatCompletions(req);
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error.code).toBe("ip_not_allowed");
    });

    it("locks out brute-force failed authentication attempts with 429 auth_lockout", async () => {
      for (let i = 0; i < 10; i++) {
        const badReq = new NextRequest("http://localhost:3000/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: "Bearer sk_live_wrong_key_attempt",
            "Content-Type": "application/json",
            "X-Forwarded-For": "203.0.113.55",
          },
          body: JSON.stringify({
            model: "gemini-fast",
            messages: [{ role: "user", content: "Hello" }],
          }),
        });
        const r = await postV1ChatCompletions(badReq);
        expect(r.status).toBe(401);
      }

      // 11th attempt from same IP should be blocked by brute-force lockout (429)
      const lockedReq = new NextRequest("http://localhost:3000/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: "Bearer sk_live_wrong_key_attempt",
          "Content-Type": "application/json",
          "X-Forwarded-For": "203.0.113.55",
        },
        body: JSON.stringify({
          model: "gemini-fast",
          messages: [{ role: "user", content: "Hello" }],
        }),
      });
      const lockedRes = await postV1ChatCompletions(lockedReq);
      expect(lockedRes.status).toBe(429);
      expect(lockedRes.headers.get("X-Content-Type-Options")).toBe("nosniff");
      expect(lockedRes.headers.get("X-Frame-Options")).toBe("DENY");
      const body = await lockedRes.json();
      expect(body.error.code).toBe("auth_lockout");
    });
  });
});
