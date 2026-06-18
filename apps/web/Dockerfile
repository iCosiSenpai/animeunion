# syntax=docker/dockerfile:1
# ─────────────────────────────────────────────────────────────────────────────
# AnimeUnion Web (Next.js 15 standalone) — context di build = ROOT del monorepo.
#   docker build -f apps/web/Dockerfile --build-arg API_URL=http://api:3001 -t animeunion-web .
# Il browser chiama /trpc (relativo): il server Next fa da proxy verso API_URL.
# API_URL è "cotto" al build (le rewrites di Next sono serializzate): per il
# compose standard è il nome-servizio interno http://api:3001.
# ─────────────────────────────────────────────────────────────────────────────

FROM node:20-bookworm-slim AS builder
WORKDIR /app
# better-sqlite3 (dell'api) viene comunque compilato da npm ci sui workspace.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY . .
RUN npm ci
ARG API_URL=http://api:3001
ENV API_URL=$API_URL
RUN npm run build -w @animeunion/web

FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
# Output standalone: server.js + node_modules tracciati (sotto apps/web/).
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
