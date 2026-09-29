import fs from "fs";
import path from "path";
import crypto from "crypto";
import { Pool } from "pg";
import type {
  UserRecord,
  ApiKeyRecord,
  ProviderRecord,
  ModelRecord,
  UsageLogRecord,
  GatewaySettings,
  DashboardSummary,
} from "@/types";

export interface LocalDatabaseState {
  users: UserRecord[];
  api_keys: ApiKeyRecord[];
  providers: ProviderRecord[];
  models: ModelRecord[];
  usage_logs: UsageLogRecord[];
  gateway_settings: GatewaySettings;
}

const DEFAULT_ADMIN_USER_ID = "00000000-0000-0000-0000-000000000001";

function createInitialState(): LocalDatabaseState {
  const now = new Date().toISOString();
  const geminiUrl =
    process.env.GEMINI_WEB2API_BASE_URL || "http://localhost:8081/v1";
  const ollamaUrl = process.env.OLLAMA_BASE_URL || "http://localhost:11434";

  return {
    users: [
      {
        id: DEFAULT_ADMIN_USER_ID,
        email: "admin@local.gateway",
        created_at: now,
        updated_at: now,
      },
    ],
    api_keys:
      process.env.NODE_ENV === "test"
        ? []
        : [
            {
              id: "b33432e6-fb97-45fa-bc4f-20a7a2acacca",
              user_id: DEFAULT_ADMIN_USER_ID,
              name: "demo",
              key_prefix: "sk_live_99QW",
              key_hash:
                "3b1ecb6bdf3ea86b2d584d5490d1174348e1b57b3f0d5f71edb2838d3568ddd5",
              created_at: now,
              last_used_at: now,
              revoked_at: null,
              request_count: 14,
            },
          ],
    providers: [
      {
        id: "gemini",
        name: "Gemini Web2API",
        type: "gemini",
        base_url: geminiUrl,
        enabled: true,
        timeout_ms: 0,
        created_at: now,
        updated_at: now,
      },
      {
        id: "ollama",
        name: "Ollama Cloud",
        type: "ollama",
        base_url: ollamaUrl,
        enabled: true,
        timeout_ms: 0,
        created_at: now,
        updated_at: now,
      },
    ],
    models: [
      {
        id: "10000000-0000-0000-0000-000000000001",
        public_id: "gemini-fast",
        name: "Gemini Fast (3.6 Flash)",
        provider_id: "gemini",
        provider_model: "gemini-3.6-flash",
        type: "chat",
        enabled: true,
        description: "Fast general-purpose Gemini model via Gemini Web2API",
        created_at: now,
        updated_at: now,
      },
      {
        id: "10000000-0000-0000-0000-000000000002",
        public_id: "gemini-pro",
        name: "Gemini Pro (3.1 Pro)",
        provider_id: "gemini",
        provider_model: "gemini-3.1-pro",
        type: "reasoning",
        enabled: true,
        description: "Advanced reasoning & coding model via Gemini Web2API",
        created_at: now,
        updated_at: now,
      },
      {
        id: "10000000-0000-0000-0000-000000000003",
        public_id: "gemini-thinking",
        name: "Gemini Flash Thinking",
        provider_id: "gemini",
        provider_model: "gemini-3.5-flash-thinking",
        type: "reasoning",
        enabled: true,
        description: "Extended deep-thinking mode (~20k chars output)",
        created_at: now,
        updated_at: now,
      },
      {
        id: "81400e76-d6d2-4951-b006-36d8fa105601",
        public_id: "gemini-3.7-flash",
        name: "gemini-3.7-flash (Gemini Web2API)",
        provider_id: "gemini",
        provider_model: "gemini-3.7-flash",
        type: "chat",
        enabled: true,
        description: "Auto-synced from Gemini Web2API",
        created_at: now,
        updated_at: now,
      },
      {
        id: "9fd81cdd-cf47-4282-bdc6-d85ece464ec3",
        public_id: "gemini-3.6-flash",
        name: "gemini-3.6-flash (Gemini Web2API)",
        provider_id: "gemini",
        provider_model: "gemini-3.6-flash",
        type: "chat",
        enabled: true,
        description: "Auto-synced from Gemini Web2API",
        created_at: now,
        updated_at: now,
      },
      {
        id: "53587339-b24d-4b16-9606-67392308b1bb",
        public_id: "gemini-3.5-flash",
        name: "gemini-3.5-flash (Gemini Web2API)",
        provider_id: "gemini",
        provider_model: "gemini-3.5-flash",
        type: "chat",
        enabled: true,
        description: "Auto-synced from Gemini Web2API",
        created_at: now,
        updated_at: now,
      },
      {
        id: "098313a8-2592-4599-b006-94d1197dd6e6",
        public_id: "gemini-3.5-flash-thinking",
        name: "gemini-3.5-flash-thinking (Gemini Web2API)",
        provider_id: "gemini",
        provider_model: "gemini-3.5-flash-thinking",
        type: "reasoning",
        enabled: true,
        description: "Auto-synced from Gemini Web2API",
        created_at: now,
        updated_at: now,
      },
      {
        id: "5d388b76-46ea-4100-9be0-1db7fd3c5f18",
        public_id: "gemini-3.1-pro",
        name: "gemini-3.1-pro (Gemini Web2API)",
        provider_id: "gemini",
        provider_model: "gemini-3.1-pro",
        type: "reasoning",
        enabled: true,
        description: "Auto-synced from Gemini Web2API",
        created_at: now,
        updated_at: now,
      },
      {
        id: "d98b11ae-7d83-4274-9618-a9b8eb15d24c",
        public_id: "gemini-3.1-pro-enhanced",
        name: "gemini-3.1-pro-enhanced (Gemini Web2API)",
        provider_id: "gemini",
        provider_model: "gemini-3.1-pro-enhanced",
        type: "reasoning",
        enabled: true,
        description: "Auto-synced from Gemini Web2API",
        created_at: now,
        updated_at: now,
      },
      {
        id: "a8eb493a-1b7c-414b-9e6d-2960be107f55",
        public_id: "gemini-auto",
        name: "gemini-auto (Gemini Web2API)",
        provider_id: "gemini",
        provider_model: "gemini-auto",
        type: "chat",
        enabled: true,
        description: "Auto-synced from Gemini Web2API",
        created_at: now,
        updated_at: now,
      },
      {
        id: "18d36f1a-61e5-4f5a-8e34-c26e373a86b3",
        public_id: "gemini-3.5-flash-thinking-lite",
        name: "gemini-3.5-flash-thinking-lite (Gemini Web2API)",
        provider_id: "gemini",
        provider_model: "gemini-3.5-flash-thinking-lite",
        type: "reasoning",
        enabled: true,
        description: "Auto-synced from Gemini Web2API",
        created_at: now,
        updated_at: now,
      },
      {
        id: "89bf1e22-3d95-4b1e-958a-7f8e34a1c922",
        public_id: "gemini-flash-lite",
        name: "gemini-flash-lite (Gemini Web2API)",
        provider_id: "gemini",
        provider_model: "gemini-flash-lite",
        type: "chat",
        enabled: true,
        description: "Auto-synced from Gemini Web2API",
        created_at: now,
        updated_at: now,
      },
      {
        id: "10000000-0000-0000-0000-000000000004",
        public_id: "gemma4:31b-cloud",
        name: "Gemma 4 31B Cloud (Ollama)",
        provider_id: "ollama",
        provider_model: "gemma4:31b-cloud",
        type: "chat",
        enabled: true,
        description: "Free-tier Ollama Cloud model",
        created_at: now,
        updated_at: now,
      },
      {
        id: "10000000-0000-0000-0000-000000000005",
        public_id: "gpt-oss:120b-cloud",
        name: "GPT-OSS 120B Cloud (Ollama)",
        provider_id: "ollama",
        provider_model: "gpt-oss:120b-cloud",
        type: "reasoning",
        enabled: true,
        description: "Free-tier Ollama Cloud 120B reasoning model",
        created_at: now,
        updated_at: now,
      },
      {
        id: "10000000-0000-0000-0000-000000000006",
        public_id: "gpt-oss:20b-cloud",
        name: "GPT-OSS 20B Cloud (Ollama)",
        provider_id: "ollama",
        provider_model: "gpt-oss:20b-cloud",
        type: "reasoning",
        enabled: true,
        description: "Free-tier Ollama Cloud 20B model",
        created_at: now,
        updated_at: now,
      },
      {
        id: "10000000-0000-0000-0000-000000000007",
        public_id: "nemotron-3-nano:30b-cloud",
        name: "Nemotron 3 Nano 30B Cloud (Ollama)",
        provider_id: "ollama",
        provider_model: "nemotron-3-nano:30b-cloud",
        type: "chat",
        enabled: true,
        description: "Free-tier Ollama Cloud Nemotron 30B model",
        created_at: now,
        updated_at: now,
      },
      {
        id: "10000000-0000-0000-0000-000000000008",
        public_id: "disabled-test-model",
        name: "Disabled Model Route",
        provider_id: "ollama",
        provider_model: "disabled:latest",
        type: "chat",
        enabled: false,
        description: "Disabled route for testing",
        created_at: now,
        updated_at: now,
      },
    ],
    usage_logs: [],
    gateway_settings: {
      id: "default",
      default_model: "gemini-fast",
      request_timeout_ms: 0,
      logging_enabled: true,
      rate_limit_rpm: 120,
      max_request_bytes: 1048576,
      cors_origins: "*",
      ip_allowlist: "*",
      strict_security_headers: true,
      totp_enabled: false,
      totp_secret: null,
      updated_at: now,
    },
  };
}

