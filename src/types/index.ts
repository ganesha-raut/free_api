export interface UserRecord {
  id: string;
  email: string;
  created_at: string;
  updated_at: string;
}

export interface ApiKeyRecord {
  id: string;
  user_id: string;
  name: string;
  key_prefix: string;
  key_hash: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
  request_count: number;
}

export interface PublicApiKey {
  id: string;
  user_id: string;
  name: string;
  key_prefix: string;
  masked_key: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
  request_count: number;
  status: "active" | "revoked";
}

export type ProviderType =
  | "gemini"
  | "ollama"
  | "openai_compatible";

export interface ProviderRecord {
  id: string;
  name: string;
  type: ProviderType;
  base_url: string;
  enabled: boolean;
  timeout_ms: number;
  created_at: string;
  updated_at: string;
}

export interface ModelRecord {
  id: string;
  public_id: string;
  name: string;
  provider_id: string;
  provider_model: string;
  type: "chat" | "completion" | "reasoning";
  enabled: boolean;
  description: string;
  created_at: string;
  updated_at: string;
}

export interface UsageLogRecord {
  id: string;
  request_id: string;
  api_key_id: string | null;
  api_key_name?: string;
  model: string;
  provider: string;
  status_code: number;
  latency_ms: number;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  is_stream: boolean;
  error_code: string | null;
  created_at: string;
}

export interface GatewaySettings {
  id: string;
  default_model: string;
  request_timeout_ms: number;
  logging_enabled: boolean;
  rate_limit_rpm: number;
  max_request_bytes: number;
  cors_origins: string;
  ip_allowlist?: string;
  strict_security_headers?: boolean;
  totp_enabled?: boolean;
  totp_secret?: string | null;
  updated_at: string;
}

// OpenAI-compatible types
export interface ChatMessage {
  role: "system" | "developer" | "user" | "assistant" | "tool";
  content: string | Array<{ type: string; text?: string; [key: string]: unknown }>;
  name?: string;
  tool_call_id?: string;
  tool_calls?: unknown[];
}

export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  max_completion_tokens?: number;
  stream?: boolean;
  stop?: string | string[];
  presence_penalty?: number;
  frequency_penalty?: number;
  user?: string;
}

export interface ChatCompletionChoice {
  index: number;
  message: {
    role: "assistant";
    content: string | null;
    tool_calls?: unknown[];
  };
  finish_reason: "stop" | "length" | "tool_calls" | "content_filter" | null;
}

export interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface ChatCompletionResponse {
  id: string;
  object: "chat.completion";
  created: number;
  model: string;
  choices: ChatCompletionChoice[];
  usage?: TokenUsage;
}

export interface ChatCompletionStreamChoice {
  index: number;
  delta: {
    role?: "assistant";
    content?: string;
    tool_calls?: unknown[];
  };
  finish_reason: "stop" | "length" | "tool_calls" | null;
}

export interface ChatCompletionChunk {
  id: string;
  object: "chat.completion.chunk";
  created: number;
  model: string;
  choices: ChatCompletionStreamChoice[];
  usage?: TokenUsage;
}

export interface OpenAIModelObject {
  id: string;
  object: "model";
  created: number;
  owned_by: string;
}

export interface OpenAIModelListResponse {
  object: "list";
  data: OpenAIModelObject[];
}

export interface OpenAIErrorPayload {
  error: {
    message: string;
    type:
      | "authentication_error"
      | "invalid_request_error"
      | "rate_limit_error"
      | "provider_error"
      | "not_found_error"
      | "internal_error";
    param?: string | null;
    code: string;
  };
}

export interface DashboardSummary {
  total_requests: number;
  requests_today: number;
  active_api_keys: number;
  enabled_models: number;
  avg_latency_ms: number;
  success_rate: number;
  providers: Array<{
    id: string;
    name: string;
    type: ProviderType;
    base_url: string;
    enabled: boolean;
  }>;
  recent_requests: UsageLogRecord[];
}
