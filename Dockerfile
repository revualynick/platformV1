# Dockerfile — Revualy API (Fastify + BullMQ workers)
# Multi-stage build for production deployment on Railway.

# ── Stage 1: Install dependencies ──────────────────────
FROM node:20-alpine AS deps
RUN corepack enable && corepack prepare pnpm@10.29.3 --activate
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/
COPY packages/chat-core/package.json packages/chat-core/
COPY packages/chat-adapter-slack/package.json packages/chat-adapter-slack/
COPY packages/chat-adapter-gchat/package.json packages/chat-adapter-gchat/
COPY packages/chat-adapter-teams/package.json packages/chat-adapter-teams/
COPY packages/ai-core/package.json packages/ai-core/

RUN pnpm install --frozen-lockfile --prod=false

# ── Stage 2: Build ─────────────────────────────────────
FROM node:20-alpine AS build
RUN corepack enable && corepack prepare pnpm@10.29.3 --activate
WORKDIR /app

COPY --from=deps /app/ ./
COPY . .

RUN pnpm turbo build --filter=@revualy/api

# ── Stage 3: Production image ──────────────────────────
FROM node:20-alpine AS runner
RUN corepack enable && corepack prepare pnpm@10.29.3 --activate
WORKDIR /app

ENV NODE_ENV=production
ENV CI=true

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 revualy

# Copy workspace config + all package.json files for pnpm resolution
COPY --from=build /app/package.json ./
COPY --from=build /app/pnpm-lock.yaml ./
COPY --from=build /app/pnpm-workspace.yaml ./
COPY --from=build /app/apps/api/package.json ./apps/api/
COPY --from=build /app/apps/web/package.json ./apps/web/
COPY --from=build /app/packages/shared/package.json ./packages/shared/
COPY --from=build /app/packages/db/package.json ./packages/db/
COPY --from=build /app/packages/chat-core/package.json ./packages/chat-core/
COPY --from=build /app/packages/chat-adapter-slack/package.json ./packages/chat-adapter-slack/
COPY --from=build /app/packages/chat-adapter-gchat/package.json ./packages/chat-adapter-gchat/
COPY --from=build /app/packages/chat-adapter-teams/package.json ./packages/chat-adapter-teams/
COPY --from=build /app/packages/ai-core/package.json ./packages/ai-core/

# Fresh production-only install (avoids broken pnpm prune in incomplete workspace)
RUN pnpm install --frozen-lockfile --prod

# Copy built output
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/packages/db/dist ./packages/db/dist
COPY --from=build /app/packages/db/src/migrations ./packages/db/src/migrations
COPY --from=build /app/packages/chat-core/dist ./packages/chat-core/dist
COPY --from=build /app/packages/chat-adapter-slack/dist ./packages/chat-adapter-slack/dist
COPY --from=build /app/packages/chat-adapter-gchat/dist ./packages/chat-adapter-gchat/dist
COPY --from=build /app/packages/chat-adapter-teams/dist ./packages/chat-adapter-teams/dist
COPY --from=build /app/packages/ai-core/dist ./packages/ai-core/dist
COPY --from=build /app/apps/api/dist ./apps/api/dist

USER revualy

EXPOSE 3000

CMD ["node", "apps/api/dist/server.js"]
