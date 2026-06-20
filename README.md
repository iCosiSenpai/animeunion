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
lo rinomina con layout **Jellyfin/Plex** (`<Titolo>/Season 02/<Titolo> - S02E01.mp4`) e lo mette in
libreria, già pronto da guardare. Tutto da un'interfaccia web, senza aprire il sito ogni giorno.

| | |
|---|---|
| 🧭 **Primo avvio guidato** | Un wizard ti fa scegliere le cartelle di download prima di iniziare |
| 🔍 **Ricerca & catalogo** | Ricerca stile Spotlight + filtri per genere, anno, stagione, lingua; **command palette ⌘K** |
| 📌 **Segui con opzioni** | Stato, auto-download per-serie e "scarica subito i già usciti" al volo |
| ⬇️ **Download "a contenitori"** | Pagina stile qBittorrent: un riquadro per anime con avanzamento, **velocità ed ETA**, resume dei download interrotti |
| 🎬 **Stagioni intelligenti** | Rilevamento sequel/stagione (anche quando l'API non lo fornisce) + conferma/correzione manuale e cartella `Specials` |
| 📁 **Libreria organizzata** | Naming Jellyfin/Plex, **gestione file** (elimina episodio/stagione/serie dall'app) |
| 🔔 **Notifiche** | Centro notifiche in-app (completati/falliti/nuovi episodi) + inoltro **Telegram** opzionale |
| 🩺 **Diagnostica** | Stato worker, spazio disco per cartella, ultima sync, connessione |
| 🐳 **Docker multi-arch** | Synology, QNAP, Ubuntu, Raspberry Pi, Windows, macOS (amd64 + arm64) |

> 🛣️ **In arrivo**: PWA installabile e notifiche Web Push.

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

**3.** Apri **`http://<ip-del-server>:7979`** e **accedi con il tuo account AnimeUnion**
(email/password). Al primo accesso un **wizard** ti guida a scegliere le cartelle di download
(sfogliando quelle montate in `/media`): finché non le imposti, i download restano bloccati — niente
file salvati nel posto sbagliato.

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
- **Notifiche Telegram** (opzionali) → token e chat id si impostano **nell'app**
  (Impostazioni → Notifiche), con bottone "Invia test". Guida sotto:
  [Configurazione Notifiche Telegram](#configurazione-notifiche-telegram). In alternativa restano
  utilizzabili le env `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` come fallback.
- **`.env`** → solo segreti e deploy: `ANIMEUNION_EMAIL`/`PASSWORD` (opzionali), `WEB_PORT`,
  `LOG_LEVEL`, `CORS_ORIGINS`. (`TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` restano un fallback
  opzionale: ora i token si configurano nell'app.) Vedi [`.env.example`](.env.example).
- **Volumi**: `./data` = database/token; `/media` = la tua libreria.
- **Diagnostica**: Impostazioni → Diagnostica mostra stato worker, spazio disco per cartella e sync.

**Aggiornamento**:

```bash
docker compose pull && docker compose up -d     # immagini pronte
git pull && docker compose up -d --build         # da sorgente
```

Guida completa per piattaforma e troubleshooting in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

---

## Configurazione Notifiche Telegram

Ricevi le notifiche dell'app (download completati/falliti, nuovi episodi) anche su Telegram.

1. **Crea il bot**: su Telegram apri [@BotFather](https://t.me/BotFather), invia `/newbot`, segui le
   istruzioni e copia il **token** (formato `123456:ABC-DEF...`).
2. **Avvia una chat col bot**: cercalo per nome e premi **Start** (necessario perché possa scriverti).
3. **Ricava il chat id**: il modo più semplice è scrivere a [@userinfobot](https://t.me/userinfobot),
   che ti risponde con il tuo **Id**. In alternativa, dopo aver scritto al tuo bot, apri
   `https://api.telegram.org/bot<TOKEN>/getUpdates` e leggi `chat.id`.
4. **Inserisci tutto nell'app**: vai in **Impostazioni → Notifiche**, incolla **Bot Token** e
   **Chat ID**, imposta **Notifiche Telegram = Attivo** e premi **Invia messaggio di test**: se
   arriva il messaggio, è tutto pronto. Ricordati di **Salvare**.

I token sono salvati nel database locale dell'app (`./data`). In alternativa puoi impostarli via env
`TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` (fallback usato solo se i campi nell'app sono vuoti).

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
