# syntax=docker/dockerfile:1.6

# ---- Deps (dev) stage ----
FROM node:22-slim AS deps
WORKDIR /app

# OpenSSL no es obligatorio para pg, pero ca-certificates sí (HTTPS hacia Google Calendar, WhatsApp, etc.)
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates \
 && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --include=dev

# ---- Build stage ----
FROM node:22-slim AS build
WORKDIR /app

RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates \
 && rm -rf /var/lib/apt/lists/*

COPY --from=deps /app/node_modules ./node_modules

COPY tsconfig*.json nest-cli.json ./
COPY src ./src

RUN npm run build

# ---- Prod deps stage ----
FROM node:22-slim AS prod-deps
WORKDIR /app

RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates \
 && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --omit=dev

# ---- Runtime stage ----
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates \
 && rm -rf /var/lib/apt/lists/*

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./package.json

EXPOSE 3001
CMD ["node", "dist/main"]
