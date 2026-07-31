# Sicurezza

## Stato delle segnalazioni production (rivalutato il 2026-07-31)

Comando di riferimento: `npm audit --omit=dev`. Prima di questa passata riportava **13 high**; ora
riporta **3 high**, tutte confinate alle copie annidate di `next@15.5.21`.

La rivalutazione precedente (2026-07-22, per la v0.17.0) contava 1 moderate e 2 high. Il conteggio
finale è simile, ma il quadro **non** è lo stesso: nel frattempo PostCSS è passata da Moderate a High
e ha due advisory nuovi, e sono comparse segnalazioni su dipendenze nostre di produzione che non
erano ostaggio di Next e sono state chiuse.

### Risolte in questa passata

| Dipendenza | Da → A | Advisory | Come |
|---|---|---|---|
| `find-my-way` (via `fastify@5.8.5`) | 9.6.0 → 9.7.0 | [GHSA-c96f-x56v-gq3h](https://github.com/advisories/GHSA-c96f-x56v-gq3h) — DDoS con HTTP/2 | aggiornamento in range, nessuna breaking change |
| `builder-util-runtime` (via `electron-updater`) | 9.2.10 → 9.7.0 | [GHSA-p2f4-r6v6-j797](https://github.com/advisories/GHSA-p2f4-r6v6-j797) — fuga di `PRIVATE-TOKEN` e `Authorization` su redirect cross-origin | `electron-updater` 6.3.9 → 6.8.9 nel worker desktop |
| `archiver` con `archiver-utils`, `zip-stream`, `readdir-glob`, `glob`, `minimatch`, `brace-expansion` | rimosse | [GHSA-mh99-v99m-4gvg](https://github.com/advisories/GHSA-mh99-v99m-4gvg) — DoS per espansione illimitata | dipendenza dichiarata ma **mai usata** in alcun sorgente: rimossa da `apps/api`, 28 pacchetti in meno nel grafo |
| `postcss` (root, toolchain Tailwind) | 8.5.10 → 8.5.25 | i tre advisory PostCSS qui sotto | aggiornamento in range; resta vulnerabile solo la copia annidata in Next |

`archiver` era prevista per una funzione "ZIP serie" mai implementata (compare ancora in `PLAN.md`
come voce pianificata). Rimuoverla non cambia il comportamento e riduce la superficie di supply
chain.

`electron-updater` riguarda l'auto-update del worker desktop distribuito agli utenti. Le nostre
release sono pubbliche e l'updater non invia credenziali, quindi l'esposizione osservata era bassa;
la correzione era comunque in range e senza costi.

### Eccezione residua accettata

| Dipendenza risolta | Severità npm | Advisory | Origine nel grafo |
|---|---:|---|---|
| `postcss@8.4.31` (`<=8.5.17`) | High (3 advisory) | [GHSA-qx2v-qp2m-jg93](https://github.com/advisories/GHSA-qx2v-qp2m-jg93) XSS nello stringify, [GHSA-6g55-p6wh-862q](https://github.com/advisories/GHSA-6g55-p6wh-862q) lettura arbitraria di file via `sourceMappingURL`, [GHSA-r28c-9q8g-f849](https://github.com/advisories/GHSA-r28c-9q8g-f849) path traversal nel caricamento dei source map | dipendenza **esatta** di Next 15.5.21 |
| `sharp@0.34.5` (`<0.35.0`) | High | [GHSA-f88m-g3jw-g9cj](https://github.com/advisories/GHSA-f88m-g3jw-g9cj) — vulnerabilità ereditate da libvips: CVE-2026-33327, CVE-2026-33328, CVE-2026-35590, CVE-2026-35591 | dipendenza opzionale di Next 15.5.21 |

Il rischio residuo è stato accettato esplicitamente dal maintainer il **2026-07-31** per consentire
la release e il deploy. Questa decisione non equivale a dichiarare risolte le vulnerabilità.

### Perché non viene forzata una correzione

- Next 15.5.21 pinna PostCSS 8.4.31 come dipendenza esatta e accetta soltanto il ramo Sharp 0.34.x.
- Gli override npm sono stati **riprovati il 2026-07-31** (`postcss@^8.5.25`, `sharp@^0.35.3`), con
  lo stesso esito già registrato in precedenza: npm non ri-risolve le copie annidate già presenti
  nel lockfile, quindi `next/node_modules/postcss` e `next/node_modules/sharp` restano invariate.
  Forzarle richiederebbe rigenerare il lockfile da zero e imporre un minor di Sharp dentro una Next
  che non lo dichiara: raggio d'azione non verificabile alla vigilia di una release. Gli override
  sono stati rimossi.
- `npm audit fix --force` propone `next@9.3.3`, un downgrade incompatibile, e non deve essere usato.

### Riduzione dell'esposizione

PostCSS opera nella toolchain di build e processa **solo CSS di prima parte** (`globals.css` più
l'output di Tailwind). I due advisory nuovi richiedono un foglio di stile o un source map
controllati dall'attaccante: non compiliamo CSS di terzi, quindi quella condizione non si verifica.

Sharp viene coinvolta solo da `next/image`, che l'app usa unicamente per il logo locale nella navbar
e nel footer; copertine, banner e wallpaper remoti sono `<img>` diretti e non passano
dall'ottimizzatore. Le CVE libvips richiedono l'elaborazione di un'immagine malevola, che nel nostro
flusso non avviene. Inoltre il runner standalone web contiene il package JavaScript
`next/node_modules/sharp@0.34.5` ma non il binding nativo libvips per Linux, quindi il caricamento
diretto di Sharp fallisce; l'immagine API copia l'intero albero del monorepo, dove libvips 8.17.3 è
presente, ma il servizio API non importa né invoca Sharp.

Queste condizioni descrivono e riducono la superficie osservata, ma **non chiudono gli advisory**.

### Criterio di chiusura

L'eccezione va rivalutata a ogni aggiornamento di Next. Può essere chiusa soltanto quando una
versione supportata risolve nel lockfile almeno `postcss@8.5.18` e `sharp@0.35.0`, e
`npm audit --omit=dev` non riporta più questi finding.

**La soglia di PostCSS si è alzata:** il criterio precedente indicava `postcss@8.5.10`, che oggi
ricade nel range vulnerabile (`<=8.5.17`). `next@16.2.12` è disponibile ed è il percorso realistico
di chiusura, ma è un major: va affrontato come batch dedicato, con verifica di build, ottimizzazione
immagini e suite E2E, non dentro una release di altro contenuto.
