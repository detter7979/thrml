FROM node:22-slim

RUN apt-get update && \
    apt-get install -y --no-install-recommends ffmpeg ca-certificates && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev 2>/dev/null || npm install --omit=dev

COPY tsconfig.json ./
COPY src ./src
COPY assets ./assets
RUN npm install --save-dev typescript && npx tsc && npm prune --omit=dev

RUN ffmpeg -version

USER node
CMD ["node", "dist/index.js"]
