# AnimeUnion Docker 🎌

[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue)](LICENSE)
[![CI](https://github.com/iCosiSenpai/animeunion/actions/workflows/ci.yml/badge.svg)](https://github.com/iCosiSenpai/animeunion/actions/workflows/ci.yml)
[![Docker](https://img.shields.io/badge/docker-ghcr.io-blue)](https://github.com/iCosiSenpai/animeunion/pkgs/container/animeunion)

**Applicazione ufficiale affiliata ad [AnimeUnion](https://animeunion.tv)** — il più grande
catalogo streaming anime italiano, ora automatizzato sul tuo NAS.

> AnimeUnion vanta **5.800+ anime**, zero pubblicità, team 100% italiano.
> Con AnimeUnion Docker porti tutto questo sul tuo server: download automatici,
> file organizzati, pronti per Plex e Jellyfin.

🌐 **Landing Page**: [icosisenpai.github.io/animeunion](https://icosisenpai.github.io/animeunion)
🔗 **Sito ufficiale AnimeUnion**: [animeunion.tv](https://animeunion.tv)

> ⚠️ **Stato del progetto**: in sviluppo attivo (Settimana 0 — fondazioni).
> Le immagini Docker e l'installazione one-liner saranno disponibili dalla release `v0.1.0`.

---

## 🚀 Installazione (2 minuti)

```bash
mkdir animeunion && cd animeunion
wget https://raw.githubusercontent.com/iCosiSenpai/animeunion/main/.env.example -O .env
# Modifica .env con le tue credenziali AnimeUnion (email e password)
wget https://raw.githubusercontent.com/iCosiSenpai/animeunion/main/docker-compose.yaml
docker compose up -d
```

Apri [http://localhost:7979](http://localhost:7979).

> La porta è configurabile: imposta `WEB_PORT` nel `.env` se `7979` è già occupata.

### Prerequisiti

1. **Account AnimeUnion** — registrati gratis su [animeunion.tv/registrati](https://animeunion.tv/registrati)
2. **Docker + Docker Compose** installati
3. Crea il file `.env` con le tue credenziali:

```bash
# MAI committare questo file!
ANIMEUNION_EMAIL=tuaemail@esempio.com
ANIMEUNION_PASSWORD=la_tua_password
```

> **Nota sulla sicurezza**: le credenziali stanno SOLO nel `.env` locale.
> Il token API viene generato automaticamente al primo avvio e salvato in SQLite.
> Niente token da copiare manualmente.

---

## ✨ Funzionalità

- 🔍 **Catalogo AnimeUnion** — 5.800+ anime, ricerca, filtri per genere/anno/stagione
- 📺 **Segui e dimentica** — clicchi "Segui" su un anime e da quel momento ogni nuovo episodio viene scaricato da solo
- ⚡ **Download automatico** — il container controlla periodicamente gli anime che segui; se esce un nuovo episodio lo mette in coda e lo scarica. Un episodio alla volta, alla massima velocità che AnimeUnion consente
- 📁 **File organizzati** — `Anime/NomeSerie/Stagione/S01E01.mp4` già pronti per Plex, Jellyfin, Emby
- 🔄 **Rinominazione automatica** — i file vengono rinominati in formato SXXEXX (o numerico)
- 🌙 **Tema auto-detect** — system, light o dark
- 📱 **PWA** — installabile su desktop e mobile come app nativa
- 🔔 **Notifiche push** — il browser ti avvisa quando un download è completato
- 🐳 **Docker multi-arch** — funziona su Synology, QNAP, Ubuntu, Debian, Windows, macOS, Raspberry Pi

---

## 🏠 Uso principale

AnimeUnion Docker è pensato per **automatizzare il download degli anime**. Non serve
aprire il browser ogni giorno per vedere se è uscito un episodio nuovo:

1. Cerchi un anime nel catalogo
2. Clicchi "Segui"
3. **Fine.** Ogni nuovo episodio arriva da solo nella tua libreria

---

## 🏗️ Architettura

Monorepo npm con tre workspace:

| Package | Ruolo |
|---|---|
| `packages/shared` | Tipi e validatori `zod` condivisi, interfaccia `AnimeSource` |
| `apps/api` | Backend Fastify + tRPC + Drizzle (SQLite) |
| `apps/web` | Frontend Next.js 15 + shadcn/ui (PWA) |

Dettagli in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

### Sviluppo locale

```bash
npm install      # installa tutti i workspace
npm run lint     # Biome
npm run typecheck
npm test         # Vitest
```

---

## 📄 Licenza

[AGPL-3.0](LICENSE) — open source forte: ogni fork distribuito o offerto in rete
deve restare aperto.

---

## 🙏 Crediti

Sviluppato con ❤️ da [iCosiSenpai](https://github.com/iCosiSenpai) in collaborazione
ufficiale con **[AnimeUnion](https://animeunion.tv)**.

**AnimeUnion** è il sito streaming anime italiano #1: pulito, veloce, senza pubblicità.
Se non lo conosci ancora: [animeunion.tv](https://animeunion.tv).

> **Disclaimer**: i contenuti video, le immagini e i metadati sono forniti da AnimeUnion
> e appartengono ai rispettivi proprietari e ai fansub che hanno curato le traduzioni.
> Questa applicazione non ospita né ridistribuisce contenuti protetti da copyright.
