import type {
  ChatCompletionRequest,
  ChatCompletionResponse,
} from "@/types";

export interface ProviderModelInfo {
  id: string;
  name?: string;
  owned_by?: string;
}

export interface ProviderConnectionTestResult {
  connected: boolean;
  latency_ms: number;
  models: ProviderModelInfo[];
  message: string;
}

export class ProviderError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly type:
    | "provider_error"
    | "invalid_request_error"
    | "rate_limit_error";

  constructor(
    message: string,
    statusCode = 502,
    code = "provider_unavailable",
    type:
      | "provider_error"
      | "invalid_request_error"
      | "rate_limit_error" = "provider_error"
  ) {
    super(message);
    this.name = "ProviderError";
    this.statusCode = statusCode;
    this.code = code;
    this.type = type;
  }
}

export interface AIProvider {
  id: string;
  name: string;

  listModels(): Promise<ProviderModelInfo[]>;

  chatCompletion(
    request: ChatCompletionRequest
  ): Promise<ChatCompletionResponse>;

  streamChatCompletion(
    request: ChatCompletionRequest
  ): AsyncIterable<string>;

  testConnection(): Promise<ProviderConnectionTestResult>;
}
