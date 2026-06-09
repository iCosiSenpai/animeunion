# AnimeUnion Docker — Piano di Sviluppo v3

> **Stato**: Matteo ha accettato di fornire l'API. Lavoriamo direttamente con endpoint ufficiali.  
> **Repo**: `iCosiSenpai/animeunion` (pubblico)  
> **Licenza**: AGPL-3.0  

---

## 1. Visione

Creare un **"Radarr/Sonarr italiano per gli anime"**: un'applicazione Docker self-hosted che, integrata ufficialmente con [AnimeUnion](https://animeunion.tv), permetta a chiunque di automatizzare il download degli anime dal catalogo AnimeUnion — con file rinominati e organizzati per Jellyfin e Plex.

**Il container serve principalmente ad automatizzare il download**: l'utente cerca un anime, clicca "Segui", e da quel momento ogni nuovo episodio viene scaricato automaticamente. Niente interazione manuale, niente browser aperto sul sito per scaricare. Tutto in casa, tutto automatico.

Sviluppata in collaborazione ufficiale con l'amministratore di AnimeUnion (Matteo). **App ufficiale affiliata ad AnimeUnion**.

---

## 2. Decisioni Architetturali (tutte confermate)

| # | Oggetto | Scelta | Motivazione |
|---|---|---|---|
| 1 | Licenza | AGPL-3.0 | Open source forte, impedisce fork proprietari |
| 2 | Package manager | npm | Standard, no tool aggiuntivo |
| 3 | Linter / formatter | Biome | Singolo tool, veloce |
| 4 | Backend | Node.js 20 + TypeScript strict | Veloce, type-safe, AI-friendly |
| 5 | HTTP server | Fastify | Plugin, performance, supporto tRPC |
| 6 | API style | tRPC end-to-end | Type safety client↔server, niente drift |
| 7 | Validation | zod in `packages/shared` | Condiviso, type-safe |
| 8 | ORM + DB | Drizzle + better-sqlite3 | SQL-like, zero config, perfetto per self-hosted |
| 9 | Frontend | Next.js 15 App Router + shadcn/ui + Tailwind | Standard, PWA, SSR/SSG |
| 10 | Tema UI | Auto-detect (next-themes, system/light/dark) | Zero configurazione utente |
| 11 | Notifiche | Web Push (browser + PWA) | Download completato → notifica nativa |
| 12 | HTTP scraping client | undici + cheerio | Solo per scraping temporaneo, sostituito da API |
| 13 | Video (HLS→MP4) | ffmpeg-static | Binario statico, no system deps |
| 14 | ZIP | archiver | Pure JS |
| 15 | Scheduler | node-cron | Auto-download periodico |
| 16 | Logger | pino | JSON structured, veloce |
| 17 | Test | Vitest (unit/integration) + Playwright (E2E) | Moderni, veloci |
| 18 | Container | Docker multi-stage + buildx | Multi-arch amd64 + arm64 |
| 19 | Registry | ghcr.io/icosisenpai/animeunion | Integrato GitHub, free per repo pubblici |
| 20 | CI/CD | GitHub Actions | Lint, test, build, publish |
| 21 | Issues | Pubbliche subito | Bug report / feature request aperti |
| 22 | Monumento README | Sì | Badge, logo, install one-liner, credits |

---

## 2bis. Sistema di Autenticazione (★★★★★)

### Flusso login

L'autenticazione è **OBBLIGATORIA**. Senza login, l'API di AnimeUnion non risponde.

1. L'utente si registra su [animeunion.tv/registrati](https://animeunion.tv/registrati) (email + password)
2. L'utente inserisce le credenziali nel `.env` del container:
   ```
   ANIMEUNION_EMAIL=tuaemail@esempio.com
   ANIMEUNION_PASSWORD=...
   ```
3. Al primo avvio, il backend chiama `POST /api/v1/auth/login` con email e password
4. AnimeUnion restituisce `{ accessToken, refreshToken, expiresIn }`
5. Il backend salva i token nella tabella SQLite `auth`
6. Ogni richiesta API successiva usa `Authorization: Bearer <accessToken>`
7. Se `accessToken` scade (401): il backend chiama `POST /api/v1/auth/refresh` con il `refreshToken`
8. Se anche `refreshToken` è scaduto: il backend rifà il login con le credenziali dalle env

### Dove stanno i segreti

| Segreto | Locazione | Visibile all'utente |
|---|---|---|
| Email e password AnimeUnion | `.env` (referenziato da `docker-compose.yaml`) | Sì, le inserisce lui |
| Access token e refresh token | SQLite (tabella `auth`) | No, gestione automatica |
| File `.env` | Git-ignored, mai committato | Solo locale |

**Perché NON mettere il token nel compose**: il token scade (15 minuti) e va refreshato. Le credenziali (email/password) invece sono permanenti e permettono di riautenticarsi quando serve.

**Consiglio nel README**: usare un file `.env` separato (mai committare!), referenziato dal compose con `env_file` o variabili `${VAR}`.

---

## 3. Struttura del Repository (`/home/senpai/Coding/animeunion/`)

