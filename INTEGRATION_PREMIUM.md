# INTEGRATION_PREMIUM.md — Premium nell'API di integrazione

> Riferimento **condivisibile** per l'app di integrazione (Docker self-hosted):
> come l'app vede lo stato Premium dell'utente e come ne gata le funzioni.
> Complementare a [INTEGRATION_NEURAL_EXPORT.md](INTEGRATION_NEURAL_EXPORT.md)
> (il flusso del download neurale XQ/XQ+). Aggiornato al 2026-07-06 — LIVE in
> produzione.

## In breve

- **Un solo punto di verità**: `GET /api/v1/integration/me` (Bearer token
  integration) espone `premium` e `features`. Nessun altro endpoint premium
  esiste né serve.
- **L'app usa i flag di `features`, MAI i tier**: la policy (quale tier
  sblocca cosa) vive lato server e può cambiare senza aggiornare l'app.
- **Ri-verifica ad ogni uso**: il token integration dura 60gg, l'abbonamento
  può scadere prima. Verificare il flag **prima di ogni operazione gated**,
  non solo al login (una cache breve, pochi minuti, è ok).

## `GET /integration/me` — shape

```jsonc
{
  "id": "...", "username": "...", "email": "...", "avatarUrl": null,
  "role": "USER", "createdAt": "...",

  // null = utente MAI abbonato
  "premium": {
    "tier": "MEGA_FAN",              // "FAN" | "MEGA_FAN" | "ULTRA_FAN"
    "active": true,                  // vedi semantica sotto
    "expiresAt": "2026-08-06T00:00:00.000Z"
  },

  "features": {
    "neuralExport": true             // download XQ/XQ+ (vedi doc dedicato)
  }
}
```

### Semantica di `premium`

| Caso | Valore |
|---|---|
| Mai abbonato | `premium: null` |
| Abbonamento attivo | `{tier, active: true, expiresAt}` |
| Abbonamento scaduto / pagamento in attesa | `{tier, active: false, expiresAt}` — il tier resta visibile ma **non dà diritti** |

`active` è l'unico campo autorevole per "è premium adesso": è già calcolato
lato server (stato + data di scadenza). `expiresAt` è informativo (es. per
mostrare "scade il..."); non ricalcolare l'attività dal client confrontando
date (fusi/clock skew).

### Semantica di `features`

- Flag booleani **già decisi dal server** (tier abilitati × abbonamento attivo).
- Oggi esiste `neuralExport`; **altri flag potranno comparire in futuro**:
  l'app deve ignorare chiavi sconosciute e trattare i flag assenti come `false`.
- Se un flag è `false`, la feature va nascosta/disabilitata nell'app — il gate
  è cooperativo (vedi policy nel doc neurale).

## Cosa NON cambia

- `POST /integration/auth/login` e il device-flow social: invariati (la
  risposta del login NON contiene premium: fare subito una `GET /me` dopo il
  login).
- Tutti gli altri endpoint (catalogo, episodi+sources, preferiti, watchlist,
  cronologia, calendario, news): invariati e NON gated dal premium.
- Rate limit: invariati (GET 120/min per token; login 10/15min per IP).

## ⚠️ Stato lancio Premium (importante per lo sviluppo)

Il Premium **non è ancora acquistabile** sul sito (lancio previsto non prima
del 2026-08-01, gated lato server). Fino ad allora in produzione quasi tutti
gli utenti avranno `premium: null` / `neuralExport: false`. Per sviluppare e
testare il ramo "utente premium": chiedere a Matteo un **grant manuale**
sull'account di test (si fa dal manager in 30 secondi, tier a scelta) — è
esattamente lo stesso dato che produrranno gli abbonamenti reali.

## Errori

- `401` su qualsiasi endpoint guarded = token assente/scaduto/non-integration →
  rifare login. Nessun caso in cui il premium causa un errore HTTP: lo stato
  arriva sempre nel body di `/me`.

## Riferimenti interni (lato AnimeUnion, non servono all'app)

Logica: [premium.service.ts `entitlement()`](../apps/api/src/services/premium.service.ts) ·
[neural-export.service.ts `neuralExportFeature()`](../apps/api/src/services/neural-export.service.ts) ·
tier abilitati in [shared/premium.ts `NEURAL_EXPORT_TIERS`](../packages/shared/src/constants/premium.ts).
Test: [neural-export.test.ts](../apps/api/test/neural-export.test.ts).
