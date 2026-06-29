<p align="center">
  <img src="apps/web/public/logo.png" alt="AnimeUnion" width="128" />
</p>

<h1 align="center">AnimeUnion Docker</h1>

<p align="center">
  <b>La tua libreria anime, sempre aggiornata.</b><br/>
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
| 📲 **App installabile + push** | Installa AnimeUnion come app (PWA) e ricevi notifiche del browser anche ad app chiusa (richiede HTTPS — [guida](#https-app-installabile-pwa-e-notifiche-push)) |
| 🐳 **Docker multi-arch** | Synology, QNAP, Ubuntu, Raspberry Pi, Windows, macOS (amd64 + arm64) |

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
- **Blocco web UI** (opzionale) → Impostazioni → Sicurezza: imposta un passcode per proteggere
  l'accesso in LAN. Recupero: env `WEB_LOCK_DISABLED=true`.
- **App installabile + notifiche push** → richiedono HTTPS: vedi
  [HTTPS, app installabile (PWA) e notifiche push](#https-app-installabile-pwa-e-notifiche-push).

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

## HTTPS, app installabile (PWA) e notifiche push

> **In breve:** queste funzioni sono **opzionali**. Se ti bastano le notifiche in-app (la campanella)
> e Telegram, puoi tranquillamente saltarle. Per averle serve un indirizzo HTTPS: il modo più
> semplice è **Tailscale** (HTTPS automatico, praticamente una riga — vedi sotto).

L'app è una **PWA installabile** e può inviare **notifiche push del browser** (download
completati/falliti, nuovi episodi, nuove stagioni) anche ad app chiusa. **Service worker e Push API
funzionano solo in un contesto sicuro: servono HTTPS** (oppure `localhost`). Non è una scelta
dell'app: è una regola di sicurezza dei browser (Chrome/Firefox/Safari), uguale per qualsiasi sito.
Su `http://` puro in LAN queste funzioni restano disattivate e nelle Impostazioni vedrai una nota che
spiega come attivarle — tutto il resto dell'app funziona comunque.

### Quale via scegliere?

| Se vuoi… | Soluzione consigliata | Perché |
|---|---|---|
| Solo accesso privato (tu/famiglia) | **Tailscale** | Più semplice in assoluto: niente dominio né porte aperte sul router, HTTPS automatico |
| Accesso pubblico da un tuo dominio | **Cloudflare Tunnel** | Nessuna porta aperta verso Internet, TLS gestito da Cloudflare |
| Hai già un reverse proxy / dominio | **Reverse proxy + TLS** | Caddy, Nginx Proxy Manager o il reverse proxy DSM di Synology |

> 🔒 Se esponi l'app **pubblicamente**, imposta prima il **passcode** della web UI
> (Impostazioni → Sicurezza): è mono-utente e collegata al tuo account AnimeUnion.

### Esporre l'app in HTTPS (scegli una via)

- **Tailscale** (rete privata, zero config DNS) — la via più rapida:
  1. Installa Tailscale sull'host/NAS e fai il login (stessa tailnet del tuo telefono/PC).
  2. Nella [admin console](https://login.tailscale.com/admin/dns) abilita **MagicDNS** e
     **HTTPS Certificates** (una volta sola — serve a Tailscale per emettere i certificati).
  3. Esponi la porta web:
     ```bash
     tailscale serve --bg 7979
     ```
  Accedi da `https://<nome-host>.<tua-tailnet>.ts.net`. Il traffico è cifrato end-to-end e
  l'origine è HTTPS → push/PWA attive.
- **Cloudflare Tunnel** (`cloudflared`) — accesso pubblico da un tuo dominio, senza aprire porte:
  ```yaml
  # config.yml di cloudflared
  tunnel: <ID>
  credentials-file: /etc/cloudflared/<ID>.json
  ingress:
    - hostname: animeunion.tuodominio.com
      service: http://web:3000   # o http://<ip-nas>:7979
    - service: http_status:404
  ```
  Cloudflare termina il TLS → accedi via `https://animeunion.tuodominio.com`.
- **Reverse proxy con TLS** (Caddy, Nginx Proxy Manager, reverse proxy di Synology/DSM): punta un
  hostname HTTPS (Let's Encrypt) al servizio `web` sulla porta `7979`. Esempio con Caddy (due righe):
  ```caddyfile
  animeunion.tuodominio.com {
      reverse_proxy <ip-nas>:7979
  }
  ```

> Dopo aver attivato l'HTTPS, se imposti `CORS_ORIGINS` aggiungi l'origine https (es.
> `CORS_ORIGINS=https://animeunion.tuodominio.com`). Le chiavi VAPID per le push vengono generate e
> salvate automaticamente: nessun segreto da configurare a mano.

### Installare la PWA e attivare le push

1. Apri l'app via **`https://…`** (l'indirizzo sicuro, non l'IP `http://`).
2. **Installa**: dal menu del browser "Installa app" / "Aggiungi a schermata Home" (o il bottone
   **Installa app** in Impostazioni → Notifiche, quando disponibile).
3. **Push**: Impostazioni → Notifiche → **Attiva push** → concedi il permesso. Da quel momento ricevi
   le notifiche del browser anche ad app chiusa; il click apre la scheda giusta. Con **Invia notifica
   di test** verifichi subito che arrivino.

> 📱 **iPhone/iPad (iOS 16.4+)**: le notifiche push web arrivano **solo dopo** aver aggiunto l'app
> alla schermata Home (passo 2) e averla aperta **da lì** — la scheda di Safari non le riceve. Apri
> quindi la PWA installata e attiva le push da dentro l'app.

### Non funziona?

- **Il pulsante "Attiva push" è grigio o assente** → non sei in un contesto sicuro. Controlla che
  l'URL inizi con `https://` (oppure `localhost`); su `http://<ip>` la funzione resta disattivata per
  regola del browser, non dell'app.
- **Le push non arrivano su iPhone** → verifica iOS 16.4+ e di aver aperto l'app **installata** (non
  la scheda di Safari); poi riattiva le push da lì e prova **Invia notifica di test**.
- **Errore CORS dopo aver messo il proxy** → aggiungi l'origine `https://…` a `CORS_ORIGINS` e
  riavvia i container.
- **Manca solo la push, il resto funziona** → è il comportamento atteso su `http://` in LAN: usa la
  campanella in-app o Telegram, oppure attiva l'HTTPS come sopra.

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