```
animeunion/                          # Root monorepo npm
├── .github/
│   ├── workflows/
│   │   ├── ci.yml                   # Biome lint + tsc + vitest su ogni push/PR
│   │   ├── docker-publish.yml       # buildx multi-arch push su tag / main
│   │   └── codeql.yml               # CodeQL security scan
│   ├── ISSUE_TEMPLATE/
│   │   ├── bug_report.md
│   │   └── feature_request.md
│   └── PULL_REQUEST_TEMPLATE.md
│
├── apps/
│   ├── api/                         # ▶ Backend Fastify + tRPC
│   │   ├── src/
│   │   │   ├── index.ts             # Entry point: crea server Fastify, monta tRPC
│   │   │   ├── trpc.ts              # tRPC context, router builder, middleware auth
│   │   │   ├── routers/             # tRPC routers (1 file per dominio)
│   │   │   │   ├── catalog.ts       # anime.list, anime.search, anime.bySlug
│   │   │   │   ├── episode.ts       # episode.byAnime, episode.detail
│   │   │   │   ├── calendar.ts      # calendar.byDay, calendar.byWeek
│   │   │   │   ├── follow.ts        # follow.list, follow.add, follow.remove, follow.updateStatus
│   │   │   │   ├── download.ts      # download.queue, download.add, download.cancel, download.retry
│   │   │   │   ├── library.ts       # library.scan, library.list, library.stats
│   │   │   │   ├── config.ts        # config.get, config.update
│   │   │   │   ├── stats.ts         # stats.dashboard
│   │   │   │   └── auth.ts          # auth.login, auth.logout, auth.status (futuro)
│   │   │   ├── services/            # Business logic (usata dai routers)
│   │   │   │   ├── catalog-service.ts
│   │   │   │   ├── follow-service.ts
│   │   │   │   ├── download-service.ts
│   │   │   │   ├── renamer-service.ts
│   │   │   │   ├── library-service.ts
│   │   │   │   ├── config-service.ts
│   │   │   │   └── auth-service.ts
│   │   │   ├── sources/             # ★ Collegamento con AnimeUnion
│   │   │   │   ├── types.ts         # AnimeSource interface (contratto)
│   │   │   │   ├── api-source.ts    # AnimeUnionApiSource (API ufficiali, primario)
│   │   │   │   ├── scraper-source.ts # AnimeUnionScraper (fallback temporaneo)
│   │   │   │   └── mock-source.ts   # MockSource (solo per CI/test offline)
│   │   │   ├── db/                  # Database
│   │   │   │   ├── schema.ts        # Schema Drizzle (tutte le tabelle)
│   │   │   │   ├── index.ts         # Connessione DB + export helpers
│   │   │   │   ├── seed.ts          # Popolamento da fonte AniUnion → SQLite
│   │   │   │   ├── sync.ts          # Sincronizzazione periodica catalogo
│   │   │   │   └── migrate.ts       # Runner migrazioni
│   │   │   └── lib/                 # Utility
│   │   │       ├── ffmpeg-bridge.ts # ffmpeg-static wrapper (HLS→MP4)
│   │   │       ├── download-engine.ts # Coda, concorrenza, retry, resume
│   │   │       ├── scheduler.ts     # node-cron job: auto-download
│   │   │       ├── rate-limiter.ts  # Token bucket per richieste API
│   │   │       └── logger.ts        # pino configurato
│   │   ├── drizzle/                 # Migrations auto-generate da Drizzle
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── Dockerfile
│   │
│   └── web/                         # ▶ Frontend Next.js 15
│       ├── src/
│       │   ├── app/
│       │   │   ├── layout.tsx       # Root layout + ThemeProvider + TRPCProvider
│       │   │   ├── page.tsx         # → redirect a /dashboard
│       │   │   ├── (app)/           # Layout group per pagine autenticate
│       │   │   │   ├── layout.tsx   # Navbar + Footer + tRPC provider
│       │   │   │   ├── page.tsx     # Dashboard
│       │   │   │   ├── catalog/
│       │   │   │   │   ├── page.tsx # Griglia anime + search bar + filtri
│       │   │   │   │   └── [slug]/
│       │   │   │   │       └── page.tsx # Dettaglio anime + episodi + segui
│       │   │   │   ├── library/
│       │   │   │   │   └── page.tsx # Libreria locale (file scaricati)
│       │   │   │   ├── follows/
│       │   │   │   │   └── page.tsx # Watchlist
│       │   │   │   ├── downloads/
│       │   │   │   │   └── page.tsx # Coda download + progresso
│       │   │   │   ├── calendar/
│       │   │   │   │   └── page.tsx # Calendario uscite settimanali
│       │   │   │   ├── settings/
│       │   │   │   │   └── page.tsx # Configurazione
│       │   │   │   └── about/
│       │   │   │       └── page.tsx # Crediti AnimeUnion + info progetto
│       │   │   └── api/
│       │   │       └── trpc/
│       │   │           └── [trpc]/
│       │   │               └── route.ts # tRPC HTTP handler Next.js
│       │   ├── components/
│       │   │   ├── ui/              # shadcn/ui components
│       │   │   ├── layout/
│       │   │   │   ├── navbar.tsx
│       │   │   │   └── footer.tsx
│       │   │   ├── anime/
│       │   │   │   ├── anime-card.tsx
│       │   │   │   ├── anime-grid.tsx
│       │   │   │   └── anime-hero.tsx
│       │   │   ├── episode/
│       │   │   │   └── episode-list.tsx
│       │   │   ├── download/
│       │   │   │   ├── download-queue.tsx
│       │   │   │   └── download-item.tsx
│       │   │   ├── follow/
│       │   │   │   ├── follow-button.tsx
│       │   │   │   └── watchlist-grid.tsx
│       │   │   └── shared/
│       │   │       ├── search-bar.tsx
│       │   │       └── filter-bar.tsx
│       │   ├── lib/
│       │   │   ├── trpc.ts          # tRPC client (react-query)
│       │   │   └── utils.ts
│       │   └── styles/
│       │       └── globals.css
│       ├── public/
│       │   ├── logo.png             # Logo AnimeUnion (ufficiale)
│       │   ├── manifest.json        # PWA manifest
│       │   └── sw.js                # Service Worker (cache + Web Push)
│       ├── next.config.ts
│       ├── tailwind.config.ts
│       ├── components.json          # shadcn/ui config
│       ├── package.json
│       ├── tsconfig.json
│       └── Dockerfile
│
├── packages/
│   └── shared/                      # ★ Tipi e validatori condivisi
│       ├── src/
│       │   ├── contracts/           # Tipi pubblici (quelli scambiati via API)
│       │   │   ├── anime.ts
│       │   │   ├── episode.ts
│       │   │   ├── follow.ts
│       │   │   ├── download.ts
│       │   │   ├── calendar.ts
│       │   │   ├── config.ts
│       │   │   └── index.ts
│       │   ├── anime-source.ts      # AnimeSource interface
│       │   └── index.ts
│       ├── package.json
│       └── tsconfig.json
│
├── scripts/
│   ├── dev.sh                       # npm run dev in root → api+web+db
│   ├── seed.ts                      # Popola DB da MockSource
│   ├── sync-catalog.ts              # Popola DB da AnimeUnionApi
│   └── build-multiarch.sh           # docker buildx per amd64+arm64
│
├── docker-compose.yaml              # Compose unico: api + web + volumi
├── biome.json                       # Configurazione Biome (linter + formatter)
├── .gitignore
├── .env.example                     # Template variabili d'ambiente
├── .nvmrc                           # node 20
├── README.md
├── LICENSE                          # AGPL-3.0
├── CHANGELOG.md
└── docs/
    ├── ARCHITECTURE.md
    ├── API_ANIMEUNION.md             # Specifica API per Matteo
    ├── DEPLOYMENT.md
    └── ROADMAP.md
```

---

## 4. Stack Tecnologico Dettagliato

### 4.1 Backend (`apps/api`)

| Categoria | Libreria | Versione | Ruolo |
|---|---|---|---|
| Runtime | Node.js | 20 LTS | Server |
| Linguaggio | TypeScript | ^5.7 | Type-safe |
| HTTP Server | fastify | ^5.x | Ingresso HTTP |
| API Layer | @trpc/server | ^11.x | Type-safe RPC |
| ORM | drizzle-orm | ^0.40 | Query builder |
| DB Driver | better-sqlite3 | ^11 | SQLite |
| Auth | @fastify/jwt | Futuro | JWT verify per API |
| HTTP Client | undici | ^7.x | Fetch per API AniUnion |
| HTML Parser | cheerio | ^1.x | (solo se scraping fallback) |
| Video | @ffmpeg-installer/ffmpeg | ^1.x | Binario ffmpeg statico |
| Archiver | archiver | ^7.x | ZIP serie |
| Scheduler | node-cron | ^3.x | Cron job |
| Logger | pino | ^9.x | Structured logging |
| Test runner | vitest | ^3.x | Unit + integration |
| E2E | @playwright/test | ^1.x | End-to-end browser |

### 4.2 Frontend (`apps/web`)

| Categoria | Libreria | Versione | Ruolo |
|---|---|---|---|
| Framework | next | ^15.x | SSR/SSG/PWA |
| UI | shadcn/ui + radix-ui | latest | Componenti accessibili |
| Styling | tailwindcss | ^4.x | Utility-first CSS |
| Theme | next-themes | ^0.4 | Auto-detect system |
| API Client | @trpc/client + @trpc/next | ^11.x | Type-safe fetch |
| Server State | @tanstack/react-query | ^5.x | Cache, refetch, polling |
| Client State | zustand | ^5.x | UI state |
| Forms | react-hook-form + @hookform/resolvers | latest | Forms validati zod |
| Icons | lucide-react | latest | Icon set |
| Toasts | sonner | ^2.x | Notifiche in-app |
| PWA | next-pwa | ^5.x | Service Worker |
| Analytics | nessuno | — | Zero tracker |

### 4.3 Shared (`packages/shared`)

| Categoria | Libreria | Ruolo |
|---|---|---|
| Validation | zod | Schemi condivisi client↔server |
| Tipi | TypeScript only | Interfacce, type aliases |

---

## 5. Modello Dati (SQLite)

### 5.1 Schema completo

