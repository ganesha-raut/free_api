#!/usr/bin/env bash
set -e

echo "===================================================="
echo " Starting Private AI API Gateway (Render Container)"
echo "===================================================="

export GEMINI_WEB2API_BASE_URL="${GEMINI_WEB2API_BASE_URL:-http://127.0.0.1:8081/v1}"
export OLLAMA_BASE_URL="${OLLAMA_BASE_URL:-http://127.0.0.1:11434}"

# Ensure config.json exists
if [ ! -f /app/config.json ] && [ -f /app/config.example.json ]; then
  cp /app/config.example.json /app/config.json
fi

# 1. Restore Ollama Cloud SSH key if OLLAMA_KEY_BASE64 is provided
mkdir -p /root/.ollama
if [ -n "$OLLAMA_KEY_BASE64" ]; then
  echo "[1/3] Restoring Ollama Cloud key from OLLAMA_KEY_BASE64..."
  echo "$OLLAMA_KEY_BASE64" | tr -d ' \n\r' | base64 -d > /root/.ollama/id_ed25519
  chmod 600 /root/.ollama/id_ed25519
  if command -v ssh-keygen >/dev/null 2>&1; then
    ssh-keygen -y -f /root/.ollama/id_ed25519 > /root/.ollama/id_ed25519.pub 2>/dev/null || true
  fi
fi

# 2. Start Gemini Web2API on internal loopback 127.0.0.1:8081
echo "[2/3] Starting Gemini Web2API provider on 127.0.0.1:8081..."
if [ -f /app/config.json ]; then
  python3 -m gemini_web2api --host 127.0.0.1 --port 8081 --config /app/config.json >/tmp/gemini.log 2>&1 &
else
  python3 -m gemini_web2api --host 127.0.0.1 --port 8081 >/tmp/gemini.log 2>&1 &
fi

# 3. Start Ollama daemon on internal loopback 127.0.0.1:11434 & pull cloud models in background
if command -v ollama >/dev/null 2>&1; then
  echo "[3/3] Starting Ollama Cloud daemon on 127.0.0.1:11434..."
  OLLAMA_HOST=127.0.0.1:11434 ollama serve >/tmp/ollama.log 2>&1 &
  (
    for i in $(seq 1 20); do
      if curl -sf http://127.0.0.1:11434/api/tags >/dev/null 2>&1; then
        break
      fi
      sleep 1
    done
    for model in "gemma4:31b-cloud" "gpt-oss:120b-cloud" "gpt-oss:20b-cloud" "nemotron-3-nano:30b-cloud"; do
      ollama pull "$model" >/dev/null 2>&1 || true
    done
  ) &
fi

PORT="${PORT:-10000}"
echo ">>> Launching Next.js AI Gateway Dashboard & Router on 0.0.0.0:${PORT}..."
exec npx next start -H 0.0.0.0 -p "${PORT}"
