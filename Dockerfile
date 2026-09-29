FROM node:20-slim

# Install Python 3, pip, curl, procps, and required utilities
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    curl \
    ca-certificates \
    procps \
    && rm -rf /var/lib/apt/lists/*

# Install Ollama binary for Ollama Cloud daemon
RUN curl -fsSL https://ollama.com/install.sh | sh

WORKDIR /app

# Copy Python requirements & install dependencies
COPY requirements.txt ./
RUN pip3 install --no-cache-dir --break-system-packages -r requirements.txt || pip3 install --no-cache-dir -r requirements.txt

# Copy package dependencies & install Node modules
COPY package*.json ./
RUN npm ci --legacy-peer-deps || npm install

# Copy application source code
COPY . .

# Ensure start script is executable
RUN chmod +x scripts/render-start.sh

# Build Next.js frontend application
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# Expose Render PORT (default 10000)
EXPOSE 10000

CMD ["/app/scripts/render-start.sh"]