let pgPool: Pool | null = null;
let pgInitialized = false;
let pgUnreachable = false;
let memoryState: LocalDatabaseState | null = null;

function isPostgresConfigured(): boolean {
  if (pgUnreachable || process.env.NODE_ENV === "test") return false;
  const url = process.env.DATABASE_URL?.trim();
  return Boolean(
    url && (url.startsWith("postgres://") || url.startsWith("postgresql://"))
  );
}

function getLocalDbFilePath(): string {
  const dataDir = path.join(process.cwd(), ".data");
  return path.join(dataDir, "gateway-db.json");
}

function loadLocalState(): LocalDatabaseState {
  if (process.env.NODE_ENV === "test") {
    if (!memoryState) {
      memoryState = createInitialState();
    }
    return memoryState;
  }

  const filePath = getLocalDbFilePath();
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, "utf-8");
      const parsed = JSON.parse(raw) as LocalDatabaseState;
      return parsed;
    }
  } catch {
    // Fallback to initial state if corrupted
  }

  const initial = createInitialState();
  saveLocalState(initial);
  return initial;
}

function saveLocalState(state: LocalDatabaseState): void {
  if (process.env.NODE_ENV === "test") {
    memoryState = state;
    return;
  }

  const filePath = getLocalDbFilePath();
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2), "utf-8");
}

