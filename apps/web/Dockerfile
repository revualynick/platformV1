# Dockerfile — Revualy Web (Next.js 15)
# Multi-stage build for production deployment on Railway.

# ── Stage 1: Install dependencies ──────────────────────
FROM node:20-alpine AS deps
RUN corepack enable && corepack prepare pnpm@10.29.3 --activate
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/

RUN pnpm install --frozen-lockfile --prod=false

# ── Stage 2: Build ─────────────────────────────────────
FROM node:20-alpine AS build
RUN corepack enable && corepack prepare pnpm@10.29.3 --activate
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
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

# Next.js standalone output includes everything needed
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /app/apps/web/public ./apps/web/public

EXPOSE 3001

ENV PORT=3001
ENV HOSTNAME="0.0.0.0"

CMD ["node", "apps/web/server.js"]
