# Build context: repo root (see docker-compose.yml `build.context: .`)
# Multi-stage build for the React/Vite client, served by nginx in production.

FROM node:20-slim AS builder

WORKDIR /app

COPY package.json package-lock.json ./
COPY client/package.json client/package.json
COPY server/package.json server/package.json

RUN npm ci

COPY client client

RUN npm run build -w client

# ---------------------------------------------------------------------------

FROM nginx:alpine AS runtime

COPY --from=builder /app/client/dist /usr/share/nginx/html
COPY client/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
