import type { ProviderRecord } from "@/types";
import type { AIProvider } from "@/lib/providers/provider.interface";
import { GeminiWeb2APIProvider } from "@/lib/providers/gemini";
import { OllamaProvider } from "@/lib/providers/ollama";

/**
 * Factory for creating an AIProvider instance from a database ProviderRecord.
 * Designed so additional providers (OpenAI, Anthropic, Groq, OpenRouter, Ollama Cloud)
 * can be added cleanly without changing the API gateway or router.
 */
export function createProviderInstance(
  record: ProviderRecord,
  overrideTimeoutMs?: number
): AIProvider {
  const timeoutMs = overrideTimeoutMs || record.timeout_ms || 60000;

  switch (record.type) {
    case "gemini":
      return new GeminiWeb2APIProvider({
        id: record.id,
        name: record.name,
        baseUrl: record.base_url,
        timeoutMs,
      });

    case "ollama":
      return new OllamaProvider({
        id: record.id,
        name: record.name,
        baseUrl: record.base_url,
        timeoutMs,
      });

    case "openai_compatible":
    default:
      return new GeminiWeb2APIProvider({
        id: record.id,
        name: record.name,
        baseUrl: record.base_url,
        timeoutMs,
      });
  }
}
