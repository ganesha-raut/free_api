import { db } from "@/lib/db";
import type { UsageLogRecord } from "@/types";

export interface TrackUsageInput {
  request_id: string;
  api_key_id: string | null;
  model: string;
  provider: string;
  status_code: number;
  latency_ms: number;
  prompt_tokens?: number | null;
  completion_tokens?: number | null;
  total_tokens?: number | null;
  is_stream?: boolean;
  error_code?: string | null;
}

/**
 * Privacy-first usage tracking:
 * Records request metadata, latency, status, and token counts.
 * Never logs or persists full prompt or response content.
 */
export async function recordGatewayUsage(
  input: TrackUsageInput
): Promise<UsageLogRecord | null> {
  if (input.api_key_id) {
    await db.recordApiKeyUsage(input.api_key_id);
  }

  const settings = await db.getSettings();
  if (!settings.logging_enabled) {
    return null;
  }

  return db.insertUsageLog({
    request_id: input.request_id,
    api_key_id: input.api_key_id,
    model: input.model,
    provider: input.provider,
    status_code: input.status_code,
    latency_ms: Math.max(0, Math.round(input.latency_ms)),
    prompt_tokens: input.prompt_tokens ?? null,
    completion_tokens: input.completion_tokens ?? null,
    total_tokens: input.total_tokens ?? null,
    is_stream: Boolean(input.is_stream),
    error_code: input.error_code ?? null,
  });
}
