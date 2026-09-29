-- Private AI API Gateway & Model Router
-- PostgreSQL / Supabase Migration: 001_initial_schema.sql

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. users table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. api_keys table (Never stores full plaintext API key)
CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  key_hash TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  request_count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys(user_id);

-- 3. providers table
CREATE TABLE IF NOT EXISTS providers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('gemini', 'ollama', 'openai_compatible')),
  base_url TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  timeout_ms INTEGER NOT NULL DEFAULT 60000,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. models table (Model Router Registry)
CREATE TABLE IF NOT EXISTS models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  provider_id TEXT NOT NULL REFERENCES providers(id) ON DELETE RESTRICT,
  provider_model TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'chat' CHECK (type IN ('chat', 'completion', 'reasoning')),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  description TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_models_public_id ON models(public_id);

-- 5. usage_logs table (Privacy-first telemetry: no prompt or completion text stored)
CREATE TABLE IF NOT EXISTS usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id TEXT NOT NULL,
  api_key_id UUID REFERENCES api_keys(id) ON DELETE SET NULL,
  model TEXT NOT NULL,
  provider TEXT NOT NULL,
  status_code INTEGER NOT NULL,
  latency_ms INTEGER NOT NULL,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  total_tokens INTEGER,
  is_stream BOOLEAN NOT NULL DEFAULT FALSE,
  error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_usage_logs_created_at ON usage_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_logs_api_key_id ON usage_logs(api_key_id);

-- 6. gateway_settings table
CREATE TABLE IF NOT EXISTS gateway_settings (
  id TEXT PRIMARY KEY DEFAULT 'default',
  default_model TEXT NOT NULL DEFAULT 'gemini-fast',
  request_timeout_ms INTEGER NOT NULL DEFAULT 60000,
  logging_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  rate_limit_rpm INTEGER NOT NULL DEFAULT 120,
  max_request_bytes INTEGER NOT NULL DEFAULT 1048576,
  cors_origins TEXT NOT NULL DEFAULT '*',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed default admin user
INSERT INTO users (id, email)
VALUES ('00000000-0000-0000-0000-000000000001', 'admin@local.gateway')
ON CONFLICT (email) DO NOTHING;

-- Seed default providers
INSERT INTO providers (id, name, type, base_url, enabled, timeout_ms)
VALUES
  ('gemini', 'Gemini Web2API', 'gemini', 'http://localhost:8081/v1', TRUE, 120000),
  ('ollama', 'Ollama', 'ollama', 'http://localhost:11434', TRUE, 120000)
ON CONFLICT (id) DO NOTHING;

-- Seed default routed models
INSERT INTO models (public_id, name, provider_id, provider_model, type, enabled, description)
VALUES
  ('gemini-fast', 'Gemini Fast (3.6 Flash)', 'gemini', 'gemini-3.6-flash', 'chat', TRUE, 'Fast general-purpose Gemini model via Gemini Web2API'),
  ('gemini-pro', 'Gemini Pro (3.1 Pro)', 'gemini', 'gemini-3.1-pro', 'reasoning', TRUE, 'Advanced reasoning & coding model via Gemini Web2API'),
  ('gemini-thinking', 'Gemini Flash Thinking', 'gemini', 'gemini-3.5-flash-thinking', 'reasoning', TRUE, 'Extended deep-thinking mode (~20k chars output)'),
  ('qwen-local', 'Qwen Local (Ollama)', 'ollama', 'qwen2.5:latest', 'chat', TRUE, 'Local Qwen model served via Ollama'),
  ('llama-local', 'Llama Local (Ollama)', 'ollama', 'llama3.2:latest', 'chat', FALSE, 'Local Llama model served via Ollama')
ON CONFLICT (public_id) DO NOTHING;

-- Seed default settings
INSERT INTO gateway_settings (id, default_model, request_timeout_ms, logging_enabled, rate_limit_rpm, max_request_bytes, cors_origins)
VALUES ('default', 'gemini-fast', 60000, TRUE, 120, 1048576, '*')
ON CONFLICT (id) DO NOTHING;
