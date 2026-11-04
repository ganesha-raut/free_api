import { db } from "@/lib/db";
import { createProviderInstance } from "@/lib/providers";
import type { AIProvider } from "@/lib/providers/provider.interface";
import type {
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatCompletionChunk,
  ModelRecord,
  ProviderRecord,
} from "@/types";

export class RouterResolutionError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly type: "invalid_request_error" | "not_found_error" | "provider_error";

  constructor(
    message: string,
    statusCode: number,
    code: string,
    type: "invalid_request_error" | "not_found_error" | "provider_error"
  ) {
    super(message);
    this.name = "RouterResolutionError";
    this.statusCode = statusCode;
    this.code = code;
    this.type = type;
  }
}

export interface ResolvedRoute {
  modelRecord: ModelRecord;
  providerRecord: ProviderRecord;
  provider: AIProvider;
}

/**
 * Resolves a client-facing public model ID (e.g. "gemini-fast" or "qwen-local")
 * to its configured AIProvider and internal provider_model identifier.
 * Never leaks internal provider URLs or implementation details to the API client.
 */
export async function resolveModelRoute(
  publicModelId: string
): Promise<ResolvedRoute> {
  let modelRecord = await db.getModelByPublicId(publicModelId);

  // Dynamic Auto-Fetch & Resolution for Gemini and active models
  if (!modelRecord) {
    const isGemini =
      publicModelId.toLowerCase().includes("gemini") ||
      publicModelId.toLowerCase().startsWith("gemini");

    if (isGemini) {
      const geminiProvider = await db.getProviderById("gemini");
      if (geminiProvider && geminiProvider.enabled) {
        try {
          modelRecord = await db.createModel({
            public_id: publicModelId,
            name: `${publicModelId} (Gemini Web2API)`,
            provider_id: "gemini",
            provider_model: publicModelId,
            type: publicModelId.toLowerCase().includes("think")
              ? "reasoning"
              : "chat",
            enabled: true,
            description: "Auto-detected active Gemini model",
          });
        } catch {
          // Fallback if already inserted concurrently
          modelRecord = await db.getModelByPublicId(publicModelId);
        }
      }
    }
  }

  if (!modelRecord) {
    throw new RouterResolutionError(
      `The model '${publicModelId}' does not exist`,
      404,
      "model_not_found",
      "not_found_error"
    );
  }

  if (!modelRecord.enabled) {
    throw new RouterResolutionError(
      `The model '${publicModelId}' is currently disabled`,
      403,
      "model_disabled",
      "invalid_request_error"
    );
  }

  const providerRecord = await db.getProviderById(modelRecord.provider_id);
  if (!providerRecord) {
    throw new RouterResolutionError(
      `Provider for model '${publicModelId}' is not configured`,
      502,
      "provider_not_found",
      "provider_error"
    );
  }

  if (!providerRecord.enabled) {
    throw new RouterResolutionError(
      `The upstream provider for '${publicModelId}' is currently disabled`,
      503,
      "provider_disabled",
      "provider_error"
    );
  }

  const settings = await db.getSettings();
  const effectiveTimeout =
    settings.request_timeout_ms || providerRecord.timeout_ms || 60000;

  const provider = createProviderInstance(providerRecord, effectiveTimeout);

  return {
    modelRecord,
    providerRecord,
    provider,
  };
}

export async function routeChatCompletion(
  request: ChatCompletionRequest
): Promise<{
  response: ChatCompletionResponse;
  route: ResolvedRoute;
}> {
  const route = await resolveModelRoute(request.model);

  // Translate public model ID -> internal provider model ID
  const providerRequest: ChatCompletionRequest = {
    ...request,
    model: route.modelRecord.provider_model,
  };

  const upstreamResponse = await route.provider.chatCompletion(providerRequest);

  // Always return the public model ID to the client
  const response: ChatCompletionResponse = {
    ...upstreamResponse,
    model: route.modelRecord.public_id,
  };

  return { response, route };
}

export async function routeStreamChatCompletion(
  request: ChatCompletionRequest
): Promise<{
  stream: AsyncIterable<string>;
  route: ResolvedRoute;
}> {
  const route = await resolveModelRoute(request.model);

  const providerRequest: ChatCompletionRequest = {
    ...request,
    model: route.modelRecord.provider_model,
  };

  const upstreamStream =
    route.provider.streamChatCompletion(providerRequest);

  async function* rewritePublicModelStream(): AsyncIterable<string> {
    for await (const chunkJson of upstreamStream) {
      try {
        const parsed = JSON.parse(chunkJson) as ChatCompletionChunk;
        parsed.model = route.modelRecord.public_id;
        yield JSON.stringify(parsed);
      } catch {
        yield chunkJson;
      }
    }
  }

  return {
    stream: rewritePublicModelStream(),
    route,
  };
}
