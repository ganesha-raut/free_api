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

export interface OllamaProviderOptions {
  id?: string;
  name?: string;
  baseUrl?: string;
  timeoutMs?: number;
}

export class OllamaProvider implements AIProvider {
  public readonly id: string;
  public readonly name: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(options: OllamaProviderOptions = {}) {
    this.id = options.id || "ollama";
    this.name = options.name || "Ollama";
    const rawUrl =
      options.baseUrl ||
      process.env.OLLAMA_BASE_URL ||
      "http://localhost:11434";
    this.baseUrl = rawUrl.replace(/\/+$/, "").replace(/\/v1$/, "");
    this.timeoutMs = options.timeoutMs || 60000;
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
          `Ollama request timed out after ${this.timeoutMs}ms`,
          504,
          "provider_timeout"
        );
      }
      throw new ProviderError(
        "Unable to connect to Ollama provider",
        502,
        "provider_connection_error"
      );
    } finally {
      clearTimeout(timer);
    }
  }

  async listModels(): Promise<ProviderModelInfo[]> {
    const response = await this.fetchWithTimeout(`${this.baseUrl}/api/tags`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });

    if (!response.ok) {
      throw new ProviderError(
        `Ollama returned status ${response.status} when listing models`,
        response.status >= 400 && response.status < 600 ? response.status : 502,
        "provider_http_error"
      );
    }

    const data = (await response.json()) as {
      models?: Array<{ name: string; model?: string }>;
    };

    if (!Array.isArray(data.models)) {
      return [];
    }

    return data.models.map((m) => ({
      id: m.name || m.model || "unknown",
      name: m.name || m.model || "unknown",
      owned_by: "ollama",
    }));
  }

  async chatCompletion(
    request: ChatCompletionRequest
  ): Promise<ChatCompletionResponse> {
    const maxTokens =
      request.max_completion_tokens ?? request.max_tokens ?? undefined;

    const options: Record<string, unknown> = {};
    if (request.temperature !== undefined) {
      options.temperature = request.temperature;
    }
    if (request.top_p !== undefined) {
      options.top_p = request.top_p;
    }
    if (maxTokens !== undefined) {
      options.num_predict = maxTokens;
    }
    if (request.stop !== undefined) {
      options.stop = Array.isArray(request.stop)
        ? request.stop
        : [request.stop];
    }

    const payload = {
      model: request.model,
      messages: request.messages.map((m) => ({
        role: m.role === "developer" ? "system" : m.role,
        content: typeof m.content === "string" ? m.content : "",
      })),
      stream: false,
      ...(Object.keys(options).length > 0 ? { options } : {}),
    };

    const response = await this.fetchWithTimeout(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      let errorDetail = `Ollama returned HTTP ${response.status}`;
      try {
        const errJson = (await response.json()) as { error?: string };
        if (errJson?.error) {
          errorDetail = errJson.error;
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

    const data = (await response.json()) as {
      model?: string;
      created_at?: string;
      message?: { role?: string; content?: string };
      prompt_eval_count?: number;
      eval_count?: number;
      done_reason?: string;
    };

    const content = data.message?.content ?? "";
    const promptText = request.messages
      .map((m) => (typeof m.content === "string" ? m.content : ""))
      .join(" ");

    const promptTokens =
      data.prompt_eval_count ?? estimateTokens(promptText);
    const completionTokens = data.eval_count ?? estimateTokens(content);

    return {
      id: generateRequestId("chatcmpl"),
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: request.model,
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content,
          },
          finish_reason: data.done_reason === "length" ? "length" : "stop",
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

    const options: Record<string, unknown> = {};
    if (request.temperature !== undefined) {
      options.temperature = request.temperature;
    }
    if (request.top_p !== undefined) {
      options.top_p = request.top_p;
    }
    if (maxTokens !== undefined) {
      options.num_predict = maxTokens;
    }

    const payload = {
      model: request.model,
      messages: request.messages.map((m) => ({
        role: m.role === "developer" ? "system" : m.role,
        content: typeof m.content === "string" ? m.content : "",
      })),
      stream: true,
      ...(Object.keys(options).length > 0 ? { options } : {}),
    };

    const response = await this.fetchWithTimeout(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok || !response.body) {
      throw new ProviderError(
        `Ollama streaming failed with HTTP ${response.status}`,
        response.status >= 400 && response.status < 600 ? response.status : 502,
        "provider_stream_error"
      );
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    const streamId = generateRequestId("chatcmpl");
    const created = Math.floor(Date.now() / 1000);
    let sentRole = false;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const rawLine of lines) {
          const line = rawLine.trim();
          if (!line) continue;

          try {
            const parsed = JSON.parse(line) as {
              message?: { content?: string };
              done?: boolean;
            };

            const chunk: ChatCompletionChunk = {
              id: streamId,
              object: "chat.completion.chunk",
              created,
              model: request.model,
              choices: [
                {
                  index: 0,
                  delta: {
                    ...(!sentRole ? { role: "assistant" } : {}),
                    ...(parsed.message?.content !== undefined
                      ? { content: parsed.message.content }
                      : {}),
                  },
                  finish_reason: parsed.done ? "stop" : null,
                },
              ],
            };
            sentRole = true;
            yield JSON.stringify(chunk);
          } catch {
            // Skip malformed NDJSON line
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
        message: `Connected to Ollama (${models.length} installed models detected)`,
      };
    } catch (err) {
      const latency = Date.now() - start;
      return {
        connected: false,
        latency_ms: latency,
        models: [],
        message:
          err instanceof Error ? err.message : "Failed to connect to Ollama",
      };
    }
  }
}
