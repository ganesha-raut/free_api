import crypto from "crypto";
import { db } from "@/lib/db";
import type { ApiKeyRecord, PublicApiKey } from "@/types";

export function getApiKeyPrefix(): string {
  return process.env.API_KEY_PREFIX || "sk_live_";
}

export function generateApiKey(customPrefix?: string): {
  rawKey: string;
  keyPrefix: string;
  keyHash: string;
} {
  const prefix = customPrefix || getApiKeyPrefix();
  // Generate 24 random bytes => 32 base64url characters
  const secretPart = crypto
    .randomBytes(24)
    .toString("base64url")
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 28);
  const rawKey = `${prefix}${secretPart}`;
  // Store only prefix + first 4 visible chars for identification, never the full key
  const visiblePrefix = `${prefix}${secretPart.slice(0, 4)}`;
  const keyHash = hashApiKey(rawKey);

  return {
    rawKey,
    keyPrefix: visiblePrefix,
    keyHash,
  };
}

export function hashApiKey(rawKey: string): string {
  return crypto.createHash("sha256").update(rawKey).digest("hex");
}

export function maskApiKey(keyPrefix: string): string {
  const basePrefix = getApiKeyPrefix();
  if (keyPrefix.startsWith(basePrefix)) {
    return `${basePrefix}************`;
  }
  return `${keyPrefix}************`;
}

export function toPublicApiKey(record: ApiKeyRecord): PublicApiKey {
  return {
    id: record.id,
    user_id: record.user_id,
    name: record.name,
    key_prefix: record.key_prefix,
    masked_key: maskApiKey(record.key_prefix),
    created_at: record.created_at,
    last_used_at: record.last_used_at,
    revoked_at: record.revoked_at,
    request_count: record.request_count,
    status: record.revoked_at ? "revoked" : "active",
  };
}

export async function createNewApiKey(name: string): Promise<{
  rawKey: string;
  apiKey: PublicApiKey;
}> {
  const { rawKey, keyPrefix, keyHash } = generateApiKey();
  const record = await db.createApiKey({
    name,
    key_prefix: keyPrefix,
    key_hash: keyHash,
  });

  return {
    rawKey,
    apiKey: toPublicApiKey(record),
  };
}

export type AuthVerificationResult =
  | {
      valid: true;
      apiKey: ApiKeyRecord;
    }
  | {
      valid: false;
      code: "missing_api_key" | "invalid_api_key" | "revoked_api_key";
      message: string;
    };

export async function verifyBearerToken(
  authHeader: string | null
): Promise<AuthVerificationResult> {
  if (!authHeader || !authHeader.trim()) {
    return {
      valid: false,
      code: "missing_api_key",
      message:
        "Missing Authorization header. Expected 'Authorization: Bearer sk_live_...'",
    };
  }

  const match = authHeader.trim().match(/^Bearer\s+(.+)$/i);
  if (!match || !match[1]) {
    return {
      valid: false,
      code: "invalid_api_key",
      message:
        "Malformed Authorization header. Expected 'Authorization: Bearer sk_live_...'",
    };
  }

  const rawToken = match[1].trim();
  if (!rawToken) {
    return {
      valid: false,
      code: "invalid_api_key",
      message: "Invalid API key provided",
    };
  }

  const tokenHash = hashApiKey(rawToken);
  const record = await db.findApiKeyByHash(tokenHash);

  if (!record) {
    return {
      valid: false,
      code: "invalid_api_key",
      message: "Invalid API key provided",
    };
  }

  if (record.revoked_at) {
    return {
      valid: false,
      code: "revoked_api_key",
      message: "This API key has been revoked",
    };
  }

  return {
    valid: true,
    apiKey: record,
  };
}