```sql
-- ═══ TABELLA ANIME ═══
-- Copia locale del catalogo AnimeUnion, sincronizzata periodicamente
CREATE TABLE anime (
  id              TEXT PRIMARY KEY,       -- ID da AnimeUnion (cuid es. "cmnxvwu8a1zx9ol019vay1tu0")
  slug            TEXT NOT NULL UNIQUE,   -- edens-zero
  title           TEXT NOT NULL,          -- titolo romanji/ENG
  title_ita       TEXT,                   -- titolo italiano
  title_eng       TEXT,                   -- titolo inglese
  title_jpn       TEXT,                   -- titolo giapponese
  synopsis        TEXT,                   -- trama ITA
  synopsis_eng    TEXT,                   -- trama ENG
  type            TEXT NOT NULL,          -- TV | MOVIE | OVA | ONA | SPECIAL
  status          TEXT NOT NULL,          -- ONGOING | COMPLETED | UPCOMING
  season          TEXT,                   -- WINTER | SPRING | SUMMER | FALL
  season_year     INTEGER,               -- 2021
  episode_count   INTEGER NOT NULL,      -- 25
  episode_duration INTEGER,              -- minuti (23)
  cover_image     TEXT,                   -- URL copertina
  banner_image    TEXT,                   -- URL banner
  trailer_url     TEXT,                   -- YouTube URL
  studio          TEXT,                   -- J.C.Staff
  source          TEXT,                   -- fonte materiale (manga, light novel, ecc.)
  age_rating      TEXT,                   -- classificazione età
  score           INTEGER,               -- ×10 (es. 76 = 7.6)
  mal_id          INTEGER,               -- MyAnimeList ID
  anilist_id      INTEGER,               -- AniList ID
  languages       TEXT,                   -- JSON array ["SUB_ITA", "DUB_ITA"]
  created_at      TEXT NOT NULL,         -- ISO 8601
  updated_at      TEXT NOT NULL          -- ISO 8601
);

-- ═══ TABELLA GENERI ═══
CREATE TABLE genre (
  id        TEXT PRIMARY KEY,
  slug      TEXT NOT NULL UNIQUE,         -- azione, avventura...
  name      TEXT NOT NULL,               -- Azione
  name_eng  TEXT,                         -- Action
  mal_id    INTEGER                       -- 1
);

-- ═══ RELAZIONE ANIME ↔ GENERI ═══
CREATE TABLE anime_genre (
  anime_id  TEXT NOT NULL REFERENCES anime(id) ON DELETE CASCADE,
  genre_id  TEXT NOT NULL REFERENCES genre(id) ON DELETE CASCADE,
  PRIMARY KEY (anime_id, genre_id)
);

-- ═══ TABELLA EPISODI ═══
CREATE TABLE episode (
  id              TEXT PRIMARY KEY,        -- ID da AnimeUnion
  anime_id        TEXT NOT NULL REFERENCES anime(id) ON DELETE CASCADE,
  number          INTEGER NOT NULL,       -- 1, 2, 3...
  title           TEXT,                    -- "Episodio 1"
  title_ita       TEXT,                    -- titolo episodio in italiano
  thumbnail       TEXT,                    -- URL thumbnail
  duration        TEXT,                    -- durata
  air_date        TEXT,                    -- data uscita
  is_filler       INTEGER DEFAULT 0,      -- boolean
  language        TEXT NOT NULL DEFAULT 'SUB_ITA',  -- SUB_ITA | DUB_ITA
  download_url    TEXT,                    -- URL video (ottenuto via API)
  download_status TEXT DEFAULT 'not_downloaded', -- not_downloaded | downloading | downloaded | failed
  local_path      TEXT,                    -- /anime/Edens Zero/Season 1/S01E01.mp4
  file_size       INTEGER,                -- byte
  downloaded_at   TEXT,                   -- ISO 8601 quando scaricato
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

CREATE INDEX idx_episode_anime ON episode(anime_id);
CREATE INDEX idx_episode_status ON episode(download_status);
CREATE INDEX idx_episode_number ON episode(anime_id, number);

-- ═══ TABELLA FOLLOW (WATCHLIST) ═══
CREATE TABLE follow (
  id          TEXT PRIMARY KEY,
  anime_id    TEXT NOT NULL REFERENCES anime(id) ON DELETE CASCADE,
  status      TEXT NOT NULL DEFAULT 'plan_to_watch',
              -- plan_to_watch | watching | on_hold | completed | dropped
  notes       TEXT,                    -- note personali
  added_at    TEXT NOT NULL,           -- ISO 8601
  updated_at  TEXT NOT NULL,
  last_check_at TEXT                   -- ultimo check nuovi episodi
);

CREATE INDEX idx_follow_anime ON follow(anime_id);
CREATE INDEX idx_follow_status ON follow(status);

-- ═══ TABELLA CODA DOWNLOAD ═══
CREATE TABLE download_queue (
  id              TEXT PRIMARY KEY,
  episode_id      TEXT NOT NULL REFERENCES episode(id) ON DELETE CASCADE,
  status          TEXT NOT NULL DEFAULT 'queued',
                  -- queued | downloading | processing | completed | failed | cancelled
  progress        REAL DEFAULT 0,       -- 0.0 - 1.0
  started_at      TEXT,
  completed_at    TEXT,
  error           TEXT,                  -- messaggio errore
  retry_count     INTEGER DEFAULT 0,
  retry_max       INTEGER DEFAULT 3,
  priority        INTEGER DEFAULT 50,    -- 0-100 (100 = massima priorità)
  created_at      TEXT NOT NULL
);

CREATE INDEX idx_download_status ON download_queue(status);
CREATE INDEX idx_download_priority ON download_queue(priority DESC);

-- ═══ TABELLA CONFIGURAZIONE ═══
CREATE TABLE config (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,           -- JSON-encoded
  updated_at  TEXT NOT NULL
);

-- Chiavi predefinite inserite al primo avvio:
--   download_path     → "/anime"
--   cron_schedule     → "0 */6 * * *"
--   language          → "SUB_ITA"
--   naming_format     → "SXXEXX"      (alternativa: "NUMERIC_01")
--   max_concurrent    → "2"
--   rate_limit_ms     → "1000"        (ms tra richieste API)
--   catalog_sync_hours → "24"         (ogni quanto sync catalogo)
--   auto_download     → "true"

-- ═══ TABELLA STATISTICHE (cache, ricalcolata periodicamente) ═══
CREATE TABLE stats (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

-- Chiavi:
--   total_anime, total_episodes, downloaded_episodes,
--   followed_anime, total_size_bytes, download_queue_size

-- ═══ TABELLA SESSIONE (auth attiva dal giorno 1, login OBBLIGATORIO via API AnimeUnion) ═══
CREATE TABLE auth (
  id              TEXT PRIMARY KEY DEFAULT 'default',
  access_token    TEXT,
  refresh_token   TEXT,
  token_expires   TEXT,               -- ISO 8601
  user_email      TEXT,
  user_name       TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);
```

---

## 6. Interfaccia `AnimeSource` (contratto formale)

```typescript
// packages/shared/src/anime-source.ts

export interface PaginatedResult<T> {
  data: T[];
  meta: {
    page: number;
    perPage: number;
    total: number;
    hasMore: boolean;
  };
}

export interface AnimeSummary {
  id: string;
  slug: string;
  title: string;
  titleIta: string | null;
  coverImage: string | null;
  type: string;
  status: string;
  seasonYear: number | null;
  score: number | null;
  genres: GenreSummary[];
  availableLanguages: ('SUB_ITA' | 'DUB_ITA')[];
}

export interface AnimeDetail extends AnimeSummary {
  titleEng: string | null;
  titleJpn: string | null;
  synopsis: string | null;
  synopsisEng: string | null;
  bannerImage: string | null;
  trailerUrl: string | null;
  studio: string | null;
  episodeCount: number;
  episodeDuration: number | null;
  malId: number | null;
  anilistId: number | null;
  season: string | null;
  genres: GenreDetail[];
  relatedAnime: RelatedAnime[];
  recommendations: AnimeSummary[];
  episodes: EpisodeSummary[];
}

export interface EpisodeSummary {
  id: string;
  animeId: string;
  number: number;
  title: string | null;
  titleIta: string | null;
  thumbnail: string | null;
  duration: string | null;
  airDate: string | null;
  isFiller: boolean;
  language: 'SUB_ITA' | 'DUB_ITA';
}

export interface EpisodeDetail extends EpisodeSummary {
  downloadUrl: string;  // ★ URL per scaricare l'episodio
  expiresAt: string | null; // scadenza URL (se temporaneo)
}

export interface GenreSummary {
  id: string;
  slug: string;
  name: string;
}

export interface GenreDetail extends GenreSummary {
  nameEng: string | null;
  malId: number | null;
}

export interface RelatedAnime {
  id: string;
  slug: string;
  title: string;
  titleIta: string | null;
  coverImage: string | null;
  type: string;
  seasonYear: number | null;
  relationType: string;  // SEQUEL | PREQUEL | SPIN_OFF | CHARACTER | SAME_UNIVERSE
}

export interface CalendarEntry {
  day: string;            // LUNEDI, MARTEDI... (in italiano)
  date: string;           // ISO 8601
  anime: AnimeSummary[];
}

export interface SiteStats {
  totalAnime: number;
  totalEpisodes: number;
}

// ═══ CONTRATTO PRINCIPALE ═══
export interface AnimeSource {
  readonly name: string;
  readonly baseUrl: string;

  // Catalogo
  searchAnime(query: string, page?: number): Promise<PaginatedResult<AnimeSummary>>;
  getAnimeBySlug(slug: string): Promise<AnimeDetail>;
  getSeasonalAnime(season: string, year: number): Promise<AnimeSummary[]>;
  getCalendar(): Promise<CalendarEntry[]>;            // settimana corrente
  getCalendarByDay(day: string): Promise<CalendarEntry>;
  getGenres(): Promise<GenreDetail[]>;

  // Episodi
  getEpisodes(animeSlug: string): Promise<EpisodeSummary[]>;
  getEpisodeDetail(episodeId: string): Promise<EpisodeDetail>;

  // Stats
  getStats(): Promise<SiteStats>;

  // Auth (metodi astratti, implementati da ApiSource)
  login?(email: string, password: string): Promise<{ token: string; refreshToken: string; user: unknown }>;
  refreshToken?(refreshToken: string): Promise<{ token: string; expiresIn: number }>;
}
```

