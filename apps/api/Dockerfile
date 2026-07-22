# syntax=docker/dockerfile:1
# ─────────────────────────────────────────────────────────────────────────────
# AnimeUnion API — context di build = ROOT del monorepo (per i workspace npm).
#   docker build -f apps/api/Dockerfile -t animeunion-api .
# L'API non viene compilata (tsconfig ha noEmit): si esegue via tsx, come in dev.
# ─────────────────────────────────────────────────────────────────────────────

FROM node:20-bookworm-slim AS deps
WORKDIR /app
# Toolchain per compilare better-sqlite3 (se manca il prebuilt per l'arch).
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
# Copia tutto il monorepo (filtrato da .dockerignore) PRIMA di npm ci, così la
# risoluzione dei workspace funziona sia con symlink (Linux) sia con copia.
COPY . .
# L'immagine Node include già gli header nativi in /usr/local: il fallback
# node-gyp resta disponibile anche quando il prebuilt non è raggiungibile.
RUN npm_config_nodedir=/usr/local npm ci

FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV DATABASE_PATH=/data/animeunion.db
ENV API_PORT=3001
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages ./packages
COPY --from=deps /app/apps ./apps
COPY --from=deps /app/package.json ./package.json
WORKDIR /app/apps/api
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3001/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# tsx come loader: niente build, esegue direttamente il TypeScript.
CMD ["node", "--import", "tsx", "src/index.ts"]
