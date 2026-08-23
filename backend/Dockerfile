# ============================================================
# Law+ Backend — production Dockerfile
# Multi-stage build: малък финален образ (~130 MB)
# ============================================================

# ---------- Build stage ----------
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ---------- Production stage ----------
FROM node:20-alpine

# wget е нужен за healthcheck-а в docker-compose
RUN apk add --no-cache wget

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist

# Non-root потребител — по-сигурно
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001
USER nodejs

EXPOSE 3000

CMD ["node", "dist/index.js"]
