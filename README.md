<p align="center">
  <img src="apps/web/public/logo.png" alt="AnimeUnion" width="128" />
</p>

<h1 align="center">AnimeUnion Docker</h1>

<p align="center">
  <b>"Radarr/Sonarr italiano per anime."</b><br/>
  Segui un anime e ogni nuovo episodio viene scaricato, rinominato e organizzato da solo — pronto per Jellyfin/Plex.
</p>

<p align="center">
  <a href="LICENSE"><img alt="License: AGPL-3.0" src="https://img.shields.io/badge/license-AGPL--3.0-blue"></a>
  <a href="https://github.com/iCosiSenpai/animeunion/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/iCosiSenpai/animeunion/actions/workflows/ci.yml/badge.svg"></a>
  <a href="https://github.com/iCosiSenpai/animeunion/pkgs/container/animeunion-web"><img alt="GHCR" src="https://img.shields.io/badge/docker-ghcr.io-2496ED?logo=docker&logoColor=white"></a>
</p>

<p align="center">
  <b>Applicazione ufficiale affiliata ad <a href="https://animeunion.tv">AnimeUnion</a></b> — il catalogo
  streaming anime italiano. Self-hosted in Docker, mono-utente.
</p>

---

## ✨ Cosa fa

Cerchi un anime, clicchi **Segui**, e basta: quando esce un nuovo episodio il container lo scarica,
lo rinomina (`Sub Ita/NomeSerie/Season 01/S01E01.mp4`) e lo mette in libreria, già pronto per
**Jellyfin, Plex o Emby**. Tutto da un'interfaccia web, senza aprire il sito ogni giorno.

| | |
|---|---|
| 🔍 **Catalogo** | Ricerca e filtri per genere, anno, stagione, lingua |
| 📌 **Segui & scarica** | Auto-download dei nuovi episodi degli anime che segui (un episodio alla volta) |
| 📁 **Libreria organizzata** | Naming compatibile Jellyfin/Plex, con **gestione file** (elimina episodio/stagione/serie dall'app) |
| 🌍 **SUB / DUB ITA** | Indicatore lingua con bandiera, scelta della lingua per il download |
| 🐳 **Docker multi-arch** | Synology, QNAP, Ubuntu, Raspberry Pi, Windows, macOS (amd64 + arm64) |
| 🔒 **Robusto** | Validazione dei download, guardia spazio disco, gestione rate-limit, header di sicurezza |

> 🛣️ **In arrivo**: PWA installabile, notifiche push, login social Google/Discord.

---

## 🚀 Installazione (≈ 2 minuti)

> **Ti serve solo Docker.** Un account AnimeUnion gratuito si crea su
> [animeunion.tv/registrati](https://animeunion.tv/registrati).

**1.** Crea una cartella e un file `docker-compose.yml` con questo contenuto:

```yaml
services:
  api:
    image: ghcr.io/icosisenpai/animeunion-api:latest
    restart: unless-stopped
    expose: ['3001']
    volumes:
      - ./data:/data            # database (NON la libreria)
      - /percorso/del/tuo/media:/media   # ⬅️ MODIFICA con le TUE cartelle (serie, film, SUB/DUB)
    environment:
      - DATABASE_PATH=/data/animeunion.db
      - TZ=Europe/Rome
  web:
    image: ghcr.io/icosisenpai/animeunion-web:latest
    restart: unless-stopped
    ports: ['7979:3000']        # cambia 7979 se occupata
    depends_on:
      api:
        condition: service_healthy
```

> ⚠️ **Attenzione al volume `/media`**: ogni NAS è diverso. Monta la cartella che contiene la tua
> libreria (es. Synology: `/volume2/NASHDD/Media:/media`). Le sottocartelle di serie/film e
> SUB/DUB le sceglierai **dentro l'app**, non qui.

**2.** Avvia:

```bash
docker compose up -d
```

**3.** Apri **`http://<ip-del-server>:7979`**, **accedi con il tuo account AnimeUnion**
(email/password) e vai in **Impostazioni → Cartelle di download** per scegliere dove salvare serie
e film (sfoglia le cartelle montate in `/media`).

> 🔑 Niente token da copiare: il login avviene dall'interfaccia. Le credenziali nel `.env` sono
> opzionali (solo per l'auto-login).

<details>
<summary>Alternativa: build da sorgente (per sviluppatori)</summary>

```bash
git clone https://github.com/iCosiSenpai/animeunion.git
cd animeunion
cp .env.example .env
docker compose up -d --build
```
</details>

---

## ⚙️ Configurazione

- **Cartelle di download** → si impostano **nell'app** (Impostazioni → Cartelle di download): serie
  e film, SUB e DUB, ognuno nella sua cartella se vuoi. Basta montarle nel compose sotto `/media`.
- **`.env`** → solo segreti e deploy: `ANIMEUNION_EMAIL`/`PASSWORD` (opzionali), `WEB_PORT`,
  `LOG_LEVEL`, `CORS_ORIGINS`. Vedi [`.env.example`](.env.example).
- **Volumi**: `./data` = database/token; `/media` = la tua libreria.

**Aggiornamento**:

```bash
docker compose pull && docker compose up -d     # immagini pronte
git pull && docker compose up -d --build         # da sorgente
```

Guida completa per piattaforma e troubleshooting in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

---

## 🏗️ Architettura

Monorepo npm con tre workspace:

| Package | Ruolo |
|---|---|
| `packages/shared` | Tipi e validatori `zod` condivisi, interfaccia `AnimeSource` |
| `apps/api` | Backend Fastify + tRPC + Drizzle (SQLite) |
| `apps/web` | Frontend Next.js 15 + shadcn/ui |

Dettagli in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

### Sviluppo locale

```bash
npm install
npm run dev          # api (3001) + web (3000)
npm run lint         # Biome
npm run typecheck
npm test             # Vitest
```

---

## 📄 Licenza

[AGPL-3.0](LICENSE) — open source forte: ogni fork distribuito o offerto in rete deve restare aperto.

## 🙏 Crediti

Sviluppato con ❤️ da [iCosiSenpai](https://github.com/iCosiSenpai) in collaborazione ufficiale con
**[AnimeUnion](https://animeunion.tv)** — il sito streaming anime italiano, pulito e senza pubblicità.

> **Disclaimer**: i contenuti video, le immagini e i metadati sono forniti da AnimeUnion e
> appartengono ai rispettivi proprietari e ai fansub che hanno curato le traduzioni. Questa
> applicazione non ospita né ridistribuisce contenuti protetti da copyright.