**Implementazioni**:

- **`ApiSource`** (primaria): chiama le API REST ufficiali di AnimeUnion con JWT auth. È il source di produzione.
- **`ScraperSource`** (fallback): parsa `__data.json` da SvelteKit. Usato solo se l'API è down o in attesa di implementazione.
- **`MockSource`** (CI): dataset fittizio per test offline. Mai usato in produzione.

---

## 7. API che chiediamo ad AnimeUnion

### 7.1 Endpoint pubblici (no auth)

```
GET  /api/v1/anime
     ?q=test                    # ricerca libera
     &page=1                    # paginazione (default 24)
     &genre=azione              # filtro per slug genere
     &type=TV                   # TV | MOVIE | OVA | ONA | SPECIAL
     &status=COMPLETED          # ONGOING | COMPLETED | UPCOMING
     &year=2026                 # anno
     &season=SPRING             # WINTER | SPRING | SUMMER | FALL
     → { data: AnimeSummary[], meta: { page, perPage, total, hasMore } }

GET  /api/v1/anime/:slug
     → AnimeDetail (con generi, episodi, raccomandati, relazioni)

GET  /api/v1/calendario
     → CalendarEntry[] (settimana corrente, lunedì-domenica)

GET  /api/v1/stagionali?season=SPRING&year=2026
     → AnimeSummary[] (tutti gli anime di una stagione)

GET  /api/v1/genres
     → GenreDetail[] (tutti i generi disponibili)

GET  /api/v1/stats
     → SiteStats (totali catalogo)

GET  /api/v1/search?q=bleach&limit=10
     → AnimeSummary[] (ricerca rapida per autocomplete)
```

### 7.2 Endpoint autenticati (richiede JWT `Authorization: Bearer <token>`)

```
POST /api/v1/auth/login
     Body: { email, password }
     → { accessToken, refreshToken, expiresIn, user: { id, email, username } }

POST /api/v1/auth/refresh
     Body: { refreshToken }
     → { accessToken, expiresIn }

GET  /api/v1/me/follows
     → { animeId, slug, status, addedAt }[]

POST /api/v1/me/follows
     Body: { animeId, status }
     → { id, animeId, status, addedAt }

PUT  /api/v1/me/follows/:animeId
     Body: { status }     # aggiorna solo lo status

DELETE /api/v1/me/follows/:animeId
     → 204 No Content

GET  /api/v1/episodes/:id/download
     Header: Authorization: Bearer <token>
     → { url: "https://...", expiresAt: "2026-06-10T00:00:00Z" }
     # URL temporaneo per download MP4 (o ZIP per serie)
```

### 7.3 Rate Limiting (da rispettare)

Matteo ha menzionato rate-limiting. L'app deve:
- **Cache locale SQLite**: ogni richiesta di catalogo viene cachata. Richieste successive colpiscono il DB locale.
- **Throttle**: max 1 richiesta API al secondo (configurabile in `rate_limit_ms`).
- **Sync periodico**: catalogo sincronizzato ogni 24 ore (non a ogni richiesta utente).
- **Auto-download**: controlla nuovi episodi ogni 6-12 ore, solo per anime seguiti.
- **Header `X-RateLimit-*`**: se il server li restituisce, l'app si adatta automaticamente.

---

## 8. Flusso Dati (Data Flow)

```
Frontend (Next.js)                   Backend (Fastify)                AnimeUnion API
┌─────────────────┐      tRPC       ┌──────────────────┐    HTTP     ┌──────────────┐
│  Browser / PWA  │ ◄─────────────► │  tRPC routers    │ ◄─────────► │  API REST    │
│                 │   type-safe     │  ┌─────────────┐ │  JWT auth  │  /api/v1/*   │
│  React Query    │   (zod valid.)  │  │ services     │ │            └──────────────┘
│  cache          │                 │  │ ┌───────────┐│ │
│                 │                 │  │ │ sources   ││ │    ┌──────────────────┐
└─────────────────┘                 │  │ │ ApiSource ││ │    │ AnimeUnion CDN    │
                                    │  │ │ (cache)   ││─┼───►│ api.animeunion.tv │
                                    │  │ └───────────┘│ │    │  /uploads/covers/ │
                                    │  └─────────────┘ │    └──────────────────┘
                                    │  ┌─────────────┐ │
                                    │  │ SQLite DB   │ │
                                    │  │ anime, ep,  │ │
                                    │  │ follow, dl  │ │
                                    │  └─────────────┘ │
                                    │  ┌─────────────┐ │
                                    │  │ Scheduler   │ │
                                    │  │ node-cron   │ │
                                    │  │ + download  │ │
                                    │  └─────────────┘ │
                                    └──────────────────┘
                                            │
                                    Download (ffmpeg)
                                            │
                                            ▼
                              /anime/NomeSerie/Season N/SXXEXX.mp4
```

**Regola cardinale**: il frontend **NON** chiama mai direttamente l'API di AnimeUnion. Ogni richiesta passa dal backend, che fa da proxy + cache + rate-limit.

---

## 9. Flusso Utente Completo

