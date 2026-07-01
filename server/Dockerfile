# Build context: repo root (see docker-compose.yml `build.context: .`)
# Multi-stage build for the Express/Prisma server.
#
# node:20-slim (Debian) rather than alpine: Prisma's query engine binaries
# are built against glibc and are unreliable on musl/Alpine without extra
# workarounds, so we stay on a Debian-based image.

FROM node:20-slim AS builder

RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Workspace installs need every workspace's package.json present so npm can
# link them correctly, even though only the server is built in this image.
COPY package.json package-lock.json ./
COPY server/package.json server/package.json
COPY client/package.json client/package.json

RUN npm ci

COPY server server

RUN npx prisma generate --schema server/prisma/schema.prisma
RUN npm run build -w server

# ---------------------------------------------------------------------------

FROM node:20-slim AS runtime

RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/server/package.json ./server/package.json
COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/server/prisma ./server/prisma

COPY server/docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

EXPOSE 4000

ENTRYPOINT ["/app/docker-entrypoint.sh"]