async function getPgPool(): Promise<Pool | null> {
  if (!isPostgresConfigured()) return null;
  try {
    if (!pgPool) {
      pgPool = new Pool({
        connectionString: process.env.DATABASE_URL,
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 4000,
      });
    }
    if (!pgInitialized) {
      const migrationPath = path.join(
        process.cwd(),
        "supabase",
        "migrations",
        "001_initial_schema.sql"
      );
      if (fs.existsSync(migrationPath)) {
        const sql = fs.readFileSync(migrationPath, "utf-8");
        await pgPool.query(sql);
      } else {
        await pgPool.query("SELECT 1");
      }
      pgInitialized = true;
    }
    return pgPool;
  } catch (err) {
    console.warn(
      "[db] PostgreSQL direct connection unreachable (falling back to local persistent store):",
      err instanceof Error ? err.message : String(err)
    );
    pgUnreachable = true;
    return null;
  }
}

export const db = {
  resetForTests(): void {
    memoryState = createInitialState();
  },

  getStorageEngine(): "postgresql" | "local_file" {
    return isPostgresConfigured() ? "postgresql" : "local_file";
  },

  async getDefaultUser(): Promise<UserRecord> {
    const pool = await getPgPool();
    if (pool) {
      const res = await pool.query<UserRecord>(
        "SELECT * FROM users ORDER BY created_at ASC LIMIT 1"
      );
      return res.rows[0];
    }
    const state = loadLocalState();
    return state.users[0];
  },

  // --- API Keys ---
  async listApiKeys(): Promise<ApiKeyRecord[]> {
    const pool = await getPgPool();
    if (pool) {
      const res = await pool.query<ApiKeyRecord>(
        "SELECT * FROM api_keys ORDER BY created_at DESC"
      );
      return res.rows;
    }
    const state = loadLocalState();
    return [...state.api_keys].sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  },

  async findApiKeyByHash(keyHash: string): Promise<ApiKeyRecord | null> {
    const pool = await getPgPool();
    if (pool) {
      const res = await pool.query<ApiKeyRecord>(
        "SELECT * FROM api_keys WHERE key_hash = $1 LIMIT 1",
        [keyHash]
      );
      return res.rows[0] || null;
    }
    const state = loadLocalState();
    const targetBuf = Buffer.from(keyHash, "utf8");
    return (
      state.api_keys.find((k) => {
        const buf = Buffer.from(k.key_hash, "utf8");
        return (
          buf.length === targetBuf.length &&
          crypto.timingSafeEqual(buf, targetBuf)
        );
      }) || null
    );
  },

  async createApiKey(params: {
    name: string;
    key_prefix: string;
    key_hash: string;
    user_id?: string;
  }): Promise<ApiKeyRecord> {
    const userId = params.user_id || DEFAULT_ADMIN_USER_ID;
    const pool = await getPgPool();
    if (pool) {
      const res = await pool.query<ApiKeyRecord>(
        `INSERT INTO api_keys (user_id, name, key_prefix, key_hash)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [userId, params.name, params.key_prefix, params.key_hash]
      );
      return res.rows[0];
    }
    const state = loadLocalState();
    const record: ApiKeyRecord = {
      id: crypto.randomUUID(),
      user_id: userId,
      name: params.name,
      key_prefix: params.key_prefix,
      key_hash: params.key_hash,
      created_at: new Date().toISOString(),
      last_used_at: null,
      revoked_at: null,
      request_count: 0,
    };
    state.api_keys.unshift(record);
    saveLocalState(state);
    return record;
  },

  async revokeApiKey(id: string): Promise<ApiKeyRecord | null> {
    const now = new Date().toISOString();
    const pool = await getPgPool();
    if (pool) {
      const res = await pool.query<ApiKeyRecord>(
        `UPDATE api_keys SET revoked_at = $1 WHERE id = $2 RETURNING *`,
        [now, id]
      );
      return res.rows[0] || null;
    }
    const state = loadLocalState();
    const target = state.api_keys.find((k) => k.id === id);
    if (!target) return null;
    target.revoked_at = now;
    saveLocalState(state);
    return target;
  },

  async deleteApiKey(id: string): Promise<boolean> {
    const pool = await getPgPool();
    if (pool) {
      const res = await pool.query(`DELETE FROM api_keys WHERE id = $1`, [id]);
      return (res.rowCount ?? 0) > 0;
    }
    const state = loadLocalState();
    const before = state.api_keys.length;
    state.api_keys = state.api_keys.filter((k) => k.id !== id);
    if (state.api_keys.length !== before) {
      saveLocalState(state);
      return true;
    }
    return false;
  },

  async recordApiKeyUsage(id: string): Promise<void> {
    const now = new Date().toISOString();
    const pool = await getPgPool();
    if (pool) {
      await pool.query(
        `UPDATE api_keys
         SET last_used_at = $1, request_count = request_count + 1
         WHERE id = $2`,
        [now, id]
      );
      return;
    }
    const state = loadLocalState();
    const target = state.api_keys.find((k) => k.id === id);
    if (target) {
      target.last_used_at = now;
      target.request_count += 1;
      saveLocalState(state);
    }
  },

  // --- Providers ---
  async listProviders(): Promise<ProviderRecord[]> {
    const pool = await getPgPool();
    if (pool) {
      const res = await pool.query<ProviderRecord>(
        "SELECT * FROM providers ORDER BY created_at ASC"
      );
      return res.rows;
    }
    const state = loadLocalState();
    return state.providers;
  },

  async getProviderById(id: string): Promise<ProviderRecord | null> {
    const pool = await getPgPool();
    if (pool) {
      const res = await pool.query<ProviderRecord>(
        "SELECT * FROM providers WHERE id = $1 LIMIT 1",
        [id]
      );
      return res.rows[0] || null;
    }
    const state = loadLocalState();
    return state.providers.find((p) => p.id === id) || null;
  },

  async updateProvider(
    id: string,
    updates: Partial<Pick<ProviderRecord, "name" | "base_url" | "enabled" | "timeout_ms">>
  ): Promise<ProviderRecord | null> {
    const now = new Date().toISOString();
    const pool = await getPgPool();
    if (pool) {
      const existing = await this.getProviderById(id);
      if (!existing) return null;
      const res = await pool.query<ProviderRecord>(
        `UPDATE providers
         SET name = $1, base_url = $2, enabled = $3, timeout_ms = $4, updated_at = $5
         WHERE id = $6
         RETURNING *`,
        [
          updates.name ?? existing.name,
          updates.base_url ?? existing.base_url,
          updates.enabled ?? existing.enabled,
          updates.timeout_ms ?? existing.timeout_ms,
          now,
          id,
        ]
      );
      return res.rows[0] || null;
    }
    const state = loadLocalState();
    const provider = state.providers.find((p) => p.id === id);
    if (!provider) return null;
    if (updates.name !== undefined) provider.name = updates.name;
    if (updates.base_url !== undefined) provider.base_url = updates.base_url;
    if (updates.enabled !== undefined) provider.enabled = updates.enabled;
    if (updates.timeout_ms !== undefined) provider.timeout_ms = updates.timeout_ms;
    provider.updated_at = now;
    saveLocalState(state);
    return provider;
  },

  // --- Models ---
  async listModels(onlyEnabled = false): Promise<ModelRecord[]> {
    const pool = await getPgPool();
    if (pool) {
      const query = onlyEnabled
        ? "SELECT * FROM models WHERE enabled = TRUE ORDER BY created_at ASC"
        : "SELECT * FROM models ORDER BY created_at ASC";
      const res = await pool.query<ModelRecord>(query);
      return res.rows;
    }
    const state = loadLocalState();
    return onlyEnabled
      ? state.models.filter((m) => m.enabled)
      : state.models;
  },

  async getModelByPublicId(publicId: string): Promise<ModelRecord | null> {
    const pool = await getPgPool();
    if (pool) {
      const res = await pool.query<ModelRecord>(
        "SELECT * FROM models WHERE public_id = $1 LIMIT 1",
        [publicId]
      );
      return res.rows[0] || null;
    }
    const state = loadLocalState();
    return state.models.find((m) => m.public_id === publicId) || null;
  },

  async getModelById(id: string): Promise<ModelRecord | null> {
    const pool = await getPgPool();
    if (pool) {
      const res = await pool.query<ModelRecord>(
        "SELECT * FROM models WHERE id = $1 LIMIT 1",
        [id]
      );
      return res.rows[0] || null;
    }
    const state = loadLocalState();
    return state.models.find((m) => m.id === id) || null;
  },

  async createModel(params: {
    public_id: string;
    name: string;
    provider_id: string;
    provider_model: string;
    type?: "chat" | "completion" | "reasoning";
    enabled?: boolean;
    description?: string;
  }): Promise<ModelRecord> {
    const now = new Date().toISOString();
    const pool = await getPgPool();
    if (pool) {
      const res = await pool.query<ModelRecord>(
        `INSERT INTO models (public_id, name, provider_id, provider_model, type, enabled, description)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [
          params.public_id,
          params.name,
          params.provider_id,
          params.provider_model,
          params.type || "chat",
          params.enabled ?? true,
          params.description || "",
        ]
      );
      return res.rows[0];
    }
    const state = loadLocalState();
    if (state.models.some((m) => m.public_id === params.public_id)) {
      throw new Error(`Model with public ID '${params.public_id}' already exists`);
    }
    const record: ModelRecord = {
      id: crypto.randomUUID(),
      public_id: params.public_id,
      name: params.name,
      provider_id: params.provider_id,
      provider_model: params.provider_model,
      type: params.type || "chat",
      enabled: params.enabled ?? true,
      description: params.description || "",
      created_at: now,
      updated_at: now,
    };
    state.models.push(record);
    saveLocalState(state);
    return record;
  },

  async updateModel(
    id: string,
    updates: Partial<
      Pick<
        ModelRecord,
        | "public_id"
        | "name"
        | "provider_id"
        | "provider_model"
        | "type"
        | "enabled"
        | "description"
      >
    >
  ): Promise<ModelRecord | null> {
    const now = new Date().toISOString();
    const pool = await getPgPool();
    if (pool) {
      const existing = await this.getModelById(id);
      if (!existing) return null;
      const res = await pool.query<ModelRecord>(
        `UPDATE models
         SET public_id = $1, name = $2, provider_id = $3, provider_model = $4,
             type = $5, enabled = $6, description = $7, updated_at = $8
         WHERE id = $9
         RETURNING *`,
        [
          updates.public_id ?? existing.public_id,
          updates.name ?? existing.name,
          updates.provider_id ?? existing.provider_id,
          updates.provider_model ?? existing.provider_model,
          updates.type ?? existing.type,
          updates.enabled ?? existing.enabled,
          updates.description ?? existing.description,
          now,
          id,
        ]
      );
      return res.rows[0] || null;
    }
    const state = loadLocalState();
    const model = state.models.find((m) => m.id === id);
    if (!model) return null;
    if (
      updates.public_id &&
      updates.public_id !== model.public_id &&
      state.models.some((m) => m.public_id === updates.public_id)
    ) {
      throw new Error(`Model with public ID '${updates.public_id}' already exists`);
    }
    Object.assign(model, updates, { updated_at: now });
    saveLocalState(state);
    return model;
  },

  async deleteModel(id: string): Promise<boolean> {
    const pool = await getPgPool();
    if (pool) {
      const res = await pool.query("DELETE FROM models WHERE id = $1", [id]);
      return (res.rowCount ?? 0) > 0;
    }
    const state = loadLocalState();
    const initialLen = state.models.length;
    state.models = state.models.filter((m) => m.id !== id);
    if (state.models.length !== initialLen) {
      saveLocalState(state);
      return true;
    }
    return false;
  },

  // --- Usage Logs ---
  async insertUsageLog(
    entry: Omit<UsageLogRecord, "id" | "created_at">
  ): Promise<UsageLogRecord> {
    const now = new Date().toISOString();
    const pool = await getPgPool();
    if (pool) {
      const res = await pool.query<UsageLogRecord>(
        `INSERT INTO usage_logs (
          request_id, api_key_id, model, provider, status_code,
          latency_ms, prompt_tokens, completion_tokens, total_tokens,
          is_stream, error_code
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        RETURNING *`,
        [
          entry.request_id,
          entry.api_key_id,
          entry.model,
          entry.provider,
          entry.status_code,
          entry.latency_ms,
          entry.prompt_tokens,
          entry.completion_tokens,
          entry.total_tokens,
          entry.is_stream,
          entry.error_code,
        ]
      );
      return res.rows[0];
    }
    const state = loadLocalState();
    const record: UsageLogRecord = {
      id: crypto.randomUUID(),
      ...entry,
      created_at: now,
    };
    state.usage_logs.unshift(record);
    // Keep up to 2000 logs locally
    if (state.usage_logs.length > 2000) {
      state.usage_logs = state.usage_logs.slice(0, 2000);
    }
    saveLocalState(state);
    return record;
  },

  async listUsageLogs(limit = 100): Promise<UsageLogRecord[]> {
    const pool = await getPgPool();
    if (pool) {
      const res = await pool.query<UsageLogRecord>(
        `SELECT u.*, k.name AS api_key_name
         FROM usage_logs u
         LEFT JOIN api_keys k ON u.api_key_id = k.id
         ORDER BY u.created_at DESC
         LIMIT $1`,
        [limit]
      );
      return res.rows;
    }
    const state = loadLocalState();
    const keyMap = new Map(state.api_keys.map((k) => [k.id, k.name]));
    return state.usage_logs.slice(0, limit).map((log) => ({
      ...log,
      api_key_name: log.api_key_id ? keyMap.get(log.api_key_id) : undefined,
    }));
  },

  // --- Settings ---
  async getSettings(): Promise<GatewaySettings> {
    const pool = await getPgPool();
    if (pool) {
      const res = await pool.query<GatewaySettings>(
        "SELECT * FROM gateway_settings WHERE id = 'default' LIMIT 1"
      );
      return res.rows[0];
    }
    const state = loadLocalState();
    return state.gateway_settings;
  },

  async updateSettings(
    updates: Partial<
      Omit<GatewaySettings, "id" | "updated_at">
    >
  ): Promise<GatewaySettings> {
    const now = new Date().toISOString();
    const pool = await getPgPool();
    if (pool) {
      const current = await this.getSettings();
      const res = await pool.query<GatewaySettings>(
        `UPDATE gateway_settings
         SET default_model = $1,
             request_timeout_ms = $2,
             logging_enabled = $3,
             rate_limit_rpm = $4,
             max_request_bytes = $5,
             cors_origins = $6,
             ip_allowlist = $7,
             strict_security_headers = $8,
             totp_enabled = $9,
             totp_secret = $10,
             updated_at = $11
         WHERE id = 'default'
         RETURNING *`,
        [
          updates.default_model ?? current.default_model,
          updates.request_timeout_ms ?? current.request_timeout_ms,
          updates.logging_enabled ?? current.logging_enabled,
          updates.rate_limit_rpm ?? current.rate_limit_rpm,
          updates.max_request_bytes ?? current.max_request_bytes,
          updates.cors_origins ?? current.cors_origins,
          updates.ip_allowlist ?? current.ip_allowlist ?? "*",
          updates.strict_security_headers ?? current.strict_security_headers ?? true,
          updates.totp_enabled ?? current.totp_enabled ?? false,
          updates.totp_secret !== undefined ? updates.totp_secret : (current.totp_secret ?? null),
          now,
        ]
      );
      return res.rows[0];
    }
    const state = loadLocalState();
    state.gateway_settings = {
      ...state.gateway_settings,
      ...updates,
      updated_at: now,
    };
    saveLocalState(state);
    return state.gateway_settings;
  },

  // --- Dashboard Summary ---
  async getDashboardSummary(): Promise<DashboardSummary> {
    const [keys, models, providers, logs] = await Promise.all([
      this.listApiKeys(),
      this.listModels(),
      this.listProviders(),
      this.listUsageLogs(200),
    ]);

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const requestsToday = logs.filter(
      (l) => new Date(l.created_at).getTime() >= startOfToday.getTime()
    ).length;

    const totalFromKeys = keys.reduce((acc, k) => acc + k.request_count, 0);
    const totalRequests = Math.max(totalFromKeys, logs.length);

    const activeApiKeys = keys.filter((k) => !k.revoked_at).length;
    const enabledModels = models.filter((m) => m.enabled).length;

    const avgLatencyMs =
      logs.length > 0
        ? Math.round(
            logs.reduce((acc, l) => acc + l.latency_ms, 0) / logs.length
          )
        : 0;

    const successCount = logs.filter(
      (l) => l.status_code >= 200 && l.status_code < 400
    ).length;
    const successRate =
      logs.length > 0 ? Math.round((successCount / logs.length) * 100) : 100;

    return {
      total_requests: totalRequests,
      requests_today: requestsToday,
      active_api_keys: activeApiKeys,
      enabled_models: enabledModels,
      avg_latency_ms: avgLatencyMs,
      success_rate: successRate,
      providers: providers.map((p) => ({
        id: p.id,
        name: p.name,
        type: p.type,
        base_url: p.base_url,
        enabled: p.enabled,
      })),
      recent_requests: logs.slice(0, 10),
    };
  },
};