1. L'utente esegue `docker compose up -d`
2. Apre `http://localhost:8080` (o l'IP del NAS)
3. Vede la dashboard con: in evidenza, stagionali della settimana, ultimi aggiunti
4. Cerca un anime (es. "bleach") → barra di ricerca con autocomplete (chiamata tRPC → backend proxy → API AnimeUnion)
5. Clicca su un risultato → pagina dettaglio con copertina, trama, generi, episodi
6. Clicca **"Segui"** → l'anime viene aggiunto alla watchlist con status "Da guardare"
7. Clicca **"Scarica"** su un episodio → il download viene accodato
8. L'utente vede la coda download in `/downloads` con progresso
9. Quando il download è completato: notifica push + file rinominato in `/anime/NomeSerie/Season N/SXXEXX.mp4`
10. L'utente apre Jellyfin/Plex → library scan → l'anime appare. Fatto.

**Download automatico**: se l'utente ha attivato l'auto-download nelle impostazioni, ogni 6 ore il backend:
1. Prende tutti gli anime con status "In corso" nella watchlist
2. Chiede all'API AnimeUnion gli episodi di ciascun anime (usando cache se fresh < 1h)
3. Confronta con gli episodi già scaricati nel DB locale
4. Accoda i nuovi episodi nella coda download
5. Scarica uno alla volta (concorrenza configurabile, default 1)

---

## 10. Roadmap Dettagliata (8 settimane)

### Settimana 0 — Fondazioni
- [ ] Crea repo `iCosiSenpai/animeunion` pubblico su GitHub
- [ ] Branch protection su `main` (require PR, require CI pass)
- [ ] `.github/workflows/ci.yml`: checkout → setup node 20 → npm ci → Biome check → tsc --noEmit → vitest (se test esistono)
- [ ] `.github/workflows/docker-publish.yml`: trigger su push a `main` o tag `v*` → buildx multi-arch → push `ghcr.io/icosisenpai/animeunion`
- [ ] `.github/ISSUE_TEMPLATE/`: bug_report.md, feature_request.md
- [ ] `.github/PULL_REQUEST_TEMPLATE.md`
- [ ] `biome.json` alla root (indent 2, single quote, semicolons, trailing commas)
- [ ] `.gitignore` (node_modules, .env, *.db, drizzle/meta, .next, .turbo)
- [ ] `.env.example` con tutte le variabili documentate
- [ ] `.nvmrc` → `20`
- [ ] `README.md` completo (badge, logo, one-liner install, features, credits, license)
- [ ] `LICENSE` → AGPL-3.0 testo completo
- [ ] `docs/ARCHITECTURE.md`: diagramma mermaid data flow + spiegazione moduli
- [ ] `docs/API_ANIMEUNION.md`: specifica API (copia della sezione 7 di questo piano)
- [ ] `docs/DEPLOYMENT.md`: placeholder (riempito alla settimana 7)
- [ ] `docs/ROADMAP.md`: questo piano
- [ ] `docs/CREDITS.md`: sviluppatore, AnimeUnion, contatti
- [ ] `docker-compose.yaml` placeholder
- [ ] Init npm workspaces root `package.json`
- [ ] Init `apps/api/package.json` (fastify, trpc, drizzle, better-sqlite3, zod, pino, undici, cheerio, archiver, node-cron, ffmpeg-static)
- [ ] Init `apps/web/package.json` (next, react, trpc client, shadcn, tailwind, next-themes, zustand, react-hook-form, sonner, lucide-react)
- [ ] Init `packages/shared/package.json` (zod, typescript)
- [ ] `packages/shared/src/contracts/*.ts` — tipi zod per anime, episode, follow, download, calendar, config
- [ ] `packages/shared/src/anime-source.ts` — AnimeSource interface
- [ ] `packages/shared/tsconfig.json`

**Deliverable S0**: repo su GitHub, CI verde (nessun test ancora, solo lint/typecheck), struttura cartelle completa, documentazione scritta.

---

### Settimana 1 — Database + AnimeSource
- [ ] `apps/api/src/db/schema.ts` — Schema Drizzle completo (tutte le tabelle della sezione 5)
- [ ] `apps/api/drizzle/` — prima migration generata con `drizzle-kit generate`
- [ ] `apps/api/src/db/index.ts` — `createDb(path)` factory, funzioni helper
- [ ] `apps/api/src/db/seed.ts` — popola DB da MockSource (50 anime, generi, episodi)
- [ ] `apps/api/src/sources/types.ts` — re-export di `AnimeSource` da shared
- [ ] `apps/api/src/sources/mock-source.ts` — MockSource con dataset hardcoded (50 anime italiani realistici, 12-25 ep ciascuno, generi, cover URL fittizie, stagioni varie)
- [ ] `apps/api/src/sources/api-source.ts` — `createApiSource(baseUrl)` factory, implementa `AnimeSource` chiamando le REST API (undici fetch + JWT header opzionale). **Questa è la source primaria**.
- [ ] `apps/api/src/sources/scraper-source.ts` — fallback: parsa `__data.json` di SvelteKit. Solo se l'API non è disponibile.
- [ ] `apps/api/src/lib/rate-limiter.ts` — token bucket: max 1 richiesta ogni `rate_limit_ms` ms, coda FIFO
- [ ] `apps/api/src/lib/logger.ts` — pino configurato con level da env `LOG_LEVEL`
- [ ] `apps/api/tsconfig.json`
- [ ] `scripts/seed.ts` — script standalone: popola DB da MockSource

**Deliverable S1**: `npm run seed` crea un database SQLite con 50 anime, 250+ episodi, 25+ generi. Tests: MockSource restituisce dati consistenti.

---

### Settimana 2 — Backend tRPC (parte 1: lettura)
- [ ] `apps/api/src/index.ts` — Crea server Fastify, monta plugin tRPC
- [ ] `apps/api/src/trpc.ts` — `createContext` (DB injection), `router`, `publicProcedure`, `protectedProcedure` (per futuro auth)
- [ ] `apps/api/src/routers/catalog.ts` — procedure tRPC:
  - `catalog.search(query, page)` → cerca nel DB locale. Se cache scaduta (>24h), chiama ApiSource e aggiorna cache.
  - `catalog.bySlug(slug)` → cerca prima nel DB, se non trovato chiama API, salva, restituisci
  - `catalog.byGenre(genreSlug, page)` → query DB
  - `catalog.bySeason(season, year)` → query DB
  - `catalog.byYear(year, page)` → query DB
  - `catalog.recent(page)` → ordinati per added_at DESC
  - `catalog.topRated(page)` → ordinati per score DESC
- [ ] `apps/api/src/routers/episode.ts`:
  - `episode.byAnime(animeSlug)` → lista episodi di un anime
  - `episode.byId(episodeId)` → dettaglio episodio singolo
- [ ] `apps/api/src/routers/calendar.ts`:
  - `calendar.week()` → settimana corrente (lunedì-domenica)
  - `calendar.day(dayName)` → episodi di un giorno specifico
- [ ] `apps/api/src/routers/follow.ts`:
  - `follow.list()` → tutti i follow con dettaglio anime
  - `follow.add(animeId, status)` → aggiungi
  - `follow.remove(animeId)` → rimuovi
  - `follow.updateStatus(animeId, status)` → cambia status
- [ ] `apps/api/src/routers/config.ts`:
  - `config.getAll()` → tutte le config
  - `config.get(key)` → singola
  - `config.set(key, value)` → upsert
- [ ] `apps/api/src/routers/stats.ts`:
  - `stats.dashboard()` → statistiche aggregate da DB locale
- [ ] `apps/api/src/services/catalog-service.ts` — logica sync + cache
- [ ] `apps/api/src/services/follow-service.ts` — CRUD follow
- [ ] `apps/api/src/services/config-service.ts` — CRUD config con validazione

**Deliverable S2**: `npm run dev` avvia server Fastify su `localhost:3001`. tRPC funzionante, testabile via `curl` o tRPC panel.

---

### Settimana 3 — Frontend Shell + Prime Pagine
- [ ] `apps/web/` → `npx create-next-app@latest` con TypeScript, App Router, Tailwind
- [ ] `npx shadcn@latest init` (base: neutral, css variables)
- [ ] Aggiungi componenti shadcn: button, card, input, badge, select, dialog, sheet, tabs, separator, scroll-area, skeleton, dropdown-menu, tooltip
- [ ] `npx shadcn@latest add sonner` (toast)
- [ ] `next-themes` setup: ThemeProvider in root layout, auto-detect
- [ ] `@trpc/client` + `@trpc/next` + `@tanstack/react-query` setup
- [ ] `apps/web/src/lib/trpc.ts` — tRPC client singleton
- [ ] `apps/web/src/app/(app)/layout.tsx` — layout con:
  - Navbar: logo AnimeUnion + link (Catalogo | Seguiti | Libreria | Download | Calendario | Settings | About)
  - Footer: "Powered by AnimeUnion — Applicazione ufficiale affiliata. Sviluppata con ♥ da iCosiSenpai" + link GitHub
  - Mobile: hamburger menu con Sheet
- [ ] `apps/web/src/components/shared/search-bar.tsx` — input con Ctrl+K, autocomplete via `catalog.search` tRPC
- [ ] `apps/web/src/components/anime/anime-card.tsx` — card con cover, titolo, score, anno, type badge
- [ ] `apps/web/src/components/anime/anime-grid.tsx` — griglia responsive con `anime-card`
- [ ] Pagina `/catalog`:
  - Griglia anime con infinite scroll o paginazione
  - Filter bar: genere (multi-select), tipo (select), status (select), anno (select), stagione (select)
  - Search bar integrata
  - Skeleton loading state
  - Empty state ("Nessun anime trovato")
- [ ] Pagina `/catalog/[slug]`:
  - Hero banner + cover + titolo + metadata (tipo, status, stagione, episodi, studio, score)
  - Sinossi espandibile
  - Generi badges cliccabili
  - Lista episodi: numero, titolo, lingua, bottone Scarica, stato download
  - Bottone Segui (con dropdown status)
  - Sezione "Relazioni" (sequel, prequel, spin-off)
  - Sezione "Consigliati" (grid di card)
  - Skeleton loading
- [ ] Pagina `/about`:
  - Cos'è AnimeUnion Docker
  - Disclaimer legale (contenuti appartengono ai proprietari)
  - Crediti: sviluppatore (iCosiSenpai), AnimeUnion (Matteo + team)
  - Link: GitHub repo, sito AnimeUnion
  - Licenza AGPL-3.0

**Deliverable S3**: Webapp navigabile, catalogo popolato da DB locale, pagina dettaglio funzionante.

---

### Settimana 4 — Follow, Library, Calendar (frontend)
- [ ] Pagina `/follows`:
  - Griglia anime seguiti, raggruppati per status (tab: Da guardare | In corso | In pausa | Completati | Droppati)
  - Ogni card mostra: cover, titolo, progresso (ep scaricati / ep totali), ultimo check
  - Azioni: cambia status, rimuovi, vai al dettaglio
  - Empty state per ogni tab
- [ ] Pagina `/library`:
  - Griglia cartelle anime (organizzata per nome serie)
  - Click su serie → lista episodi scaricati con: numero, titolo, dimensione, data download, path
  - Bottone "Scansiona libreria" (trigger `library.scan`)
  - Stats: totale episodi, spazio occupato
  - Empty state: "Nessun episodio scaricato. Vai al catalogo e segui un anime!"
- [ ] Pagina `/calendar`:
  - Tab per giorno della settimana (Lunedì-Domenica), oggi selezionato
  - Lista anime che escono quel giorno: cover, titolo, numero episodio, orario (se disponibile)
  - Click → pagina dettaglio anime
- [ ] `sonner` toast integrati per:
  - "Aggiunto ai seguiti"
  - "Rimosso dai seguiti"
  - "Download aggiunto alla coda"
  - "Download completato"
  - "Errore download"
- [ ] Skeleton loading per ogni pagina
- [ ] Error boundary globale (error.tsx in ogni route)
- [ ] Not found page (not-found.tsx)

**Deliverable S4**: Tutte le pagine frontend navigabili, dati reali dal backend, UX completa.

---

### Settimana 5 — Download Engine
- [ ] `apps/api/src/lib/ffmpeg-bridge.ts`:
  - `hlsToMp4(inputUrl, outputPath, onProgress?)` → scarica stream HLS, converte in MP4 con ffmpeg
  - Supporto resume (se il file esiste parzialmente)
  - Progress callback (0.0-1.0)
  - Timeout configurabile
- [ ] `apps/api/src/lib/download-engine.ts`:
  - Classe `DownloadEngine`:
    - Coda con priorità (più alta = prima)
    - Concorrenza limitata (`max_concurrent` da config)
    - Retry con exponential backoff (max `retry_max` tentativi)
    - Callback su completamento: trigger renamer + library scan
    - Pausa/riprendi coda
    - Rimuovi dalla coda
  - Event emitter: `download:start`, `download:progress`, `download:complete`, `download:error`
- [ ] `apps/api/src/services/download-service.ts`:
  - `addToQueue(episodeId, priority?)` → aggiunge episodio alla coda
  - `cancelDownload(queueId)` → annulla se in stato 'queued'
  - `retryDownload(queueId)` → rimette in coda
  - `getQueue()` → stato attuale della coda
  - `getQueueItem(queueId)` → dettaglio singolo item
- [ ] `apps/api/src/routers/download.ts` (procedure tRPC):
  - `download.addEpisode(episodeId)` → accoda
  - `download.addSeason(animeSlug, season)` → accoda tutti gli episodi di una stagione
  - `download.addMissing(animeSlug)` → accoda solo episodi non ancora scaricati
  - `download.queue()` → stato coda
  - `download.cancel(queueId)` → annulla
  - `download.retry(queueId)` → riprova
  - `download.clearCompleted()` → pulisci completati dalla vista
- [ ] `apps/api/src/lib/scheduler.ts`:
  - `startScheduler()` → avvia `node-cron` con `cron_schedule` da config
  - Ogni esecuzione:
    1. Prende tutti i follow con status 'watching'
    2. Per ogni anime, chiama API per lista episodi (rispettando cache e rate-limit)
    3. Confronta con episodi già nel DB locale
    4. Accoda i nuovi episodi con `download.addEpisode()`
  - Opzionale: sync catalogo ogni 24h
- [ ] Pagina `/downloads`:
  - Lista coda download con:
    - Nome anime + numero episodio
    - Barra progresso (se in corso)
    - Status badge (queued, downloading, processing, completed, failed)
    - Azioni: cancella, riprova (se failed)
  - Auto-refresh via TanStack Query polling (ogni 2 secondi se ci sono download attivi)
  - Sezione "Completati" comprimibile
  - Empty state: "Nessun download in coda"

**Deliverable S5**: Download funzionante (con file MP4 finto dal mock). Coda, retry, progresso visibili nel frontend.

---

### Settimana 6 — Renamer + Library Scanner + Settings
- [ ] `apps/api/src/services/renamer-service.ts`:
  - `renameEpisode(episode, anime, namingFormat)` → rinomina il file dopo il download
  - Formato `SXXEXX` (default): `Edens Zero/Season 1/S01E01.mp4` (la season number è calcolata dagli episodi: ep 1-?? = S01, ep ??+1 = S02, ecc.)
  - Formato `NUMERIC`: `Edens Zero/Season 1/01.mp4`
  - Gestione edge case:
    - Nomi con caratteri speciali (rimossi/sanitizzati)
    - Path troppo lunghi (troncati)
    - File già esistenti (skip, non sovrascrive)
    - Stagioni multiple (rileva automaticamente dal numero episodio o dai metadata)
  - Mappa stagioni: se AnimeUnion ha `season: "SPRING"` e `seasonYear: 2021`, calcola season number relativa all'anime
- [ ] `apps/api/src/services/library-service.ts`:
  - `scanLibrary()` → scansiona ricorsivamente `download_path`, trova tutti i file `.mp4`/`.mkv`
  - Matcha i file trovati con gli episodi nel DB (via nome file SXXEXX o numero)
  - Aggiorna `episode.download_status = 'downloaded'` e `episode.local_path`
  - Trova "orfani" (file senza match nel DB)
  - Trova "missing" (episodi nel DB senza file)
  - Restituisce `LibraryScanResult { found, updated, orphans, missing, errors }`
- [ ] `apps/api/src/routers/library.ts`:
  - `library.scan()` → trigger scansione
  - `library.list()` → episodi scaricati raggruppati per anime
  - `library.stats()` → statistiche libreria
- [ ] Pagina `/settings`:
  - Sezione "Download":
    - Path download (text input con validazione path)
    - Concorrenza massima (number input, 1-5)
  - Sezione "Pianificazione":
    - Schedule auto-download (cron expression input con helper visivo)
    - Abilita/disabilita auto-download (toggle)
  - Sezione "Catalogo":
    - Sync frequency (select: ogni 6h, 12h, 24h, manuale)
    - Bottone "Sincronizza ora" (trigger sync manuale)
  - Sezione "Nomi file":
    - Formato rinomina (radio: SXXEXX / Numerico 01,02,03)
  - Sezione "Lingua":
    - Lingua preferita download (radio: Sub ITA / Dub ITA / Entrambe)
  - Sezione "Tema":
    - Tema UI (select: System / Light / Dark)
  - Bottone "Salva" in fondo
  - Toast conferma "Impostazioni salvate"

**Deliverable S6**: Download → rinomina → library scan → file pronti per Jellyfin. Settings page completa.

---

### Settimana 7 — Docker, Multi-Arch, PWA, Notifiche
- [ ] `apps/api/Dockerfile`:
  - Multi-stage: builder (node:20-alpine) → runner (node:20-alpine)
  - Copia solo `dist/` e `node_modules` (production)
  - HEALTHCHECK: `wget -qO- http://localhost:3001/api/health`
  - USER node (non root)
- [ ] `apps/web/Dockerfile`:
  - Multi-stage: builder (next build con standalone output) → runner (node:20-alpine)
  - Copia `public/` e `.next/standalone`
  - HEALTHCHECK: `wget -qO- http://localhost:3000/api/health`
- [ ] `docker-compose.yaml`:
  ```yaml
  services:
    api:
      build: ./apps/api
      ports: ["3001:3001"]
      volumes:
        - ./data:/data              # SQLite DB + token storage
        - ${DOWNLOAD_PATH:-./anime}:/anime  # libreria download
      env_file:
        - .env                      # ANIMEUNION_EMAIL, ANIMEUNION_PASSWORD (MAI committare!)
      environment:
        - NODE_ENV=production
        - DATABASE_PATH=/data/animeunion.db
        - DOWNLOAD_PATH=/anime
        - SOURCE_MODE=api
        - ANIMEUNION_API_URL=${ANIMEUNION_API_URL:-https://animeunion.tv/api/v1}
        - TZ=Europe/Rome
        - LOG_LEVEL=info
    web:
      build: ./apps/web
      ports: ["8080:3000"]
      environment:
        - API_URL=http://api:3001
      depends_on: [api]
  ```
  **`.env` file (da creare, MAI committare in git):**
  ```bash
  # Credenziali account AnimeUnion — OBBLIGATORIE
  # L'account va creato su https://animeunion.tv/registrati
  ANIMEUNION_EMAIL=tuaemail@esempio.com
  ANIMEUNION_PASSWORD=la_tua_password
  ```
  Il token API viene generato automaticamente al primo avvio (login) e salvato in SQLite. L'utente NON deve gestire token manualmente.
- [ ] `scripts/build-multiarch.sh`:
  - `docker buildx create --use`
  - `docker buildx build --platform linux/amd64,linux/arm64 -t ghcr.io/icosisenpai/animeunion-api:latest ./apps/api --push`
  - `docker buildx build --platform linux/amd64,linux/arm64 -t ghcr.io/icosisenpai/animeunion-web:latest ./apps/web --push`
- [ ] `.github/workflows/docker-publish.yml` completo:
  - Trigger: push su `main` o tag `v*`
  - Login: `ghcr.io` con `${{ secrets.GITHUB_TOKEN }}`
  - Buildx multi-arch
  - Push con tag: `latest`, `:vX.Y.Z`, `:sha-XXXXX`
  - Test smoke post-push: pull + run + healthcheck
- [ ] PWA setup in `apps/web`:
  - `public/manifest.json`: name "AnimeUnion", short_name "AnimeUnion", theme_color, icons
  - `public/sw.js`: Service Worker per caching asset statici + Web Push
  - `public/icons/icon-192.png`, `icon-512.png`
  - Meta tag PWA in root layout (theme-color, apple-mobile-web-app)
- [ ] Web Push notifications:
  - Service Worker registra `push` event listener
  - Backend invia notifica via Web Push API quando download completato
  - L'utente deve accettare il permesso notifiche (prompt al primo download)
  - Test su Chrome, Firefox, Safari

**Deliverable S7**: `docker compose up` funzionante su amd64 e arm64. PWA installabile. Notifiche push.

---

### Settimana 8 — Test E2E, Beta, Release v0.1.0
- [ ] Test unitari (Vitest):
  - MockSource: tutti i metodi restituiscono dati consistenti
  - Renamer: formati SXXEXX e NUMERIC corretti, edge case
  - Download engine: coda, priorità, retry, concorrenza
  - Rate limiter: token bucket rispetta il limite
  - Catalog service: sync, cache invalidation
- [ ] Test integrazione:
  - tRPC routers: chiamate complete con DB reale (in-memory SQLite)
  - Flusso follow → download → renamer → library scan
- [ ] Test E2E (Playwright):
  - Apri app → cerca anime → vedi risultati
  - Vai a dettaglio anime → vedi episodi → clicca Segui
  - Vai a Seguiti → vedi anime aggiunto
  - Vai a Settings → cambia path → salva
  - Flusso completo: cerca → segui → scarica → libreria
- [ ] Beta testing:
  - Invita 3-5 volontari (amici, community Telegram)
  - Loro installano Docker, eseguono `docker compose up`, testano
  - Raccogli feedback via GitHub Issues
  - Priority bug fix (P0: crash, data loss; P1: UX broken; P2: cosmetic)
- [ ] `CHANGELOG.md` v0.1.0:
  ```
  ## v0.1.0 — First Public Release
  ### Added
  - Catalogo AnimeUnion (5800+ anime) con ricerca e filtri
  - Dettaglio anime con episodi, generi, relazioni
  - Watchlist (Segui) con status tracking
  - Download singoli episodi
  - Auto-download periodico per anime seguiti
  - Rinominazione automatica file (SXXEXX e numerico)
  - Libreria locale scanner
  - Calendario uscite settimanali
  - Pagina impostazioni
  - Docker multi-arch (amd64 + arm64)
  - PWA installabile
  ```
- [ ] `docs/DEPLOYMENT.md` completo:
  - Prerequisiti: Docker, docker compose
  - Installazione: `wget docker-compose.yaml && docker compose up -d`
  - Configurazione: variabili d'ambiente, volumi
  - Guida per piattaforma: Synology DSM, QNAP, Ubuntu, macOS, Windows
  - Troubleshooting: permessi, porte, spazio disco
  - Aggiornamento: `docker compose pull && docker compose up -d`
- [ ] Release su GitHub:
  - Tag `v0.1.0`
  - Release notes con changelog
  - Docker images su `ghcr.io/icosisenpai/animeunion-api:v0.1.0` e `:latest`
  - README aggiornato con badge versione

**Deliverable S8**: v0.1.0 pubblica, testata, documentata. Docker pull funzionante.

---

## 11. Post-v1 (Orizzonti futuri)

Dopo il rilascio v0.1.0 e l'integrazione con l'API ufficiale di Matteo:

- v0.2.0: Sync watchlist bidirezionale sito ↔ app
- v0.3.0: Supporto sottotitoli (scarica .ass/.srt insieme al video)
- v0.4.0: Multi-utenza (profili separati per famiglia/NAS condiviso)
- v0.5.0: Integrazione Jellyfin/Plex via API (notifica scan completato, refresh metadata)
- v0.6.0: Mobile companion app (React Native o PWA avanzata)
- v0.7.0: Gestione qualità (1080p, 720p, 480p configurabile)
- v0.8.0: Scheduler avanzato (solo in orari notturni, giorni specifici)
- v0.9.0: Stable release, auto-update via Watchtower, supporto community

---

## 12. GitHub Pages — Landing Page Ufficiale

Per dare al progetto una vetrina professionale, creiamo una **landing page su GitHub Pages** (`icosisenpai.github.io/animeunion`).

### La pagina conterrà:
- **Hero section**: titolo "AnimeUnion Docker", sottotitolo "Il tuo catalogo anime, automatico. Per Plex e Jellyfin."
- **Logo AnimeUnion** in evidenza (ufficiale, affiliato)
- **3 feature card** con icone: Ricerca, Auto-download, Organizzazione file
- **Spazio per 2/3 immagini della mascotte ufficiale** (da creare in un secondo momento — placeholder SVG per ora)
- **One-liner installazione**: `docker compose up -d` con link al README
- **Badge**: licenza AGPL-3.0, Docker pulls, CI status, ultima release
- **Footer**: crediti AnimeUnion + sviluppatore

### Setup tecnico:
- La landing page è un file `index.html` statico nella root del repo (branch `gh-pages` o root `docs/`)
- Stile: Tailwind CSS standalone (nessun framework JS, pagina pura HTML+CSS per caricamento istantaneo)
- Deploy automatico via GitHub Actions (o GitHub Pages built-in da branch `main` cartella `/docs`)
- La configurazione si fa da repo Settings → Pages → Source: Deploy from branch → `main` → `/docs`

### Struttura:
```
docs/
├── index.html              # Landing page
├── style.css               # Stili (Tailwind compilato standalone)
├── logo.png                # Logo AnimeUnion
├── mascotte/               # Placeholder per immagini future
│   ├── placeholder-1.svg
│   ├── placeholder-2.svg
│   └── placeholder-3.svg
└── CNAME                   # (opzionale) dominio personalizzato
```

---

## 13. Crediti & Disclaimer

### Footer dell'app (sempre visibile)

```
Powered by AnimeUnion (https://animeunion.tv) — Applicazione ufficiale affiliata.
Sviluppata con ❤️ da iCosiSenpai — https://github.com/iCosiSenpai/animeunion
```

### Pagina `/about`

> **AnimeUnion Docker** è l'applicazione ufficiale affiliata per il download self-hosted degli anime dal catalogo [AnimeUnion](https://animeunion.tv).
>
> Sviluppata in collaborazione con il team di AnimeUnion, permette a chiunque — su NAS, Windows, macOS o Linux — di creare la propria libreria anime personale, con download automatici e file organizzati per Jellyfin e Plex.
>
> **Disclaimer**: I contenuti video, le immagini e i metadati sono forniti da AnimeUnion e appartengono ai rispettivi proprietari e ai fansub che hanno curato le traduzioni. Questa applicazione non ospita né ridistribuisce contenuti protetti da copyright. Per richieste DMCA: contact@animeunion.tv.
>
> **Sviluppatore**: [iCosiSenpai](https://github.com/iCosiSenpai)  
> **Team AnimeUnion**: Matteo e contributori  
> **Licenza**: [AGPL-3.0](https://github.com/iCosiSenpai/animeunion/blob/main/LICENSE)

### README.md (GitHub)

```markdown
# AnimeUnion Docker 🎌

[![AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue)](LICENSE)
[![CI](https://github.com/iCosiSenpai/animeunion/actions/workflows/ci.yml/badge.svg)](https://github.com/iCosiSenpai/animeunion/actions/workflows/ci.yml)
[![Docker Pulls](https://img.shields.io/badge/docker-ghcr.io-blue)](https://github.com/iCosiSenpai/animeunion/pkgs/container/animeunion)

**Applicazione ufficiale affiliata ad [AnimeUnion](https://animeunion.tv)** — il più grande catalogo streaming anime italiano, ora automatizzato sul tuo NAS.

> AnimeUnion vanta **5.800+ anime**, zero pubblicità, team 100% italiano.  
> Con AnimeUnion Docker porti tutto questo sul tuo server: download automatici, file organizzati, pronti per Plex e Jellyfin.

🌐 **Landing Page**: [icosisenpai.github.io/animeunion](https://icosisenpai.github.io/animeunion)  
🔗 **Sito ufficiale AnimeUnion**: [animeunion.tv](https://animeunion.tv)

---

## 🚀 Installazione (2 minuti)

\`\`\`bash
mkdir animeunion && cd animeunion
wget https://raw.githubusercontent.com/iCosiSenpai/animeunion/main/.env.example -O .env
# Modifica .env con le tue credenziali AnimeUnion (email e password)
wget https://raw.githubusercontent.com/iCosiSenpai/animeunion/main/docker-compose.yaml
docker compose up -d
\`\`\`

Apri [http://localhost:8080](http://localhost:8080).

### Prerequisiti

1. **Account AnimeUnion** — registrati gratis su [animeunion.tv/registrati](https://animeunion.tv/registrati)
2. **Docker + Docker Compose** installati
3. Crea il file `.env` con le tue credenziali:

\`\`\`bash
# MAI committare questo file!
ANIMEUNION_EMAIL=tuaemail@esempio.com
ANIMEUNION_PASSWORD=la_tua_password
\`\`\`

> **Nota sulla sicurezza**: le credenziali stanno SOLO nel `.env` locale.  
> Il token API viene generato automaticamente al primo avvio e salvato in SQLite. Niente token da copiare manualmente.

---

## ✨ Funzionalità

- 🔍 **Catalogo AnimeUnion** — 5.800+ anime, ricerca, filtri per genere/anno/stagione
- 📺 **Segui e dimentica** — clicchi "Segui" su un anime e da quel momento ogni nuovo episodio viene scaricato da solo
- ⚡ **Download automatico** — il container controlla periodicamente gli anime che segui; se esce un nuovo episodio lo mette in coda e lo scarica. Un episodio alla volta, alla massima velocità che AnimeUnion consente
- 📁 **File organizzati** — `Anime/NomeSerie/Stagione/S01E01.mp4` già pronti per Plex, Jellyfin, Emby
- 🔄 **Rinominazione automatica** — i file vengono rinominati in formato SXXEXX (o numerico)
- 🎬 **Niente "Scarica intera serie"** — il container scarica un episodio alla volta. L'auto-download gestisce tutto senza intasare il server. Segui l'anime e aspetti: fa tutto da solo
- 🌙 **Tema auto-detect** — system, light o dark
- 📱 **PWA** — installabile su desktop e mobile come app nativa
- 🔔 **Notifiche push** — il browser ti avvisa quando un download è completato
- 🐳 **Docker multi-arch** — funziona su Synology, QNAP, Ubuntu, Debian, Windows, macOS, Raspberry Pi

---

## 🏠 Uso principale

AnimeUnion Docker è pensato per **automatizzare il download degli anime**. Non serve aprire il browser ogni giorno per vedere se è uscito un episodio nuovo. Il container fa tutto da solo:

1. Cerchi un anime nel catalogo
2. Clicchi "Segui"
3. **Fine.** Ogni nuovo episodio arriva da solo nella tua libreria

---

## 📄 Licenza

AGPL-3.0 — vedi [LICENSE](LICENSE)

---

## 🙏 Crediti

Sviluppato con ❤️ da [iCosiSenpai](https://github.com/iCosiSenpai) in collaborazione ufficiale con **[AnimeUnion](https://animeunion.tv)**.

**AnimeUnion** è il sito streaming anime italiano #1: pulito, veloce, senza pubblicità.  
Se non lo conosci ancora: [animeunion.tv](https://animeunion.tv).
```

---

## 13. Convenzioni di Codice

- **Linguaggio**: Italiano per commit, documentazione, commenti. Inglese per nomi di variabili, funzioni, classi.
- **Nomi file**: kebab-case (`anime-card.tsx`, `download-engine.ts`)
- **Nomi funzioni**: camelCase descrittivo (`getAnimeBySlug`, `addToDownloadQueue`)
- **Nomi componenti React**: PascalCase (`AnimeCard`, `DownloadQueue`)
- **Nomi variabili DB**: snake_case (come da schema — è lo standard SQL)
- **Import order**: `node:*` → packages esterni → `@animeunion/*` → relativi `./` → `../`
- **TypeScript**: strict mode, niente `any` (usa `unknown` e type narrowing)
- **Error handling**: mai `catch (e) {}` vuoto. Almeno `logger.error(e)`. Propaga se non gestibile.
- **Niente commenti nel codice** (a meno che la logica non sia ovvia). I commenti sono per il "perché", non per il "cosa".
- **Niente emoji nel codice**.
- **Commit**: un commit = un task completato. Messaggio descrittivo in italiano.
- **Branch**: `main` per release, feature branches per sviluppi (`feat/nome-feature`).

---

*Piano v3 — Ultimo aggiornamento: 2026-06-09*  
*Dopo chiamata con Matteo: API ufficiali confermate*
