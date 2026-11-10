FROM node:20-slim

# Create non-root user with UID 1000 (standard for Hugging Face Spaces)
RUN useradd -m -u 1000 user

WORKDIR /app

# Install build dependencies for native modules (better-sqlite3)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy package manifests first for efficient Docker layer caching
COPY --chown=user:user package*.json ./

# Install dependencies (better-sqlite3 compiles here)
RUN npm install

# Copy application source code
COPY --chown=user:user . .

# Ensure local data directory exists with write permissions for user
RUN mkdir -p /app/data && chown -R user:user /app

USER user

# Hugging Face Spaces proxies container traffic on port 7860
ENV PORT=7860
EXPOSE 7860

# Start script: node restore.js && node server.js
CMD ["npm", "start"]
