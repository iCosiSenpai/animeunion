# Sicurezza

## Eccezione temporanea per v0.17.0

La v0.17.0 viene pubblicata con tre segnalazioni production transitive note nel ramo
`next@15.5.21`. Il rischio è stato accettato esplicitamente dal maintainer il **2026-07-22** per
consentire la release e il deploy; questa decisione non equivale a dichiarare risolte le
vulnerabilità.

| Dipendenza risolta | Severità npm | Advisory | Origine nel grafo |
|---|---:|---|---|
| `postcss@8.4.31` (`<8.5.10`) | Moderate | [GHSA-qx2v-qp2m-jg93](https://github.com/advisories/GHSA-qx2v-qp2m-jg93) | Dipendenza esatta di Next 15.5.21 |
| `sharp@0.34.5` (`<0.35.0`) | High (2 finding) | [GHSA-f88m-g3jw-g9cj](https://github.com/advisories/GHSA-f88m-g3jw-g9cj) | Dipendenza opzionale di Next 15.5.21 |

L'advisory Sharp raggruppa vulnerabilità ereditate da libvips, incluse CVE-2026-33327,
CVE-2026-33328, CVE-2026-35590 e CVE-2026-35591. Il comando di riferimento è
`npm audit --omit=dev`, che al momento riporta **1 moderate e 2 high**.

### Perché non viene forzata una correzione

- Next 15.5.21 pinna PostCSS 8.4.31 e accetta soltanto il ramo Sharp 0.34.x.
- Anche le versioni Next supportate verificate non adottano ancora PostCSS 8.5.10 e Sharp 0.35.0.
- Gli override npm provati non sostituiscono in modo supportato le copie annidate di Next.
- `npm audit fix --force` propone Next 9.3.3, un downgrade incompatibile, e non deve essere usato.

### Riduzione dell'esposizione

PostCSS opera nella toolchain di build. Il runner standalone web contiene il package JavaScript
`next/node_modules/sharp@0.34.5`, ma non il binding nativo/libvips Linux: il caricamento diretto di
Sharp fallisce. L'immagine API copia invece l'intero albero del monorepo, dove Sharp carica libvips
8.17.3, ma il servizio API non importa né invoca Sharp. Queste condizioni descrivono e riducono la
superficie osservata, ma **non chiudono gli advisory**.

### Criterio di chiusura

L'eccezione va rivalutata a ogni aggiornamento Next. Può essere chiusa soltanto quando una versione
supportata di Next risolve nel lockfile almeno `postcss@8.5.10` e `sharp@0.35.0`, e
`npm audit --omit=dev` non riporta più questi finding. Fino ad allora le segnalazioni restano note e
accettate, non corrette.
