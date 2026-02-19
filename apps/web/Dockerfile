# Dockerfile — Revualy Web (Next.js 15)
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

# Build-time env vars (used during `next build` static analysis).
# Actual values are set at runtime via Railway env vars.
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build_placeholder
ENV INTERNAL_API_SECRET=build-placeholder
ENV NEXTAUTH_SECRET=build-placeholder

RUN pnpm turbo build --filter=@revualy/web

# ── Stage 3: Production image ──────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

# Next.js standalone output includes everything needed
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /app/apps/web/public ./apps/web/public

USER nextjs

EXPOSE 3001

ENV PORT=3001
ENV HOSTNAME="0.0.0.0"

CMD ["node", "apps/web/server.js"]
