import type {
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatCompletionChunk,
} from "@/types";
import {
  type AIProvider,
  type ProviderConnectionTestResult,
  type ProviderModelInfo,
  ProviderError,
} from "@/lib/providers/provider.interface";
import { estimateTokens } from "@/lib/utils";
import { generateRequestId } from "@/lib/security";

export interface GeminiProviderOptions {
  id?: string;
  name?: string;
  baseUrl?: string;
  timeoutMs?: number;
  apiKey?: string;
}

export class GeminiWeb2APIProvider implements AIProvider {
  public readonly id: string;
  public readonly name: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly apiKey?: string;

  constructor(options: GeminiProviderOptions = {}) {
    this.id = options.id || "gemini";
    this.name = options.name || "Gemini Web2API";
    const rawUrl =
      options.baseUrl ||
      process.env.GEMINI_WEB2API_BASE_URL ||
      "http://localhost:8081/v1";
    this.baseUrl = rawUrl.replace(/\/+$/, "");
    this.timeoutMs = options.timeoutMs || 60000;
    this.apiKey = options.apiKey || process.env.GEMINI_WEB2API_API_KEY;
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }
    return headers;
  }

  private async fetchWithTimeout(
    url: string,
    init: RequestInit
  ): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      return await fetch(url, {
        ...init,
        signal: controller.signal,
      });
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        throw new ProviderError(
          `Gemini Web2API request timed out after ${this.timeoutMs}ms`,
          504,
          "provider_timeout"
        );
      }
      throw new ProviderError(
        "Unable to connect to Gemini Web2API provider",
        502,
        "provider_connection_error"
      );
    } finally {
      clearTimeout(timer);
    }
  }

  async listModels(): Promise<ProviderModelInfo[]> {
    const response = await this.fetchWithTimeout(`${this.baseUrl}/models`, {
      method: "GET",
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      throw new ProviderError(
        `Gemini Web2API returned status ${response.status} when listing models`,
        response.status >= 400 && response.status < 600 ? response.status : 502,
        "provider_http_error"
      );
    }

    const body = (await response.json()) as {
      data?: Array<{ id: string; owned_by?: string }>;
    };

    if (!Array.isArray(body.data)) {
      return [];
    }

    return body.data.map((m) => ({
      id: m.id,
      name: m.id,
      owned_by: m.owned_by || "gemini-web2api",
    }));
  }

  async chatCompletion(
    request: ChatCompletionRequest
  ): Promise<ChatCompletionResponse> {
    const maxTokens =
      request.max_completion_tokens ?? request.max_tokens ?? undefined;

    const payload: Record<string, unknown> = {
      model: request.model,
      messages: request.messages,
      stream: false,
    };
    if (request.temperature !== undefined) {
      payload.temperature = request.temperature;
    }
    if (request.top_p !== undefined) {
      payload.top_p = request.top_p;
    }
    if (maxTokens !== undefined) {
      payload.max_tokens = maxTokens;
    }
    if (request.stop !== undefined) {
      payload.stop = request.stop;
    }

    const response = await this.fetchWithTimeout(
      `${this.baseUrl}/chat/completions`,
      {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify(payload),
      }
    );

    if (!response.ok) {
      let errorDetail = `Gemini Web2API returned HTTP ${response.status}`;
      try {
        const errJson = (await response.json()) as {
          error?: { message?: string };
        };
        if (errJson?.error?.message) {
          errorDetail = errJson.error.message;
        }
      } catch {
        // Ignore parse error
      }
      throw new ProviderError(
        errorDetail,
        response.status >= 400 && response.status < 600 ? response.status : 502,
        "provider_completion_error"
      );
    }

    const data = (await response.json()) as Partial<ChatCompletionResponse>;
    const content =
      data.choices?.[0]?.message?.content ?? "";
    const promptText = request.messages
      .map((m) => (typeof m.content === "string" ? m.content : ""))
      .join(" ");

    const promptTokens =
      data.usage?.prompt_tokens ?? estimateTokens(promptText);
    const completionTokens =
      data.usage?.completion_tokens ?? estimateTokens(content || "");

    return {
      id: data.id || generateRequestId("chatcmpl"),
      object: "chat.completion",
      created: data.created || Math.floor(Date.now() / 1000),
      model: request.model,
      choices:
        Array.isArray(data.choices) && data.choices.length > 0
          ? data.choices.map((c, idx) => ({
              index: c.index ?? idx,
              message: {
                role: "assistant",
                content: c.message?.content ?? "",
                ...(c.message?.tool_calls
                  ? { tool_calls: c.message.tool_calls }
                  : {}),
              },
              finish_reason: c.finish_reason || "stop",
            }))
          : [
              {
                index: 0,
                message: {
                  role: "assistant",
                  content: "",
                },
                finish_reason: "stop",
              },
            ],
      usage: {
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: promptTokens + completionTokens,
      },
    };
  }

  async *streamChatCompletion(
    request: ChatCompletionRequest
  ): AsyncIterable<string> {
    const maxTokens =
      request.max_completion_tokens ?? request.max_tokens ?? undefined;

    const payload: Record<string, unknown> = {
      model: request.model,
      messages: request.messages,
      stream: true,
    };
    if (request.temperature !== undefined) {
      payload.temperature = request.temperature;
    }
    if (request.top_p !== undefined) {
      payload.top_p = request.top_p;
    }
    if (maxTokens !== undefined) {
      payload.max_tokens = maxTokens;
    }

    const response = await this.fetchWithTimeout(
      `${this.baseUrl}/chat/completions`,
      {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify(payload),
      }
    );

    if (!response.ok || !response.body) {
      throw new ProviderError(
        `Gemini Web2API streaming failed with HTTP ${response.status}`,
        response.status >= 400 && response.status < 600 ? response.status : 502,
        "provider_stream_error"
      );
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    const streamId = generateRequestId("chatcmpl");
    const created = Math.floor(Date.now() / 1000);

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const rawLine of lines) {
          const line = rawLine.trim();
          if (!line || !line.startsWith("data:")) continue;
          const dataStr = line.slice(5).trim();
          if (dataStr === "[DONE]") {
            return;
          }

          try {
            const parsed = JSON.parse(dataStr) as Partial<ChatCompletionChunk>;
            const normalized: ChatCompletionChunk = {
              id: parsed.id || streamId,
              object: "chat.completion.chunk",
              created: parsed.created || created,
              model: request.model,
              choices: parsed.choices || [
                {
                  index: 0,
                  delta: {},
                  finish_reason: null,
                },
              ],
            };
            yield JSON.stringify(normalized);
          } catch {
            // Skip malformed SSE line
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  async testConnection(): Promise<ProviderConnectionTestResult> {
    const start = Date.now();
    try {
      const models = await this.listModels();
      const latency = Date.now() - start;
      return {
        connected: true,
        latency_ms: latency,
        models,
        message: `Connected to Gemini Web2API (${models.length} models available)`,
      };
    } catch (err) {
      const latency = Date.now() - start;
      return {
        connected: false,
        latency_ms: latency,
        models: [],
        message:
          err instanceof Error
            ? err.message
            : "Failed to connect to Gemini Web2API",
      };
    }
  }
}
