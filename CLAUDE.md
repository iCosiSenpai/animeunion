# CLAUDE.md — AnimeUnion Docker (fonte unica di stato)

> **Leggi questo file per primo a ogni sessione.** È la fonte unica e vivente di: visione, stato,
> roadmap a step, regole, gotchas. La spec tecnica di dettaglio è in [PLAN.md](PLAN.md) (schema SQL,
> contratti, flussi). Design di sistema in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Contratto
> API col sito in [docs/API_ANIMEUNION.md](docs/API_ANIMEUNION.md).
>
> **Regola**: a fine di ogni step, aggiorna la sezione "Stato" e "Roadmap" qui sotto.
>
> **Processo (vincolante):** il piano vivo del batch corrente sta in **`plan/`** nel progetto
> (gitignored, durevole). I file in `~/.claude/plans/` sono **temporanei/effimeri**: la fonte è
> `plan/`. La sezione **"Roadmap verso vX"** qui sotto rimanda sempre al piano attivo in `plan/`.
> **Per ogni step si entra prima in plan mode** (approfondire → implementare a checkbox, Regola
> #14/#15). Quando "Roadmap verso vX" esiste, c'è lavoro da fare: leggila e apri il piano in `plan/`.

## Visione

"La tua libreria anime, sempre aggiornata": l'utente segue un anime e ogni nuovo episodio viene
scaricato automaticamente (un episodio alla volta), rinominato e organizzato per Jellyfin. Integrazione
**ufficiale** con AnimeUnion via API (no scraping). App self-hosted in Docker, mono-utente.

## Stack (non negoziabile)

Backend: Node 20 + TS strict + Fastify + tRPC + Drizzle/better-sqlite3 + undici + pino.
Frontend: Next.js 15 App Router + shadcn/ui + Tailwind + TanStack Query + zustand.
Shared: `packages/shared` (zod + interfaccia `AnimeSource`). Video: ffmpeg-static (HLS→MP4).
Scheduler: setInterval (node-cron non usato). Lint: Biome. Test: Vitest (+ Playwright in futuro).
Monorepo npm workspaces: `apps/api`, `apps/web`, `packages/shared`.

## Roadmap verso v0.10.0 (batch attivo) — "Potenziamenti diffusi"

> **C'è lavoro da fare.** Piano vivo (durevole): **[plan/potenziamenti-diffusi.md](plan/potenziamenti-diffusi.md)**
> (gitignored). Branch: `feat/potenziamenti-diffusi` da `main`. Avanzamento e dettaglio tecnico
> per ogni step sono nel piano. **Per riprendere:** "continua lo step N" → leggi questa sezione →
> apri il piano → entra in plan mode per lo step. Aggiorna l'AVANZAMENTO nel piano + questa
> sezione + "Stato attuale" a fine di ogni step.

Batch di bug-fix + potenziamenti raccolti dall'uso reale. **Ordine (bug prima, scelta utente):**
- **Fase A — Bug** (Step 1-5): dettaglio anime "0 episodi"/poster rotto/episodio mancante; tema
  light/dark morto; toast iPhone + animazioni invisibili; home card overlap + hero bassa qualità;
  popup che sforano.
- **Fase B — Quick win** (Step 6): pulsante "AnimeUnion" (logo AU) nel dettaglio.
- **Fase C — Rumore** (Step 7-8): batching notifiche + test push/PWA; tenuta coda gigante (One Piece).
- **Fase D — Ricerca + seguiti** (Step 9-10): ricerca veloce/pagina risultati/in-app; "gestisci" follow.
- **Fase E — Gestore file** (Step 11-13): relink dinamico + rinomina serie + vista "Mancanti";
  multi-season alla riscarica; collega-senza-scaricare (stato `external`).
- **Fase F — Personalizzazione** (Step 14-16): home mostra/nascondi+riordina; calendario; wallpaper.
- **Fase G — Hardening + extra** (Step 17).

**Stato batch:** Step 0-3 fatti (branch `feat/potenziamenti-diffusi`). **Step 1** (bug dettaglio
anime): conteggio episodi reale (`Math.max(dichiarato, distinti)` in `assembleDetailFromDb`, l'API
dichiara 0 per gli ONGOING), freschezza ONGOING (TTL detail capato a 1h in `isRowFresh`), poster
robusto (`onError` + `aspect-[2/3]`), guardia "0 episodi". +2 test (257). **Step 2** (tema light/dark):
palette light reale in `:root` + `color-scheme` dinamico (`.dark` invariato), `theme-color` PWA
sensibile al tema, skeleton hero `bg-foreground/10`. **Step 3** (toast iPhone + animazioni invisibili):
toast `top-center` + `offset` safe-area; interruttore Animazioni autorevole (`reducedMotion`
`never`/`always`); transizione di pagina più decisa/affidabile (`motion.div` keyed, niente
`AnimatePresence mode="wait"`); micro-interazioni hover/tap card gated; nota costo in Impostazioni.
**Step 4** (home: card overlap + hero bassa qualità): le due sezioni in `grid lg:grid-cols-2` ("In
onda oggi"/"Stagione in corso") renderizzavano il carosello a `lg:grid-cols-6` su mezza larghezza →
6 card cramped; ora `Section` accetta `carouselClassName` e quelle due passano `lg:grid-cols-3` +
badge card robusti. Hero: il feed `/in-evidenza` espone solo `coverImage`, il banner sta su detail/DB
→ nuovo tipo shared `FeaturedAnime`, `catalog.bannersBySlugs` arricchisce in `home-service`
(`bannerLookup`), rendering banner full-bleed o backdrop poster sfocato + poster nitido. +4 test (261).
**Step 5** (popup overflow gestore file): la cornice dialog era già sicura (`DialogContent`
`overflow-x-hidden`, `DialogTitle`/`Description` `break-words`) e i risultati ricerca già troncati
(Fase 5); restavano 3 punti in [file-manager.tsx](apps/web/src/components/library/file-manager.tsx):
righe episodio `RelinkDialog` (`<span>` `min-w-0 flex-1 truncate` + `<Badge>` `shrink-0` + button
`gap-2`), blocco conferma `FolderActionsDialog` (`<span>` `min-w-0 break-words`), riquadro "anime
scelto" (`break-words`). Solo CSS/markup, 261 test a contorno. **Step 6** (pulsante "AnimeUnion"/logo
AU nel dettaglio): nuova icona brand `AnimeUnionIcon` (riquadro navy `#1c2333` + "AU" corsivo,
coerente con `MalIcon`) in [brand-icons.tsx](apps/web/src/components/anime/brand-icons.tsx); la riga
link esterni del `Hero` ([anime-detail.tsx](apps/web/src/components/catalog/anime-detail.tsx)) ora è
sempre visibile e ha come primo chip "Apri su AnimeUnion" → `https://animeunion.tv/anime/<slug>` (path
confermato dall'utente; `target=_blank rel=noopener`), MAL/AniList restano condizionali dopo. Solo
frontend, 261 test a contorno. **Step 7** (notifiche: batching anti-rumore + test push/PWA):
**coalescing per-anime senza timer** — nuovo `notifyDownloadComplete` in `notification-service` con
aggregato in memoria (chiave `animeId`), entro `BATCH_WINDOW_MS=10min` aggiorna UNA riga "Scaricati N
episodi di X" (createdAt bumped, `read=0`, risale in cima) invece di N righe, e inoltra a Telegram/Push
solo al primo episodio della sessione; `context.ts` `worker.on('complete')` usa il nuovo metodo (gate
`notifyOnComplete` invariato), i `download_failed` restano singoli. **Test push/PWA**:
`push-service.test()` (refactor invio in `sendToAll`, ritorna `{ok,sent}`) + router `push.test` +
pulsante "Invia notifica di test" in `push-toggle.tsx` (solo se iscritto) + "Mostra toast di prova"
nella card Notifiche di `settings-view.tsx` (verifica safe-area Step 3). +6 test (267).
**Step 8** (download: tenuta coda gigante One Piece): la coda intera (1000+ righe joinate) veniva
spedita a ogni poll a pagina **e** widget navbar (quest'ultimo polla su ogni pagina). Nuovo
**riassunto aggregato server-side**: `download.summary` → `{ groups, counts }` (`getQueueSummary`,
Query A `GROUP BY anime.id,status` con `count()` + Query B solo gli **in volo** come `activeItems`)
→ payload O(#anime + #attivi). Espansione card **paginata on-demand** (`download.groupItems`
limit/offset, 50/pagina) e **azioni di gruppo** server-side `download.cancelGroup`/`retryGroup` (una
chiamata, niente iterazione su 999 queued). Pagina e widget passano a `download.summary` con interval
adattivo; widget mostra in volo live + riga "N in coda • N completati". Contratti shared additivi,
`getQueue` invariato. +6 test (273). **Step 9** (ricerca: velocità + pagina risultati + ricerca
in-app): **debounce** della palette ⌘K (nuovo hook `useDebouncedValue`, 220ms → input istantaneo ma
la query tRPC non parte a ogni tasto; server `catalog.search` già local-first → niente refactor);
**Enter → pagina risultati** via entry sintetica "Cerca «q» nel catalogo" sempre per prima →
`go('/catalog?q=')` (riuso di `CatalogBrowser` già paginato+filtri, niente route `/search` ridondante;
scelta Invio confermata dall'utente); **ricerca in-app** con nuovo `extraActions` (Gestore file,
Informazioni, 9 sezioni Impostazioni via deep-link `/settings?section=`) cercabili ma non affollanti
la vista di default; deep-link sezione in `settings-view.tsx` (`useSearchParams`+`isSectionId`, init
lazy + effetto URL→stato) e `settings/page.tsx` avvolto in `Suspense` (`/settings` resta statica).
Frontend-only, 273 test a contorno. **Step 10** (seguiti: potenziamento "gestisci" + elimina file):
nuova voce **rossa** "Elimina file scaricati" nel menu della `FollowCard`, visibile solo per i seguiti
`completed`/`dropped` (`canDeleteFiles`) → Dialog di conferma (mirror di `library-series-card`) con
warning franchise-wide + checkbox `deleteFolder`, **riusa** `trpc.library.deleteSeries` (già testata) e
invalida `library`/`download`/`catalog`/`follow.list`; l'anime resta tra i seguiti. Menu rifinito
("Rimuovi"→"Smetti di seguire", voci distruttive raggruppate; `addAll` ora invalida l'intero router
`download` così il widget summary dello Step 8 si aggiorna subito). Frontend-only, 273 test a contorno.
**Step 11** (gestore file: relink dinamico + rinomina serie + vista "Mancanti"): **relink dinamico** —
il gestore file polla `download.summary` (Step 8) con `refetchInterval` adattivo e tiene "viva" la
lista (`files.list` con `refetchInterval` 5s mentre ci sono download attivi) così cartelle/orfani
passano a managed/collegato senza refresh manuale; `refresh()` invalida l'intero router `download`.
**Rinomina serie** — il dialog Rinomina, per le cartelle managed, titola "Rinomina la serie" e mostra
la nota che i collegamenti agli episodi si aggiornano da soli (backend `files.rename`→`syncMovedPaths`
già preservante, invariato). **Vista "Mancanti"** — il dialog che sforava è sostituito da una pagina
dedicata `/library/missing` (`missing-view.tsx`): "Controlla la libreria" (riusa `library.scan`),
mancanti per serie a tutta larghezza con chip dei numeri, "N presenti · M mancanti" (incrocio
`library.list`), Classifica + Ri-scarica/Ri-scarica tutti (`download.addMissing`); il badge "Mancanti"
della Libreria è ora un link, `missing-dialog.tsx` rimosso. Frontend-only, 273 test a contorno.
**Step 12** (gestore file: multi-season alla riscarica → correlazioni): l'azione "Ri-scarica" di una
cartella ([file-manager.tsx](apps/web/src/components/library/file-manager.tsx) `FolderActionsDialog`)
chiamava `download.addAllBySlug({slug})` = i mancanti di **una sola** entry → per una serie con più
stagioni scaricata esternamente le altre stagioni si perdevano. **Fix frontend-only (riuso):**
rilevamento multi-stagione senza backend — i figli di una cartella-serie hanno già `FileEntry.extra`
(da `isExtraEntry`→`isContentFolderName`), quindi le stagioni sono `dir && !extra`; `>=2` = serie
multi-stagione. In quel caso "Ri-scarica tutte le stagioni" elimina la cartella e instrada al **flusso
correlazioni del catalogo** ([relations-download-dialog.tsx](apps/web/src/components/catalog/relations-download-dialog.tsx),
montato in `FileManager` con nuova prop `autoDiscover` → scoperta franchise `series.franchise` avviata
da sola), dove ogni stagione/correlato si seleziona e si **classifica** (`series.setOverride`) prima di
accodare (`addAllBySlug`) = ogni stagione mappata alla sua entry AnimeUnion. `RelationsDownloadDialog`
ora invalida l'intero router `download` (non più solo `download.queue`, non pollato dallo Step 8). Il
caso ≤1 stagione resta invariato. Frontend-only, 273 test a contorno. **Step 13** (gestore file:
collega senza scaricare, stato `external`): l'utente ha già i file su disco (scaricati altrove) e vuole
che l'app li conosca senza ri-scaricarli/spostarli. **Nessuna migrazione DB** —
`episode_file.download_status` è `text` senza CHECK, l'enum vive solo nel contratto: aggiunto
`'external'` a `episodeFileStatusSchema` (deviazione consapevole dal piano che ipotizzava `0013`).
**Mapping cartella-auto (scelta utente):** nuovo `parseEpisodeNumber` esportato (SxxExx → marcatori
Ep/Episodio/E/# → "- 12" fansub → fallback unico numero non risoluzione/codec/anno) +
`linkExternalFolder(path, animeId, language)` in [file-manager-service.ts](apps/api/src/services/file-manager-service.ts)
che legge i file video **diretti** della cartella, ricava il numero e marca i corrispondenti
`episode_file` `external` con `localPath` puntato al file dell'utente (**senza spostarli**), saltando i
già `downloaded`; router `files.linkExternalFolder` con report `{linked,skipped,unmatched}`.
**Esclusioni:** `addMissing` salta `downloaded`+`external` (copre auto-enqueue/addAll/addAllBySlug) e
`favorites.enqueueDownloads` salta `external` (il retry del worker opera su righe coda → external mai
toccato). **Presente in libreria:** `library.list`/`stats` `inArray(['downloaded','external'])`, flag
`external` per episodio; `scan` tratta gli external via `localPath` reale (non mancanti, non orfani,
nessuna scrittura); `series.hasExistingDownload`/`request.availability`/`stats.dashboard` li contano
presenti. **Frontend:** `FolderActionsDialog` ([file-manager.tsx](apps/web/src/components/library/file-manager.tsx))
azione "Collega senza scaricare (esterno)" (scelta anime → `episode.byAnime` cachea gli episodi → SUB/
DUB → toast-report) + badge "Esterno" e delete per-episodio nascosto per gli external (mai cancellare i
file dell'utente) in [library-series-card.tsx](apps/web/src/components/library/library-series-card.tsx).
**+14 test (287)** (`parseEpisodeNumber`, `linkExternalFolder`, `addMissing` salta external, scan/list
external). **Step 14** (home personalizzabile: mostra/nascondi + riordina sezioni): nuovo campo config
**array** `homeLayout` (`homeSectionIdSchema` enum 8 sezioni + `homeSectionPrefSchema {id,visible}` +
`homeLayoutSchema = z.array(...).default([]).catch([])` in [config.ts](packages/shared/src/contracts/config.ts);
primo campo config non-primitivo — il `.catch([])` evita che un layout corrotto faccia fallire l'intero
`appConfigSchema.parse` di `getAll`, niente migrazione perché i valori sono già JSON-serializzati);
registro frontend [home-sections.ts](apps/web/src/components/home/home-sections.ts) (`HOME_SECTIONS`
id+label+icona + `resolveHomeOrder` merge forward-compat: voci salvate poi appende le nuove come
visibili); [home-view.tsx](apps/web/src/components/home/home-view.tsx) costruisce
`sectionNodes: Record<HomeSectionId,ReactNode>` e renderizza `order.filter(visible)` (la griglia
`lg:grid-cols-2` di "In onda oggi"/"Stagione in corso" sparisce → sezioni full-width riordinabili, no
regressione: lo Step 4 le restringeva solo a mezza larghezza); pannello **standalone**
[home-layout-section.tsx](apps/web/src/components/settings/home-layout-section.tsx) "Personalizza la home"
(pattern `RequestsSection`, toggle Eye/EyeOff + frecce su/giù, `config.set`+invalidate proprio) montato
in [settings-view.tsx](apps/web/src/components/settings/settings-view.tsx) come nuova sezione "Home"
(icona `LayoutGrid`) ed **escluso dal draft globale** (`dirtyKeys` salta `homeLayout`: il confronto per
riferimento vale solo sui primitivi); voce palette `Impostazioni: Home`. **+2 test (289)** (round-trip
`homeLayout` + resilienza `.catch` su valore corrotto). **Step 15** (calendario potenziato): il
calendario era solo `Tabs` per giorno con "oggi" come semplice `defaultValue` (nessun marcatore/data),
niente filtri, niente visione d'insieme. **Vincolo dati (verificato):** dal backend reale ogni
`AnimeSummary` del calendario ha `availableLanguages: []`, `genres: []` e l'entry `date: ''`
([api-source.ts:241-260](apps/api/src/sources/api-source.ts#L241-L260)) → niente filtro lingua/generi
(inaffidabili), date dei giorni **calcolate client-side**; lo `status` è quasi sempre `ONGOING` →
filtro stato inutile. **Scelte utente:** solo filtro **"Solo i miei seguiti"** (lingua/stato scartati)
+ **vista Settimana/Agenda**. **Frontend-only** (un file riscritto,
[calendar-view.tsx](apps/web/src/components/calendar/calendar-view.tsx)): switcher segmentato Per
giorno/Settimana + toggle seguiti (Button `aria-pressed`); helper `weekDates(now)` lunedì-based con
`Intl.DateTimeFormat('it-IT',{day,month:'short'})`; filtro via `useFollowedIds()`
([use-followed.ts](apps/web/src/lib/use-followed.ts), riuso del badge "Seguito" già su `AnimeCard`) con
empty state adattivo; vista Per giorno = tab con pallino/accento + data su "oggi"; vista Settimana = 7
sezioni impilate (`AnimeGrid` riusato) con la sezione di oggi evidenziata (`border-primary/40
bg-primary/5`). Nessun backend/contratto/test nuovo, 289 verdi a contorno. **Step 16** (wallpaper/sfondo
potenziato): [wallhaven.ts](apps/api/src/lib/wallhaven.ts) aveva `categories:'010'`+`purity:'100'`
hardcoded e [wallpaper-picker.tsx](apps/web/src/components/settings/wallpaper-picker.tsx) nessuna
anteprima/download/filtro. **Scelte utente:** tap=seleziona subito (invariato) + **lente** → anteprima;
categoria locked Anime, solo toggle **"Sketchy"** (`purity 100`→`110`), NSFW escluso (serve API key).
**Backend minimale:** nuovo `wallpaperSearchInputSchema {query?,sketchy?}` in
[theme.ts](packages/shared/src/contracts/theme.ts) (semantico — i bit wallhaven restano in lib, Regola
#6), `searchWallpapers(opts={query?,sketchy?}, logger?)` con `purity = sketchy?'110':'100'` (categorie
sempre `'010'`), router `theme.searchWallpapers` input cablato. **Frontend** (picker riscritto): stato
`sketchy` nella query (refetch al toggle), Popover filtro (`SlidersHorizontal` + pallino) col toggle
"Sketchy (contenuti artistici)" `aria-pressed`; tile = contenitore `relative` con `<button>` selezione
`absolute inset-0` + `<button>` lente `ZoomIn` (no button annidati); anteprima `Dialog max-w-3xl` con
`fullUrl`/risoluzione + azioni Imposta-sfondo/Scarica (`<a download target=_blank>`)/Apri-su-wallhaven;
nota "solo SFW" aggiornata. +2 test (291) (`sketchy`→`purity=110`, default→`100`). **Prossimo: Step 17**
(hardening backend + idee extra). _Aggiornare qui a ogni step._

## Stato attuale (2026-06-27)

**Batch "Potenziamenti diffusi" verso v0.10.0 (branch `feat/potenziamenti-diffusi`, non ancora
merge/release):** piano vivo in [plan/potenziamenti-diffusi.md](plan/potenziamenti-diffusi.md)
(gitignored). **Step 0** branch + governance (Regola #15, `plan/` gitignored, puntatori CLAUDE.md).
**Step 1** bug dettaglio anime (caso reale koori-no-jouheki: "0 episodi"/poster rotto/ep.13 mancante).
Tre cause distinte, fix mirati: (1) **conteggio reale** — l'API dichiara `episodeCount=0` per gli
ONGOING anche con episodi presenti, quindi `assembleDetailFromDb` ora ritorna
`Math.max(row.episodeCount, episodi distinti per number)` ([catalog-service.ts](apps/api/src/services/catalog-service.ts));
(2) **freschezza ONGOING** — il TTL del dettaglio per gli ONGOING è capato a 1h (`ONGOING_DETAIL_TTL_MS`
in `isRowFresh`) così la cache non nasconde l'ultimo episodio (default `catalogSyncHours`=24h); il
fallback al DB su source giù resta invariato; (3) **poster robusto** — `onError` + stato `coverFailed`
e riquadro `aspect-[2/3] bg-muted` nel Hero ([anime-detail.tsx](apps/web/src/components/catalog/anime-detail.tsx)),
più guardia che nasconde "0 episodi". **+2 test (257 verdi)**, lint/typecheck/build web verdi.
**Step 2** tema light/dark (il selettore non cambiava nulla): in [globals.css](apps/web/src/app/globals.css)
le palette `:root` e `.dark` erano identiche (entrambe scure) e `body { color-scheme }` fisso. Ora
`:root` ha una **vera palette light** (grigi neutri, accent verde invariato perché `AppTheme` lo
sovrascrive uguale nei due temi) + `color-scheme: light`, `.dark` resta la palette brand + `color-scheme:
dark`; rimosso il `color-scheme` fisso dal body. Polish a tema: `themeColor` PWA come array media-query
light/dark ([layout.tsx](apps/web/src/app/layout.tsx)) e skeleton hero `bg-white/10` → `bg-foreground/10`.
Solo CSS/tema, nessun test automatico (257 verdi a contorno), lint/typecheck/build web verdi. Verifica
manuale a runtime ancora da fare (toggle + wallpaper). **Step 3** toast iPhone + animazioni "invisibili".
Causa riverificata: l'utente ha provato a togliere iOS "Riduci movimento" e le animazioni restano
invisibili → non è il reduced-motion. L'unica animazione era la transizione di pagina (fade+slide 8px
in 0.2s, impercettibile) e dentro le pagine non si muove nulla. Quattro fix: (1) **toast a livello
banner** — `position` `top-right` → `top-center` + `offset={{ top: 'calc(env(safe-area-inset-top) +
16px)' }}` (sotto la status bar/Island su iPhone; desktop `env()`=0 → 16px) in
[providers.tsx](apps/web/src/components/providers.tsx); (2) **interruttore = fonte di verità** —
`reducedMotion={enabled ? 'never' : 'always'}` (da ON framer non sopprime mai, le animazioni si vedono
anche con Riduci movimento iOS; da OFF riduce + i componenti gated rendono statico) + `staleTime` 60s→10s
in [animation-provider.tsx](apps/web/src/components/layout/animation-provider.tsx) (l'`invalidate` della
config al salvataggio era già presente); (3) **transizione più decisa/affidabile** — rimosso
`AnimatePresence mode="wait"` (in App Router l'exit è inaffidabile), `motion.div` keyed su `pathname`
(rimonta a ogni navigazione), `y:12→0`, `0.28s ease-out` in
[page-transition.tsx](apps/web/src/components/layout/page-transition.tsx); (4) **micro-interazioni card**
— `<Card>` (dentro il `<Link>`, sizing `[&>*]` intatto) avvolta in `motion.div` con `whileHover y:-4` +
`whileTap scale:0.97`, gated da `useAnimationsOn()` in
[anime-card.tsx](apps/web/src/components/anime/anime-card.tsx); più nota costo GPU/CPU nell'hint del
campo Animazioni in Impostazioni. Decisione utente: l'interruttore in-app è autorevole. Niente
entrata/stagger per-card (rischio contenuto invisibile in SSR + Regola #1). Solo frontend, nessun test
nuovo (257 verdi a contorno), lint/typecheck/build web verdi. Verifica manuale a runtime ancora da fare
(toast iPhone sotto la status bar; ON/OFF animazioni evidente). **Step 4** home: card overlap + hero
bassa qualità. **Card overlap (causa reale):** non i badge in sé ma le due `Section` ("In onda oggi"/
"Stagione in corso") dentro `grid lg:grid-cols-2` ([home-view.tsx](apps/web/src/components/home/home-view.tsx))
che renderizzavano il carosello col default `lg:grid-cols-6` → 6 card spalmate su **mezza** larghezza
→ strette, badge collisi, testo tagliato. Fix: `Section` ora accetta `carouselClassName` inoltrato a
`CardCarousel`/`CardCarouselSkeleton` (twMerge → `lg:grid-cols-3` sovrascrive il default), le due
sezioni passano `lg:grid-cols-3`; badge robusti in [anime-card.tsx](apps/web/src/components/anime/anime-card.tsx)
(tipo `max-w-[60%] truncate`, footer `gap-2`, anno `shrink-0`, generi `min-w-0 truncate text-right`).
**Hero hi-res (banner + blur fallback, scelta utente):** il feed `/in-evidenza` ritorna solo
`coverImage` (poster 2:3, confermato in [docs/API_ANIMEUNION.md](docs/API_ANIMEUNION.md)); l'hero lo
stirava su un'area larga → sgranato. Il banner sta solo su detail/DB (`anime.banner_image`). Nuovo
tipo shared `featuredAnimeSchema`/`FeaturedAnime` (= summary + `bannerImage`,
[anime.ts](packages/shared/src/contracts/anime.ts)); `getFeatured` ritorna `FeaturedAnime[]`;
`apiFeaturedItemSchema` cattura il banner se il live lo espone; nuovo `catalog.bannersBySlugs(slugs)`
(single query indicizzata su slug) arricchisce in `home-service.featured` (live → DB → null), cablato
via `bannerLookup` in [context.ts](apps/api/src/context.ts); router `home.featured` output
`featuredAnimeSchema`. Rendering hero: banner full-bleed nitido se presente, altrimenti backdrop
poster sfocato (`scale-110 blur-2xl brightness-[0.55]`, mai upscaling) + poster nitido a destra su
lg+, testo `lg:max-w-[58%]`. **+4 test (261 verdi)** (`bannersBySlugs` + `home-service.test.ts`),
lint/typecheck/build web verdi. Verifica manuale a runtime ancora da fare (card non accavallate; hero
nitida con/senza banner in DB). **Step 5** popup che sforano nel gestore file (titoli lunghi). La
cornice del dialog era già robusta (`DialogContent` `max-h-[85dvh] overflow-y-auto overflow-x-hidden
w-[calc(100%-2rem)] max-w-lg`, [dialog.tsx](apps/web/src/components/ui/dialog.tsx); `DialogTitle`
`break-words pr-6`, `DialogDescription` `break-words`) e la Fase 5 aveva già troncato i risultati di
ricerca dei dialog e il titolo gruppo di "Mancanti". Restavano 3 punti che sforavano davvero, tutti in
[file-manager.tsx](apps/web/src/components/library/file-manager.tsx): (1) **righe episodio del
`RelinkDialog`** — il `<button>` `justify-between` aveva uno `<span>` (numero + titolo episodio) senza
`min-w-0`/`truncate` e un `<Badge>` senza `shrink-0`, così un titolo lungo spingeva fuori il badge →
ora span `min-w-0 flex-1 truncate`, badge `shrink-0`, button `gap-2`; (2) **blocco conferma riscarica
del `FolderActionsDialog`** — `<span>` con `<strong>{folder.name}</strong>` flex child senza `min-w-0`
→ ora `min-w-0 break-words` (nome cartella lungo va a capo nel riquadro rosso); (3) **riquadro "anime
scelto"** — `<p className="font-medium">{picked.title}</p>` → `break-words` (coerente col `break-all`
del path sotto). Niente refactor di "Mancanti" (`missing-dialog.tsx` già a posto; la vista dedicata è
lo Step 11, Regola #1). Solo CSS/markup, nessun test nuovo (261 verdi a contorno), lint/typecheck/build
web verdi. Verifica manuale a runtime ancora da fare (titoli lunghi troncati/a capo, badge/pulsanti
sempre visibili, niente scroll orizzontale anche a larghezza mobile). **Step 6** pulsante "AnimeUnion"
(logo AU) nel dettaglio. L'API non espone un URL web canonico (solo `slug`, già usato nel componente);
il path pubblico `/anime/<slug>` era un'assunzione del piano → **confermato dall'utente** (il sito
reale risponde 403 al fetcher, la ricerca era inconcludente). La favicon ufficiale
([icon-192.png](apps/web/public/icon-192.png)) è "AU" navy `#1c2333` in stile pennellata/corsivo → nuova
icona `AnimeUnionIcon` ([brand-icons.tsx](apps/web/src/components/anime/brand-icons.tsx)): SVG 24×24
coerente con `MalIcon` (`<rect rx=4>` navy + testo "AU" bianco `italic`/`fontWeight 800`). La riga link
esterni del `Hero` ([anime-detail.tsx](apps/web/src/components/catalog/anime-detail.tsx)) renderizzava
solo se `malId|anilistId` esistevano → ora **sempre visibile**, primo chip "Apri su AnimeUnion" →
`https://animeunion.tv/anime/<slug>` (`target=_blank rel=noopener noreferrer`, stesso stile dei chip
MAL/AniList che restano condizionali dopo). Solo frontend, nessun test nuovo (261 verdi a contorno),
lint/typecheck/build web verdi. Verifica manuale a runtime ancora da fare (chip visibile su ogni
scheda, apre la scheda giusta sul sito). **Step 7** notifiche: batching anti-rumore + test push/PWA.
**Causa rumore:** ogni `complete` del worker chiamava `notifications.create`
([context.ts](apps/api/src/context.ts)) → con MAX_CONCURRENT=1 e coda gigante (One Piece ~1000 ep)
~1000 righe + ~1000 inoltri Telegram/Push. **Fix coalescing per-anime senza timer:** nuovo
`notifyDownloadComplete({animeId,title,epNum})` in
[notification-service.ts](apps/api/src/services/notification-service.ts) con mappa aggregati in
memoria (chiave `animeId ?? '__none__'`, freschezza valutata lazy sull'evento successivo → niente
`setTimeout`, deterministico e testabile con `now`); entro `BATCH_WINDOW_MS=10min` fa UPDATE della
stessa riga `notification` ("Scaricati N episodi di X" / "Ultimo: episodio M", `read=0`, `createdAt`
bumped → risale in cima alla lista `desc(createdAt)`) e **NON** re-inoltra a Telegram/Push (inoltro
solo al primo episodio della sessione = anti-rumore); se l'UPDATE torna `changes===0` (riga
cancellata via clear) fallback a riga nuova. `create` estratto in `createNotification` locale (no
`this`). `context.ts` `worker.on('complete')` ora chiama il nuovo metodo (gate `notifyOnComplete`
invariato); i `download_failed` permanenti restano singoli. **Test invio push (mancava, solo
Telegram):** [push-service.ts](apps/api/src/services/push-service.ts) refactor invio in `sendToAll`
+ nuovo `test()` (`{ok,sent}`, `ok:false/sent:0` se nessuna sottoscrizione, altrimenti payload demo)
→ router [push.ts](apps/api/src/routers/push.ts) `push.test` (output inline) → pulsante "Invia
notifica di test" in [push-toggle.tsx](apps/web/src/components/settings/push-toggle.tsx) (solo se
`subscribed`). **Prova toast in-app:** campo "Prova notifica in-app" nella card Notifiche di
[settings-view.tsx](apps/web/src/components/settings/settings-view.tsx) (verifica posizionamento
top-center/safe-area dello Step 3). Centro notifiche invariato: il riassunto è già una riga
`download_complete` coperta da filtri/raggruppo. **+6 test (267 verdi)**
([notification-service.test.ts](apps/api/src/services/notification-service.test.ts) coalescing/nuova
sessione/anime separati/fallback + [push-service.test.ts](apps/api/src/services/push-service.test.ts)
`test()` con/senza sub), lint/typecheck/build web verdi. Verifica manuale a runtime ancora da fare
(una sola riga riassuntiva + un solo push per sessione; "Invia notifica di test" arriva; toast
top-center sotto la status bar). **Step 8** download: tenuta coda gigante (One Piece).
**Causa (verificata):** `download.queue` → `getQueue()` spediva **tutta** la coda joinata (1000+ righe ×
~20 campi) a ogni poll, sia in pagina ([downloads-view.tsx](apps/web/src/components/downloads/downloads-view.tsx))
sia nel widget navbar ([download-status.tsx](apps/web/src/components/downloads/download-status.tsx) — che
polla su **ogni** pagina, prima a 1.5s fissi anche da idle); le azioni "Annulla/Riprova" di gruppo
iteravano client-side su tutti gli item. **Fix — aggregazione server-side + paginazione on-demand:**
nuovo `getQueueSummary()` in [download-service.ts](apps/api/src/services/download-service.ts) →
`{ groups, counts }`: Query A `GROUP BY anime.id, status` (`count()`, niente righe) costruisce conteggi
per-gruppo + globali; Query B seleziona solo gli **in volo** (`downloading`/`processing`, ≤ MAX_CONCURRENT)
come `activeItems` per barra/velocità/ETA live → payload **O(#anime + #attivi)** invece di O(#coda). Gruppi
ordinati downloading-first poi per titolo. Mapping riga→item estratto in `mapRow` + colonne condivise
`queueSelectColumns` (riusate da `getQueue`, invariato per compat/test). Espansione card **paginata**
`getQueueGroupItems({animeId,filter,limit,offset})` → `{items,total}` (50/pagina, ordine per
`episode.number`); **azioni di gruppo** `cancelGroup`/`retryGroup` server-side (where su `episode.animeId`)
= una sola chiamata anche con 999 queued. Router: `download.summary`, `download.groupItems`,
`download.cancelGroup`, `download.retryGroup` (`download.queue` resta per compat, non più pollato).
Contratti shared additivi (`downloadCountsSchema`, `downloadGroupSummarySchema`, `downloadQueueSummarySchema`,
`downloadFilterSchema`, `downloadGroupItemsInputSchema`, `downloadQueuePageSchema`,
`downloadGroupActionInputSchema`). Frontend: pagina e widget passano a `download.summary` con interval
adattivo (1.5s in volo / 5s idle); card da `DownloadGroupSummary` con header dai conteggi (`completed/total`,
"N in coda", "N falliti", velocità/ETA/overall da `activeItems`), espansione lazy paginata (← →, "X–Y di Z")
con refetch solo se il gruppo è in volo, reset pagina al cambio filtro in render; widget mostra gli in volo
live + riga "N in coda • N completati" invece di elencare i completati (anti-rumore). **+6 test (273 verdi)**
([download-service.test.ts](apps/api/src/services/download-service.test.ts): `getQueueSummary` conteggi/
activeItems/ordinamento, `getQueueGroupItems` paginazione/ordine/filtro, `cancelGroup`/`retryGroup` scoping),
lint/typecheck/build web verdi. Verifica manuale a runtime ancora da fare (serie lunga via `addAllBySlug`:
UNA card con riassunto, espansione paginata, widget fluido, azioni di gruppo con una chiamata). **Step 9**
ricerca: velocità + pagina risultati + ricerca in-app. **Causa lentezza (verificata):** la palette ⌘K
([command-palette.tsx](apps/web/src/components/layout/command-palette.tsx)) interrogava `catalog.search`
a **ogni tasto** (nessun debounce); il server è già local-first (cache fresca → `searchDb`; stale →
live + fallback DB), quindi il vero collo di bottiglia era il **flood di query per-keystroke**. Tre fix,
solo frontend: (1) **debounce** — nuovo hook `useDebouncedValue<T>(value, delayMs)` in
[use-debounced-value.ts](apps/web/src/lib/use-debounced-value.ts) (nessun debounce nel repo); l'input
resta istantaneo, la query tRPC usa `debouncedQuery` (220ms) → `enabled`/`useQuery` su di esso, il
filtro `actions` resta sul `query` live; server invariato. (2) **Enter → pagina risultati** — una pagina
risultati completa esisteva già (`/catalog?q=`, [catalog-browser.tsx](apps/web/src/components/catalog/catalog-browser.tsx)
paginata + tutti i filtri): quando `q.length>=2` la palette mostra come **prima entry** `Cerca "<q>" nel
catalogo` → `go('/catalog?q='+encodeURIComponent)` → Invio apre i risultati completi (scelta confermata
dall'utente); **niente route `/search` ridondante** (avrebbe duplicato `CatalogBrowser`, Regola #1). (3)
**ricerca in-app** — nuovo `extraActions` (Gestore file → `/library/files`, Informazioni → `/about`, le
**9 sezioni Impostazioni** → `/settings?section=<id>`, label es. "Impostazioni: Aspetto e tema" così
"tema" matcha) cercabili via il filtro `[...actions, ...extraActions]` ma non mostrate di default (vista
no-query = `actions`, non affollata). **Deep-link sezione** in
[settings-view.tsx](apps/web/src/components/settings/settings-view.tsx): `useSearchParams` + helper
`isSectionId` (whitelist da `SECTIONS`), init lazy di `active` da `?section=` + effetto URL→stato (sola
direzione, niente loop col rail) per gestire anche la navigazione mentre si è già su /settings;
[settings/page.tsx](apps/web/src/app/(app)/settings/page.tsx) avvolge `SettingsView` in `Suspense`
(richiesto da `useSearchParams`; in build `/settings` resta prerenderizzata statica). Frontend-only,
nessun test nuovo (273 verdi a contorno, coerente col pattern Step 2-6), lint/typecheck/build web verdi.
Verifica manuale a runtime ancora da fare (palette senza lag/flood; Invio → /catalog?q= con
filtri+paginazione; cercare "notifiche"/"tema"/"gestore file" porta alla sezione/pagina giusta).
**Step 10** seguiti: potenziamento "gestisci" + elimina file. **Causa (verificata):**
[follow-card.tsx](apps/web/src/components/follows/follow-card.tsx) aveva cambia-stato, "Scarica episodi
mancanti", toggle auto e "Rimuovi", ma **mancava** l'eliminazione dei file scaricati (esisteva solo in
[library-series-card.tsx](apps/web/src/components/library/library-series-card.tsx), che usa
`library.deleteSeries`/`deleteEntry` + `deleteFolder` con un Dialog di conferma). **Fix frontend-only
(riuso, coerente col pattern Step 2/3/5/6/9):** nuova voce **rossa** "Elimina file scaricati" nel menu,
visibile solo per i seguiti `completed`/`dropped` (`canDeleteFiles` — per gli stati attivi si continua a
scaricare) → apre un Dialog di conferma (mirror di `library-series-card`) con warning esplicito
"tutti i file della serie (tutte le stagioni/lingue collegate)" — `deleteSeries` è franchise-wide come la
"Elimina intera serie" della libreria — checkbox `deleteFolder` (anche cartella + file extra) e bottone
"Elimina definitivamente". `trpc.library.deleteSeries.useMutation` (servizio **già testato**, nessun
backend toccato): toast contestuale (warning se `failedFiles`, info se 0 file, success con byte liberati)
e invalida `library.list`/`library.stats`/`download` (intero router)/`catalog`/`follow.list`; **l'anime
resta tra i seguiti**. **Rifinitura menu:** "Rimuovi" → "Smetti di seguire" (disambigua dalla nuova
elimina-file), voci distruttive raggruppate sotto il separatore, e `addAll` ("Scarica episodi mancanti")
ora invalida l'intero router `download` (prima solo `download.queue`, non più pollato dallo Step 8) così
il widget summary riflette subito gli episodi accodati. Frontend-only, nessun test nuovo (273 verdi a
contorno), lint/typecheck/build web verdi. Verifica manuale a runtime ancora da fare (su un seguito
completato/droppato → "Elimina file scaricati" cancella i file con/senza cartella, l'anime resta nei
seguiti, libreria/widget aggiornati; per gli stati attivi la voce non compare; "Smetti di seguire" non
tocca i file). **Step 11** gestore file: relink dinamico + rinomina serie + vista "Mancanti".
**Cause (verificate):** (1) dopo "Ri-scarica" del `FolderActionsDialog` (`remove`+`download.addAllBySlug`)
gli episodi sono **accodati** → i file scendono async; `refresh()` invalida `files.list` subito ma la
lista **non si aggiornava più da sola** (cartella "Non importato"/orfani "non collegato" fino a refresh
manuale); (2) la rinomina **già preserva i link** (`files.rename`→`syncMovedPaths` riscrive i `localPath`
figli in transazione, [file-manager-service.ts](apps/api/src/services/file-manager-service.ts)) ma la UI
generica non rassicurava; (3) "Mancanti" era solo un badge nel riepilogo scansione Libreria che apriva
`missing-dialog.tsx`, stretto per serie lunghe. **Fix frontend-only (riuso, coerente con Step 5/6/9/10):**
**(A) relink dinamico** — [file-manager.tsx](apps/web/src/components/library/file-manager.tsx) polla
`download.summary` (aggregato leggero, Step 8) con `refetchInterval` adattivo (4s se in volo, altrimenti
`false`) e dà a `files.list` un `refetchInterval` 5s guidato dallo stesso conteggio (`downloadsActive`) →
la lista passa a managed/collegato **senza refresh manuale**; `refresh()` invalida l'intero router
`download` (prima `download.queue`, non più pollato). **(B) rinomina serie** — nel dialog Rinomina, per
le cartelle `managed` (`type==='dir'`), titolo "Rinomina la serie" + nota «I collegamenti agli episodi di
questa serie verranno aggiornati automaticamente: i file restano scaricati e nella libreria»; backend
invariato e già testato. **(C) vista "Mancanti" dedicata** — nuova pagina
[library/missing/page.tsx](apps/web/src/app/(app)/library/missing/page.tsx) + nuovo
[missing-view.tsx](apps/web/src/components/library/missing-view.tsx): azione "Controlla la libreria"
(riusa `library.scan`, risultato in `scan.data`, niente auto-mutation a ogni visita → sicuro su librerie
giganti), mancanti per serie **a tutta larghezza** (riuso `groupByAnime`+`ClassifyButton` estratti dal
vecchio dialog) con chip dei numeri (cap 40 + "+N altri"), annotazione "N presenti · M mancanti"
(incrocio `library.list`), `download.addMissing` per serie + "Ri-scarica tutti", stati vuoti (CTA prima
del controllo, "tutto a posto" dopo). [library-view.tsx](apps/web/src/components/library/library-view.tsx):
badge "Mancanti" → `Link` a `/library/missing` (rimossi `MissingDialog`/stato), `missing-dialog.tsx`
**cancellato**; accesso "Episodi mancanti" aggiunto nell'header del gestore file. Frontend-only, nessun
test nuovo (273 verdi a contorno), lint/typecheck/build web verdi (`/library/missing` prerenderizzata
statica). Verifica manuale a runtime ancora da fare (gestore file che si aggiorna da solo durante i
download; rinomina serie che mantiene i link; `/library/missing` a tutta larghezza con Classifica/
Ri-scarica). **Step 12** gestore file: multi-season alla riscarica → correlazioni. **Causa
(verificata):** "Ri-scarica" di una cartella ([file-manager.tsx](apps/web/src/components/library/file-manager.tsx)
`FolderActionsDialog`) eliminava la cartella e chiamava `download.addAllBySlug({slug})` = i mancanti di
**una sola** entry ([download-service.ts:314-321](apps/api/src/services/download-service.ts#L314)); una
serie multi-stagione scaricata esternamente (`<Serie>/Season 01`, `Season 02`, …) perdeva le altre
stagioni. Sul catalogo il caso è già risolto dal flusso correlazioni (`series.franchise` + classifica
per voce). **Fix frontend-only (riuso, coerente con Step 5/6/9/10/11):** **(A) rilevamento
multi-stagione senza backend** — i figli di una cartella-serie hanno già `FileEntry.extra` (da
`isExtraEntry`→`isContentFolderName`, [file-manager-service.ts:95-103](apps/api/src/services/file-manager-service.ts#L95)):
le stagioni sono `dir && !extra`, `>=2` = multi-stagione (`childrenQ = files.list({path})`). **(B) ramo
riscarica** — per le cartelle multi-stagione la vista "anime scelto" mostra una nota "N stagioni" (icona
`Layers`) e il bottone diventa "Ri-scarica tutte le stagioni"; il flusso elimina la cartella
(`files.remove`) e, on success, apre il dialog correlazioni (nuova prop `onMultiSeasonRedownload`) invece
della singola `addAllBySlug`; il caso ≤1 stagione resta invariato. **(C) montaggio dialog** — `FileManager`
con stato `franchise` renderizza [relations-download-dialog.tsx](apps/web/src/components/catalog/relations-download-dialog.tsx)
(`RelationsDownloadDialog related={[]} slug autoDiscover`): la lista è popolata da `series.franchise`,
ogni voce si classifica via `RelationClassifyButton`→`series.setOverride` e si accoda via `addAllBySlug`
= ogni stagione mappata alla sua entry AnimeUnion. **(D) ritocchi al componente riusato** — nuova prop
`autoDiscover?: boolean` (default `false`; dal gestore file la scoperta franchise parte da sola, dal
catalogo resta il click manuale) e `onConfirm` ora invalida l'intero router `download` (non più solo
`download.queue`, non pollato dallo Step 8 → allineamento). Nessun servizio core toccato, nessun test
nuovo, 273 verdi a contorno, lint/typecheck/build web verdi. Verifica manuale a runtime ancora da fare
(cartella con più "Season NN" → "Ri-scarica tutte le stagioni" apre il dialog correlazioni con scoperta
avviata, selezione/classifica/accodamento per ogni stagione; cartella a stagione singola invariata).
**Step 13** gestore file: collega senza scaricare (stato `external`). **Caso reale:** l'utente ha già i
file su disco (scaricati altrove) e vuole che l'app li conosca senza ri-scaricarli né spostarli.
**Niente migrazione DB (deviazione dal piano):** `episode_file.download_status` è
`text DEFAULT 'not_downloaded'` **senza CHECK** ([0000_init.sql:100](apps/api/drizzle/0000_init.sql#L100)),
l'enum vive solo nel contratto zod → aggiunto `'external'` a `episodeFileStatusSchema`
([enums.ts](packages/shared/src/contracts/enums.ts)); una `0013` sarebbe un no-op (Regola #1). `mappers.ts`
usa `episodeFileStatusSchema.catch('not_downloaded')` → senza il valore degraderebbe l'external.
**Scelta utente: mapping cartella-auto.** Nuovo `parseEpisodeNumber(name)` esportato + tested
(SxxExx → marcatori Ep/Episodio/E/# → "- 12" fansub → fallback unico numero scartando
risoluzioni/codec/anni) e `linkExternalFolder(path, animeId, language)` in
[file-manager-service.ts](apps/api/src/services/file-manager-service.ts): legge i file video **diretti**
della cartella (no ricorsione, no `.part`), ricava il numero, risolve l'`episode_file`
`(episode.animeId, episode.number, language)` e — se non già `downloaded` — lo marca `external` con
`localPath` puntato al file dell'utente (**senza spostarlo**), `fileSize` da `stat`; report
`{linked,skipped,unmatched}`. Router `files.linkExternalFolder`. **Esclusioni (anti ri-download):**
`addMissing` salta `downloaded`+`external` (copre `enqueueForAutoFollows`/`addAll`/`addAllBySlug`) e
`favorites.enqueueDownloads` salta `external` (il retry del worker opera su righe `download_queue` →
gli external, senza riga coda, non sono mai toccati). **Presente in libreria + scan sicuro:**
`library.list`/`library.stats` `inArray(['downloaded','external'])`, flag `external` per episodio nel
contratto; `library.scan` tratta gli external via `localPath` reale (path atteso = localPath) così non
finiscono né in `missingEntries` né tra gli orfani e **non** vengono riscritti a `downloaded`;
`series.hasExistingDownload`/`request.availability`/`stats.dashboard` li contano "presenti".
**Frontend:** `FolderActionsDialog` ([file-manager.tsx](apps/web/src/components/library/file-manager.tsx))
ha l'azione "Collega senza scaricare (esterno)" (scegli anime → `episode.byAnime` cachea gli episodi →
SUB/DUB → `files.linkExternalFolder` con toast-report); badge "Esterno" + delete per-episodio nascosto
per gli external (mai cancellare i file dell'utente; entry/serie già filtrano `downloaded`) in
[library-series-card.tsx](apps/web/src/components/library/library-series-card.tsx). **Limite noto:**
niente "scollega" dedicato (undo = ri-collegare un altro anime o eliminare la cartella). **+14 test
(287 verdi)** (`parseEpisodeNumber` 10 pattern, `linkExternalFolder` no-move/report/salta-scaricati/
unmatched, `addMissing` salta external, `library.scan`+`list` external), lint/typecheck/build web verdi.
Verifica manuale a runtime ancora da fare (cartella "Season NN" esterna → "Collega senza scaricare" →
episodi in libreria con badge "Esterno", file non spostati, niente download/auto-enqueue).
**Step 14** home personalizzabile: mostra/nascondi + riordina sezioni. **Decisione utente:** frecce
su/giù + toggle visibilità (no drag&drop). La preferenza vive in `config` (parità web/PWA/mobile).
**Approccio (frontend + 1 campo config array + 2 test):** (1) **contratto** — `homeLayout` array in
`appConfigSchema` ([config.ts](packages/shared/src/contracts/config.ts)) con `homeSectionIdSchema`
(enum 8 sezioni), `homeSectionPrefSchema {id,visible}`, `homeLayoutSchema =
z.array(...).default([]).catch([])`. È il **primo campo config non-primitivo**: nessuna migrazione
(i valori config sono già `JSON.stringify`/`parse` in [config-service.ts](apps/api/src/services/config-service.ts)),
e il `.catch([])` impedisce che un layout corrotto/legacy faccia fallire l'intero
`appConfigSchema.parse(raw)` di `getAll` (ricade su `[]` = ordine di default). (2) **registro** —
nuovo [home-sections.ts](apps/web/src/components/home/home-sections.ts): `HOME_SECTIONS`
(id+label IT+icona, ordine default) + `resolveHomeOrder(saved)` forward-compat (prima le voci salvate
ancora nel registro nell'ordine scelto, poi appende le sezioni nuove come `visible` → aggiungere
sezioni in futuro non perde le preferenze). (3) **render** —
[home-view.tsx](apps/web/src/components/home/home-view.tsx) legge `config.getAll`, costruisce
`sectionNodes: Record<HomeSectionId,ReactNode>` (Hero + Section/SectionBlock invariate) e renderizza
`order.filter(visible)` con `Fragment` keyed. **Conseguenza voluta (no regressione):** la griglia
`lg:grid-cols-2` che accoppiava "In onda oggi"+"Stagione in corso" sparisce (sezioni ora indipendenti
e riordinabili) → diventano `Section` full-width (carosello default); lo Step 4 le aveva ridotte a 3
colonne **solo** perché a mezza larghezza, a piena larghezza il cramping non esiste (rimossi i
`carouselClassName="lg:grid-cols-3"`). (4) **pannello standalone** — nuovo
[home-layout-section.tsx](apps/web/src/components/settings/home-layout-section.tsx) "Personalizza la
home" (pattern `SecuritySection`/`RequestsSection`: stato + `config.set`+invalidate propri, fuori dal
draft globale), righe con toggle Eye/EyeOff + frecce su/giù (disabilitate agli estremi), dirty via
`JSON.stringify`, `Salva`/`Annulla`/`Ripristina predefinito`. (5) **montaggio** —
[settings-view.tsx](apps/web/src/components/settings/settings-view.tsx): nuova sezione `home` (icona
`LayoutGrid`, entra in rail/pillole/whitelist deep-link) + **esclusione di `homeLayout` da `dirtyKeys`**
(`&& key !== 'homeLayout'`): il confronto dirty è per riferimento e vale solo sui primitivi, così un
array non fa scattare la barra "Modifiche non salvate" né viene riscritto dal Salva globale. (6)
**palette** — voce `Impostazioni: Home` ([command-palette.tsx](apps/web/src/components/layout/command-palette.tsx)).
**+2 test (289 verdi)** ([config-service.test.ts](apps/api/src/services/config-service.test.ts):
round-trip `homeLayout`; valore corrotto → `getAll` non lancia, `[]`), lint/typecheck/build web verdi
(`/settings` resta statica). Verifica manuale a runtime ancora da fare (Impostazioni → Home →
nascondi/riordina → Salva riflesso in home; "Ripristina predefinito"; nessuna falsa barra "Modifiche
non salvate"; deep-link/palette `home`; nessuna regressione mobile). **Step 15** calendario potenziato.
**Causa/limite (verificato):** il calendario ([calendar-view.tsx](apps/web/src/components/calendar/calendar-view.tsx))
era solo `Tabs` per giorno con "oggi" = semplice `defaultValue` (nessun marcatore visivo né data),
nessun filtro, nessuna visione d'insieme (6 giorni su 7 nascosti). **Vincolo dati reale:** dal backend
vivo ogni `AnimeSummary` del calendario ha `availableLanguages: []`, `genres: []` e l'entry `date: ''`
([api-source.ts:241-260](apps/api/src/sources/api-source.ts#L241-L260)) → filtro lingua/generi
impossibile (dati vuoti), date dei giorni da calcolare client-side; lo `status` è quasi sempre
`ONGOING` → filtro stato inutile. **Scelte utente (plan mode):** solo filtro **"Solo i miei seguiti"**
(lingua/stato scartati) + **vista Settimana/Agenda**. **Fix frontend-only (un file riscritto, coerente
con Step 5/6/9/10/11/12):** `view: 'day'|'week'` + `onlyFollowed` (`useState`); barra controlli con
switcher segmentato Per giorno/Settimana (`Button` `ghost`/`default` + `aria-pressed`, icone
`CalendarDays`/`Rows3`) e toggle seguiti (`Button` `outline`/`default` + `aria-pressed`, `Check`);
helper `weekDates(now)` lunedì-based (offset a lunedì poi `monday+i`) con
`Intl.DateTimeFormat('it-IT',{day:'numeric',month:'short'})` per le date reali; `DAYS` esteso con
etichetta lunga IT; `itemsForDay` filtra con `useFollowedIds()`
([use-followed.ts](apps/web/src/lib/use-followed.ts), riuso del badge "Seguito" già su `AnimeCard`) e
empty state adattivo. **Vista Per giorno:** `Tabs` con `TabsList h-auto flex-wrap`, tab di "oggi" con
pallino `bg-primary` + accento `data-[state=inactive]:text-primary` e data reale sotto la sigla.
**Vista Settimana:** 7 `section` impilate con header (nome lungo + data + badge "Oggi" + conteggio),
`AnimeGrid` riusato per ogni giorno, sezione di oggi evidenziata (`border-primary/40 bg-primary/5`).
**Deviazioni (Regola #1):** niente filtro lingua/stato; niente indicatore "in arrivo" legato a
`new_episode`/`season_available` (servirebbe correlazione backend — coperto da badge "Seguito" +
evidenziazione oggi). Frontend-only, nessun test nuovo (289 verdi a contorno), lint/typecheck/build web
verdi (`/calendar` prerenderizzata statica). Verifica manuale a runtime ancora da fare (tab di oggi
marcato con data; vista Settimana con oggi evidenziato; "Solo i miei seguiti" filtra ogni giorno;
nessuna regressione mobile). **Step 16** wallpaper/sfondo potenziato. **Causa/limite (verificato):**
[wallhaven.ts](apps/api/src/lib/wallhaven.ts) aveva `categories:'010'` e `purity:'100'` **hardcoded**
(nessun filtro) e [wallpaper-picker.tsx](apps/web/src/components/settings/wallpaper-picker.tsx) era una
griglia di thumbnail dove il click seleziona subito, **senza anteprima grande, download, né filtri**.
**Scelte utente (plan mode):** (1) tap su una tile **seleziona subito** (comportamento attuale) + una
**icona lente** in alto a destra apre l'**anteprima a schermo intero**; (2) categoria resta **solo
Anime** (locked `'010'`), il filtro aggiunge **solo il toggle "Sketchy"** (`purity 100`→`110`), NSFW
escluso (richiede API key wallhaven) → contratto minimale. **Backend (parametrizzazione, lib core →
test):** nuovo `wallpaperSearchInputSchema = z.object({query?,sketchy?})` + type in
[theme.ts](packages/shared/src/contracts/theme.ts) — **semantico**, la codifica purity/categorie resta
confinata in `wallhaven.ts` (Regola #6); firma `searchWallpapers(opts={query?,sketchy?}, logger?)` con
`purity = opts.sketchy ? '110' : '100'` e `categories` sempre `'010'`; router
[theme.ts](apps/api/src/routers/theme.ts) `.input(wallpaperSearchInputSchema.optional())` passa
`input ?? {}`. **Frontend** (picker riscritto): stato `sketchy` (default false) nella query
`theme.searchWallpapers({query,sketchy})` → refetch al toggle; **Popover filtro** accanto a Cerca
(icona `SlidersHorizontal`, pallino se attivo) con toggle "Sketchy (contenuti artistici)"
(`aria-pressed`, pattern Step 15); ogni tile è ora un contenitore `relative` (niente `<button>`
annidati) con un `<button>` selezione `absolute inset-0` (tap = `onChange`, overlay `Check` se attiva)
e un `<button>` **lente** `ZoomIn` in alto a destra `z-10` → apre l'anteprima; **anteprima** `Dialog`
`max-w-3xl` con `fullUrl`/risoluzione e azioni **Imposta come sfondo** (`onChange`+chiude) / **Scarica**
(`<a href={fullUrl} download target=_blank rel=noopener>`, cross-origin → apre il full-res) / **Apri su
wallhaven** (`pageUrl`); nota "solo SFW" → "SFW di default; abilita «Sketchy» nei filtri". **+2 test
(291 verdi)** ([wallhaven.test.ts](apps/api/src/lib/wallhaven.test.ts): le 2 chiamate esistenti passano
a `searchWallpapers({query})`; `sketchy:true` → URL con `purity=110`+`categories=010`; default →
`purity=100`), lint/typecheck/build web verdi (`/settings` resta statica). Verifica manuale a runtime
ancora da fare (toggle Sketchy cambia i risultati; tap applica lo sfondo; lente → anteprima; Scarica
apre il full-res; nessuna regressione Setup wizard/mobile). **Prossimo: Step 17** (hardening backend +
idee extra).

## Stato precedente (2026-06-25)

**Batch "Seerr per AnimeUnion" — API di richiesta in ingresso (branch `feat/seerr-request-api` →
`main`, rilasciato **v0.9.0**):** apre il nodo **#15** di [docs/JELLYFIN.md](docs/JELLYFIN.md). Insight: i due
"nodi aperti" (mapping id TMDB/TVDB, stagioni) esistevano **solo** perché Seerr ragiona in TMDB/TVDB;
restando in **ontologia anime-native** (slug/MAL/AniList — ogni cour è già una entry) si sciolgono.
Decisione con l'utente: niente plugin Jellyfin C# (rompe lo stack) né interop Jellyseerr ora — la web
UI resta la vetrina, si aggiunge **solo** un'API REST in ingresso. Piano a step (Regola #14) in
`~/.claude/plans/apri-la-sessione-per-purring-waffle.md`. **Fatto: Step 0-4.** **0** contratto shared
`requests.ts` (`requestInputSchema`/`requestResultSchema`/`requestStatusSchema`). **1** auth
`X-Api-Key` (`request-auth-service`, clone `lock-service`: scrypt+hash a riposo) + rotta Fastify fuori
da tRPC + router tRPC `requests` + card "Integrazioni" in Impostazioni + redazione header nei log.
**2** risoluzione anime-native (`request-service.resolve`: slug→anilistId/malId→title+season) +
migrazione `0012` (indici `idx_anime_mal`/`idx_anime_anilist`) + `catalog.findByExternalId`. **3**
azione `fulfill` = follow (watching+auto) + `download.addAllBySlug` (Regola #13), idempotente, rotta
`POST /api/integration/requests` (200/400/401/404/412). **4** `GET /api/integration/anime/:slug/status`
(disponibilità) + docs [docs/INTEGRATION_API.md](docs/INTEGRATION_API.md) + riscrittura #15 in
JELLYFIN.md. **Limite onesto:** gli id esterni risolvono solo contro la cache (l'API AnimeUnion non
espone lookup per id) → per il match robusto usare slug o title. **255 test verdi**, lint/typecheck/
build web verdi. **Batch COMPLETO (Step 0-4).**

## Stato precedente (2026-06-25)

**Batch rifiniture (branch `feat/follow-status-aware-e-rifiniture`, non ancora merge/
release):** piano a step in `~/.claude/plans/dobbiamo-potenziare-la-logica-parallel-pnueli.md`
(vedi banner "AVANZAMENTO" in cima). **Regola #14** attiva: ogni step prima approfondito (checkbox)
poi implementato + commit dedicato. **Fatti: Step 0-6.** **0** regola di processo (`683787e`).
**1** follow status-aware: per gli anime `COMPLETED` la spunta auto-download e' disabilitata/
oscurata (con nota); `enqueueForAutoFollows` ora e' async, esclude i COMPLETED e per gli ONGOING fa
refresh attivo del catalogo (`getBySlug forceRefresh`) per rilevare i nuovi episodi (`94d3afd`).
**2** polish mobile: zoom PWA off (`viewport maximumScale/userScalable`), fix tastiera ricerca iOS
(drawer "Altro" `onCloseAutoFocus` preventDefault), caroselli orizzontali in Home (`CardCarousel`,
solo Home) (`18d158e`). **3** popup: `DialogTitle` con `break-words/leading-tight/pr-6` + rimosso
`truncate` dai titoli dinamici (`4fca848`). **4** gestore file: contenuto = Season/Special/OVA/ONA
(+Movie); resto = Extra (nuovo `isExtraEntry` su `segs[1]`); UI badge "Extra" vs "Non importato";
gli Special passano a contenuto (`7890843`). **5** libreria: `library.list()` raggruppa per
(categoria, `seriesId`) → una card per serie/franchise con SUB+DUB e stagioni unite; contratto
shared rifatto (`libraryEntrySchema`/`libraryGroupSchema`, rimosso `libraryItemSchema`); UI con
sezioni "Serie TV"/"Film" e card che annida stagione→lingua→episodi (`8ed6731`). **6** Jellyfin:
solo documentazione — nuovo [docs/JELLYFIN.md](docs/JELLYFIN.md) con le idee future raccolte e
prioritizzate (tier 1-4); **candidati n.1** del prossimo batch = coppia **#1 refresh dopo download**
+ **#4 sidecar NFO/artwork**; **#15 richieste stile Jellyseerr/Overseerr** tenuta come **ipotesi**
(due nodi aperti: mapping id TMDB/TVDB→AnimeUnion e gestione stagioni). Nessun codice toccato.
**230 test verdi**, lint/typecheck/build web verdi a ogni step. **Batch rifiniture COMPLETO
(Step 0-6).** Restano solo verifiche manuali a runtime (annotate nel piano).

## Stato precedente (2026-06-22)

**Fase 5 rifiniture frontend (branch `feat/fase-5-rifiniture`, v0.7.1):** patch mirata — l'audit ha
confermato che la Fase 5 era **in gran parte gia' coperta** dalle fasi 1-4 (a11y icon-only completa,
focus-trap via Radix, dialog responsive puliti grazie alla base di Fase 1, command palette non
collide con la safe-area). Restavano due fix: **5A** `pb-safe-b` nella variante `bottom` del `Sheet`
([sheet.tsx](apps/web/src/components/ui/sheet.tsx)) cosi' i bottom-sheet (filtri catalogo) non vanno
sotto l'home indicator iOS (rimosso il duplicato nel drawer "Altro"); **5B** troncamento dei titoli
lunghi nei risultati di ricerca dei dialog del gestore file. Solo CSS, **222 test verdi**,
lint/typecheck/build verdi. **Roadmap a fasi completata** (Fasi 1-5 rilasciate v0.5.3 -> v0.7.1).

**Fase 4 potenziamento Libreria & Gestore file (branch `feat/fase-4-libreria-gestore-file`,
v0.7.0):** richiesta principale dell'utente. **4A Eliminazione affidabile**: `removeFiles` usa sempre
`localPath`, verifica che il file sia davvero sparito e conta i fallimenti (`failedFiles`) senza
marcare "non scaricato" cio' che resta su disco; opzione `deleteFolder` che rimuove ricorsivamente la
cartella serie (`<root>/<primo-segmento>`, confinata) compresi file non tracciati/extra. **4B**
`FileEntry.managed` per le cartelle (contiene un file tracciato) + ordinamento "non importate" in cima
+ badge UI. **4C Flusso Mancanti**: `missingEntries` ora porta `animeId`/`episodeFileId`; "Mancanti"
diventa un pulsante -> `missing-dialog.tsx` con classificazione (`ClassifyFields`) e ri-scarica in
blocco (`download.addMissing`). **4D**: ricerca + ordinamento libreria (alfabetico/ultimo aggiunto/
dimensione/episodi, asc/desc), client-side su `library.list`. Shared:
`libraryDeleteResult.failedFiles`, `deleteFolder` negli input delete, `FileEntry.managed`. **222 test
verdi** (nuovi: deleteFolder, missingEntries arricchiti, managed+sort). Lint/typecheck/test/build
verdi. Nota: un flake una-tantum su `follow-service` sotto carico parallelo non riproducibile (file
non toccato). **Prossima:** Fase 5 (rifiniture frontend + a11y).

**Fase 3 hardening backend (branch `feat/fase-3-hardening`, v0.6.1):** patch mirata (gran parte della
Fase 3 era gia' coperta: scheduler tutto in try/catch, `setOverride` gia' valida l'esistenza, no
ri-accodamento dei completati). **3A** `setOverride` rifiuta serie madre = se stessa e 2-ciclo
(`PreconditionError`). **3B** `syncMovedPaths`/`syncDeletedPaths` del gestore file ora in
`db.transaction` (read+update atomici). **3C** redazione `downloadUrl`/`sourceUrl` nei log
([logger.ts](apps/api/src/lib/logger.ts)). **3D** avviso al cambio di una cartella di download con file
esistenti sotto la vecchia root (hook in `config.set` + `config.countDownloadsUnder`, notifica `info`).
Rimandato di proposito: cooldown per i 4xx permanenti nell'auto-enqueue (il retry dei `failed` ogni
30min e' voluto). **220 test verdi** (nuovi: self-parent/ciclo, `countDownloadsUnder`). Lint/typecheck/
test/build verdi. **Prossime:** Fase 4 Libreria/Gestore file, Fase 5 rifiniture.

**Fase 2 robustezza download (branch `feat/fase-2-robustezza-download`, v0.6.0):** dal piano a fasi.
Migrazione `0011` (`download_queue.target_path/expected_bytes/source_url`). **Self-healing al riavvio**
(`reconcileOrphans`: se il file e' gia' al `target_path` con la dimensione attesa, crash tra rename e
commit, la riga viene finalizzata invece di marcata failed). **Resume sicuro**: il `.part` si riprende
solo se `source_url` salvato == URL ri-risolto (gli URL AnimeUnion scadono; altrimenti si scarta il
parziale e si riparte da zero). **Integrita'**: il downloader rifiuta i troncamenti (`bytesDownloaded
!= Content-Length`) e i contenuti testuali senza firma video (helper `looksLikeVideoStart`/
`looksLikeText`). **Sweep `.part`**: errori loggati invece che ingoiati. **Fix numerazione parti**: in
`previousPartsEpisodeCount` la serie base/root conta come parte 1 quando la stagione corrente e' la sua
(Sakamoto Days parte 2 -> `S01E12`; War of Underworld season 4 con override su entrambe le parti resta
corretto). Nota: la guardia disco pre-move del piano e' stata scartata (l'`atomicMove` e' un rename
same-volume, non consuma spazio). **217 test verdi** (nuovi: renamer Sakamoto, http-downloader
troncamento/testo, worker self-healing/resume sicuro). Lint/typecheck/test/build verdi. **Prossime:**
Fase 3 hardening, Fase 4 Libreria/Gestore file, Fase 5 rifiniture.

**Fase 1 accorgimenti UX (branch `feat/accorgimenti-fase-1-ux`, v0.5.3):** fix bug UI a basso
rischio dal piano a fasi (`plans/proponimi-un-piano-di-flickering-pelican.md`). **Popup overflow**
risolto alla radice (`DialogContent` con `overflow-x-hidden` + `ClassifyFields` con griglie
`grid-cols-1 sm:grid-cols-N` e campo percorso che va a capo); **safe-area iOS top** sulla navbar
(`pt-safe-t`, il dock in basso già usava `pb-safe-b`); **scorciatoia `Ctrl K`** su Windows/Linux
(hook `use-shortcut-label`, l'handler già accettava ctrl+meta); **popup notifiche/download ora
scrollano** (vincolo altezza spostato sul viewport dello `ScrollArea` via `viewportClassName`);
**icone ufficiali MAL/AniList** (`brand-icons.tsx`); **popup download** ordina il file in corso in
cima; **tag "Scaricato" persistente** risolto invalidando `catalog` nelle mutation di
delete/relink/file-manager (i tag "In corso"/"In coda" erano già dinamici via polling 2s).
**212 test verdi.** Lint/typecheck/test/build verdi. **Prossime fasi (dal piano):** Fase 2
robustezza download + migrazione `0011` (Sakamoto Days), Fase 3 hardening, Fase 4 potenziamento
Libreria/Gestore file, Fase 5 rifiniture diffuse.

## Stato precedente (2026-06-21)

**Batch "altri accorgimenti" (branch `feat/accorgimenti-ux-file-manager-part`, v0.5.2):** fix
**overflow popup** (DialogContent responsive `w-[calc(100%-2rem)]` + `max-h-[85dvh]` scroll); **nav
mobile ibrida** (dock voci principali + drawer "Altro", hamburger navbar rimosso); **iOS PWA**
`viewportFit:'cover'` (la safe-area ora funziona, dock non collide con la barra di sistema) + padding
container responsive contro l'overflow ("mix" desktop/mobile); **sidebar desktop** con stato in
`sidebar-store` + `AppMain` (toggle non più coperto/sovrapposto); **link MAL/AniList** nella scheda
anime (dati già presenti); **404 anime spiegato** (`EmptyState` + CTA); **About** con sezioni
"Perché" e "Privacy e cookie"; **gestore file**: niente falsi orfani per gli extra (`Specials`/
`backdrops`/`theme-music` → badge "Extra", colonna shared `FileEntry.extra`), cartella → "Collega a
AnimeUnion"/"Ri-scarica", strumenti "Rinomina secondo lo schema" e "Elimina cartelle vuote";
**stagioni divise in parti** (`series_override.part_number`, migrazione `0010`, offset episodi
continuo nel renamer, campo "Parte" nel dialog Classifica) — risolve War of Underworld 1/2; **loghi**
leggermente più grandi. **212 test verdi.** Lint/typecheck/test/build verdi. **Rimandato:** GitHub
Pages (landing + mascotte).

**Batch UX/UI + gestore file (branch `feat/rifiniture-ux-gestore-file`):** brand cleanup (via
"Radarr/Sonarr", nuovo claim "La tua libreria anime, sempre aggiornata"); **download simultaneo
bloccato a 1** (worker hardcoded, UI "Premium" — config `maxConcurrent` resta per compat); **fix
chrome mobile** (token spacing safe-area/dock in tailwind, save bar solo se dirty e sopra il dock,
footer raggiungibile); **Impostazioni a sezioni navigabili** (rail desktop + pill mobile, niente
lista piatta); **classificazione al download** (`series_override.kind` tv/movie/special +
migrazione `0009`, `series-resolver.resolveWith`, `renamer.previewPath`, `series.previewPath`;
dialog "Classifica e scarica" con tipo+stagione+serie madre+**anteprima path live**; risolve i casi
SAO sequel/film); **gestore file incorporato** (`file-manager-service` + router `files`,
list/rename/move/delete/mkdir/**relink orfano**, guardie root-confined, sync `episode_file`; UI
`/library/files` con drag&drop + banner di avviso); **PWA/HTTPS** guida semplificata (Tailscale) +
card in-app "Perché serve HTTPS"; **header coerenti** (`PageHeader`/`EmptyState`) su pagine
principali; pass a11y (aria-label icon-only, focus ring). Migrazione `0009` (`series_override.kind`).
**207 test verdi.** Tutti i comandi lint/typecheck/build verdi. Rilasciato come `v0.5.0`.

**Batch rifiniture v0.3.0 (branch `feat/rifiniture-post-v0.2.0` → `main`):** footer completo +
affordance link + fix UX (ricerca→⌘K, popup coda); **Telegram dall'app** (token in config, invia
test); **centro notifiche potenziato** (click→destinazione, filtri, raggruppo giorno, tipi
sync/disco); **scoperta saga multi-stagione** (`series.franchise` BFS fetch-and-cache, opzione "Trova
tutte le stagioni"); **temi anime** (accent palette + sfondo wallpaper via wallhaven); **animazioni**
(framer-motion, interruttore); **pagina Statistiche** + **scorciatoie tastiera**; **hardening** (token
Telegram mascherato in `config.getAll`, header sicurezza web, backup/restore config); **notifica nuova
stagione** (`season_available`, `season-watcher`); **blocco web UI con passcode** (scrypt + token
HMAC, guard tRPC, `WEB_LOCK_DISABLED`); **PWA + Web Push** (manifest+SW, VAPID, richiede HTTPS).
Migrazioni `0007` (`follow.known_relation_ids`) e `0008` (`push_subscription`). **197 test verdi.**
Step F (wizard migliorato) rimandato.

**Fatto:**
- Monorepo, CI (lint+typecheck+test), DB SQLite (10 tabelle), MockSource/ApiSource, rate-limiter.
- Auth: email/password + **social login device flow** (Google/Discord) — `auth-service`, router `auth`.
- Router lettura: catalog, episode, calendar, follow, config, stats + **home, library, profile**.
- Integrazione **endpoint v1.0.3/1.1.x** (preferiti R/W, watchlist, cronologia, profilo,
  ultimi-episodi, in-evidenza, news) con scheduler di polling preferiti e auto-accodamento.
  **Tutti LIVE al 2026-06-16 sera** (verificati con token reale: 12/13 rispondono, vedi sotto).
- Frontend scoperta: home (con sezioni nuove), catalogo, dettaglio, follows, calendar, about,
  badge profilo navbar, SocialLogin nella SetupScreen.
- **Configurazione conservativa e brand (STEP 2.5)**: `autoDownload` default `false`, `maxConcurrent`
  default 1 / max 3, formato file forzato a `SXXEXX`, nuovi settings `languageFallback`,
  `queueRetentionDays`, notifiche (toast in-app + card per provider futuri: Telegram/Discord/Web Push),
  logo/favicon/icon ufficiali da animeunion.tv, rimozione di ogni riferimento personale.
- **Frontend polish (STEP 2.6)**: layout sidebar collassabile + bottom bar mobile, navbar ridotta
  con widget download (`DownloadStatus`) e badge coda, pagina `/downloads` rifatta a dashboard
  con card poster, progress bar e azioni rapide; pagina follow con i 5 status e hint locali;
  setup screen espone il toggle auto-download.
- **Renamer full + serie/stagione + fix sequel (STEP 3)**: campi `seriesId`/`seasonNumber`
  propagati da shared/API/DB, tabella `anime_relation` per salvare PREQUEL/SEQUEL/SPIN_OFF,
  `SeriesResolverService` con fallback da dati API, relazioni o slug isolato, `RenamerService`
  che produce path `sub-ita|dub-ita/<seriesSlug>/Season NN/SXXEXX.mp4` e corregge sia
  numerazione assoluta che ripartita dei sequel.
- **Frontend polish post-STEP 3**: azioni globali in `/downloads`
  (pausa/ripresa, annulla tutti, riprova falliti, pulisci completati) collegate al backend;
  guard navigazione in Settings con dialog "salva, abbandona o rimani";
  home page restyle premium con hero, header a icone e CTA.
- **Catalogo completo e hero dinamica**: procedura `catalog.browse` con filtri combinati
  (query, genere, tipo, stato, anno, stagione, lingua, ordinamento) + endpoint `catalog.genres`;
  UI catalogo riscritta con tutti i filtri e pannello filtri mobile tramite Sheet.
- **Fix avvio TRPC**: passato da `httpBatchLink` a `httpLink` + `QueryClient` con `staleTime`,
  risolve l'errore `Unable to transform response from server` al primo caricamento.
- **Hero restyle**: cover a schermo intero (senza blur) con overlay gradiente scuro, badge
  "In evidenza", generi e score; confermato aggiornamento dai dati `/in-evidenza` del backend.
- **Card anime e skeleton migliorati**: overlay hover con "Vedi dettagli", badge score in alto a
  destra, generi nel footer; skeleton con titolo e metadati.
- **Library scanner + pagina `/library` (STEP 4)**: `library-service` scansiona `animePath`
  calcolando i path attesi tramite `RenamerService`, aggiorna `episode_file` per i file trovati,
  rileva orfani e missing; router `library.scan/list/stats`; pagina `/library` con statistiche,
  serie scaricate espandibili, bottone scan e toast. Watchlist/cronologia spostate sotto `meRouter`.
- **Controllo bug progetto + fix download engine (STEP 5)**: passata di review sui moduli core.
  Trovato e corretto un bug critico nel `download-worker`: `tryStartNext` prenotava il job
  (`status -> 'downloading'`) prima di chiamare `runOne`, ma `runOne` usciva subito se lo stato
  non era `'queued'` -> **il download non partiva mai nel path normale**. Fix: `runOne` ora si fida
  della prenotazione atomica; aggiunto clamp difensivo al calcolo `progress` (no `NaN`/overflow) e
  un test di regressione end-to-end (enqueue -> download reale -> `completed`/`downloaded`).
- **Post-STEP 5 — UX & robustezza (giu 2026, tutto su `main`):**
  - Home "Ultimi episodi": dialog al click (scarica quell'episodio via `download.addEpisodeRef`
    oppure vai alla serie). Fix dettaglio senza episodi su serie ONGOING (`episodeCount: null`
    rompeva il parse) + parsing episodi resiliente (`safeParse` per elemento).
  - Relazioni e Consigliati come card con copertina e **persistenti** dal percorso cache DB
    (`assembleDetailFromDb` rilegge `anime_relation`; nuova colonna `anime.recommendations`).
  - Indicatore lingua bandiera+icona (SVG inline) al posto del testo SUB/DUB.
  - Pulsante **Segui stateful** (mostra lo stato, lo cambia, smette di seguire); stato download
    per episodio nel dettaglio; badge "Seguito" sulle card.
  - **Gestione file** in `/library`: elimina episodio/stagione/serie e orfani (pulsanti rossi +
    conferma), con pulizia delle cartelle vuote.
  - **Quick wins (A)**: validazione download (rifiuta HTML "link scaduto" / sniff primi byte),
    avviso `animePath` non scrivibile o di default (`SetupBanner`), cleanup `.part` all'avvio.
  - **Hardening (D)**: redaction segreti nei log, security headers + CORS allowlist
    (`CORS_ORIGINS`), gestione 429 (Retry-After/backoff), watchdog stallo download (60s),
    guardia spazio disco (500 MiB), script `npm run dev:clean` (libera 3001/3000).
- **Download multi-directory (v0.1.1)**: le cartelle di download si configurano nelle
  **Impostazioni** (non nel `.env`) — Serie/Film × SUB/DUB, con browser cartelle e fallback a
  cascata; routing per (tipo×lingua); layout Jellyfin `<Titolo>/Season NN/<Titolo> - SxxExx.mp4`
  (titolo leggibile), film in cartella dedicata, suffisso lingua solo se SUB e DUB condividono la
  root. Compose: media montato su `/media`; `.env` solo segreti. `config.browseDir`/`downloadDirs`.
- **Wizard + download a contenitori + stagioni (v0.1.2)**: dopo il deploy v0.1.1 sul NAS sono
  emersi 3 problemi, risolti insieme. (A) **Rilevamento stagioni/sequel**: l'API spesso non dà
  `seriesId`/relazioni, quindi `series-resolver` deduce stagione+franchise dallo **slug**
  (`-2nd-season`/`-season-N`/`-ii`/trailing `-2..9`) con guardia "base esiste a catalogo"; aggiunto
  **override manuale** (tabella `series_override`, router `series`, pannello "Organizzazione file"
  nel dettaglio). (B) **Wizard di primo setup**: `seriesPathSub` default ora `''` (vuoto = non
  configurato) → l'`AuthGate` mostra `SetupWizard` finché non scegli le cartelle; download
  **bloccati** con messaggio chiaro se non configurato (niente più file in `/data/anime`).
  (C) **Pagina Download stile qBittorrent**: una card per anime con avanzamento/velocità/ETA, righe
  per-episodio espandibili, clic → scheda anime, filtro stati; nuove colonne
  `bytes_downloaded`/`total_bytes`/`speed_bps` su `download_queue`. Migrazione `0004` auto all'avvio.
- **Lotto migliorie (v0.2.0)**: (1) **coda robusta** — retention automatica (`queueRetentionDays`
  applicata da un tick scheduler), **retry intelligente** (4xx/link scaduto/contenuto non video
  falliscono subito; solo 5xx/stallo/rete riprovano — `PermanentDownloadError`), "Scarica prima"
  (`download.setPriority`). (2) **Resume download** via HTTP Range (`resumeFrom`, append su 206; i
  `.part` dei job riavviabili sopravvivono allo sweep). (3) **Centro notifiche** in-app (tabella
  `notification`, router, campanella) + canale **Telegram** (`lib/telegram`, env
  `TELEGRAM_BOT_TOKEN/CHAT_ID`, toggle `notifyTelegram`); hook sugli eventi del worker.
  (4) **Follow con opzioni** — colonna `follow.auto_download` (per-serie, null=default dallo stato),
  dialog Segui con "scarica subito i già usciti" (via conferma stagione) e toggle auto;
  `enqueueForAutoFollows` rispetta flag+stato+master; notifica `new_episode` all'auto-enqueue.
  (5) **Diagnostica** — router `health.status` (worker, spazio disco per cartella via `freeDiskBytes`,
  sync, auth) + pagina `/diagnostica`. (6) **Command palette ⌘K** (ricerca + azioni rapide) e
  **conferma stagione** obbligatoria al primo download (override + cartella `Specials`).
  Migrazioni `0004`/`0005`/`0006` auto all'avvio. Più rifiniture: DUB nascosto se assente, menu
  profilo (link a `animeunion.tv/profilo` + logout), segnalazione errori opt-in (GitHub issue
  precompilato, no telemetria), e finestra "scarica anche le relazioni" (`download.addAllBySlug`).
- **170 test verdi** (19 file).

**Endpoint v1.0.3/1.1.0/1.1.1 verificati live (12/13, base path
`https://api.animeunion.tv/api/v1/integration`):**
- `POST /auth/login` → 200 + JWT
- `POST /auth/social/{start,poll}` → 200, 4 stati (pending/slow_down/denied/expired/approved)
- `GET /me/favorites?updatedSince=...` → 200 (polling con `?updatedSince=ISO8601` supportato)
- `POST /me/favorites` (body `{animeId}`) → 200/201 (idempotente, 404 se anime inesistente)
- `DELETE /me/favorites/{id}` → 204 (idempotente)
- `GET /me/watchlist?updatedSince=...` → 200
- `GET /me/cronologia?updatedSince=...` → 200 (max 1000 più recenti)
- `GET /me` → 200 (profilo: id, username, email, avatarUrl, role, createdAt)
- `GET /ultimi-episodi?limit=...` → 200
- `GET /in-evidenza` → 200
- `GET /news?limit=...` → 200
- **Non deployato (404)**: `POST /me/favorites/sync` — non serve: GET + delta via `?updatedSince=`
  coprono già "import iniziale + sync incrementale".

**Manca:** Docker multi-arch + PWA + Web Push (STEP 6, i `Dockerfile` di api/web non esistono
ancora) e test E2E/release v0.1.0 (STEP 7). `ffmpeg-static`/`node-cron` ancora inutilizzati
(rinviati: il team di AnimeUnion conferma MP4 diretto, niente HLS; scheduler custom).
**Rimandato di proposito (D):** password/app-token per la web UI — è l'unico cambiamento che
potrebbe bloccare l'accesso, da fare con una scelta UX esplicita.

## Roadmap a step (verso v0.1.0)

- [x] **STEP 0** — Questo `CLAUDE.md` come file unico; assorbito `CLAUDE_PROMPT.md`; `ROADMAP.md` → puntatore.
- [x] **STEP 1** — Pagina **Impostazioni** cablata a `trpc.config` (Download, Pianificazione,
      Catalogo+sync ora, Lingua, Tema). `animePath` default `/data/anime` (rinominato
      da `downloadPath`).
- [x] **STEP 2** — **Download engine completo**: utility FS (`download-fs`), HTTP downloader
      MP4 (`http-downloader` con undici), worker event-driven con FSM (queued→downloading→
      processing→completed + failed/cancelled + retry + backoff), service tRPC-friendly,
      router `download` (7 procedure), scheduler per follow `watching` (auto-enqueue 30min),
      pagina `/downloads` con polling 1.5s e bottone Scarica per episodio nel dettaglio.
      `seasonNumber` hardcoded a 1 (la logica sequel/season e' rimandata a STEP 3).
      Test: 105 verdi (12 file, +38 nuovi per il motore).
- [x] **STEP 2.5** — **Configurazione conservativa e brand cleanup**: schema `AppConfig`
      (`autoDownload=false`, `maxConcurrent` 1..3 default 1, `languageFallback`,
      `queueRetentionDays`), notifiche (toast + card provider futuri), formato rinome
      forzato `SXXEXX`, rimozione riferimenti personali da docs/code, asset brand ufficiali.
- [x] **STEP 2.6** — **Frontend polish**: sidebar + bottom bar mobile, navbar con widget
      `DownloadStatus`, `/downloads` dashboard a card poster, status follow locali con hint,
      setup screen con toggle auto-download.
- [x] **STEP 3** — **Renamer + serie/stagione + fix sequel** (PLAN §S6): path
      `sub-ita|dub-ita/<seriesSlug>/Season NN/SXXEXX.mp4`, `seriesId`/`seasonNumber` reale,
      fallback da relazioni, correzione rinumerazione sequel.
- [x] **Frontend polish post-STEP 3** — Azioni globali in `/downloads`, guard navigazione
      Settings con save-and-continue, home premium con hero/icone/CTA.
- [x] **STEP 4** — **Library scanner** + pagina `/library` (PLAN §S6).
- [x] **STEP 5** — Verifica **live** API (12/13 endpoint + social) con credenziali reali ✅
      + **controllo bug del progetto** (fix critico download engine, vedi Stato) + **merge** del
      lavoro (`feat/settings-e-motore`) → `main`.
- [x] **Post-STEP 5** — Polish dettaglio/home/libreria (dialog episodi, relazioni+consigliati
      persistenti, lingua bandiera+icona, Segui stateful, stato download, gestione file) +
      **quick wins (A)** + **hardening backend (D)**. Vedi Stato. Tutto mergiato in `main`.
      Rimandato: password web UI (opzionale).
- [x] **STEP 6** — Docker: `Dockerfile` api (via `tsx`) e web (Next standalone), `docker-compose`
      (build) + `docker-compose.ghcr.yaml` (immagini) + workflow `docker-publish` (context root) +
      `.dockerignore` + credenziali AnimeUnion **opzionali** (login dalla web UI). **Build validata
      sul NAS** (fix: `.dockerignore` escludeva `src/components/anime`; API non pubblicata sull'host).
      **Restano (rinviati)**: PWA (manifest + service worker) e Web Push.
- [x] **STEP 7** — **README user-friendly + logo**, `CHANGELOG` 0.5.0, `DEPLOYMENT` completo, e
      **release `v0.5.0`** taggata (workflow GHCR multi-arch attivato, `DOCKER_PUBLISH_ENABLED=true`).
      Login premium (logo + icone Google/Discord). **Rimandati**: test E2E (Playwright).
      **Nota**: login social Google/Discord bloccato da `redirect_uri_mismatch` lato OAuth AnimeUnion
      (config di Matteo, non del container); usare email/password.

## Gotchas operativi

- **Workspace shared è una COPIA**, non un symlink: dopo modifiche a `packages/shared` esegui
  `npm install` prima di `npm run typecheck`/dev, altrimenti l'API non vede i nuovi export.
- **API live (al 2026-06-16 sera)**: i 12 endpoint v1.0.3/1.1.x sono tutti dispiegati e rispondono con
  token reale. Solo `POST /me/favorites/sync` non è deployato (non necessario). La shape dei
  contratti `packages/shared/src/contracts/me.ts` combacia con le risposte reali. Base path:
  `https://api.animeunion.tv/api/v1/integration`. Rate limit: 120 req/min per token.
- **Branch**: tutto il lavoro (integrazione API + STEP 2.5→5 + polish post-STEP 5 + quick wins +
  hardening) è **mergiato in `main`** (sempre fast-forward) e pushato su `origin/main`. I branch
  feature (`feat/quick-wins`, `feat/hardening`, ecc.) restano come riferimento ma sono già in `main`.
  Il prossimo step (STEP 6 — Docker/PWA) parte da `main`.
- **Credenziali**: email/password in `.env` (gitignored); token in SQLite (tabella `auth`). Mai
  segreti nel codice/compose. L'utente usa l'account `lookatale95@gmail.com`.
- **Verifica sempre**: `npm run lint` + `npm run typecheck` + `npm run test` verdi prima di committare.
- **Download engine**: il file MP4 viene scaricato in `<target>.part.<queueId>` e rinominato
  atomicamente (`fs.rename`) al path finale `SXXEXY.<lang>.mp4` SUBITO dopo il singolo download.
  Niente finestra `ep_NNN.mp4` esposta a Jellyfin/Plex. `seasonNumber=1` hardcoded (STEP 3).
- **Worker è event-driven**: `tryStartNext()` su enqueue + tick di sicurezza 60s. `maxConcurrent`
  letto da config ad ogni decisione (cambio live). `AbortController` per cancel su downloading.
- Memoria progetto (per Claude): `~/.claude/projects/f--dev-animeunion/memory/` (vedi `MEMORY.md`).

## Regole Ferree

1. Mai codice per feature future: solo lo step corrente.
2. tRPC è la legge: zero `fetch`/`axios` dal frontend.
3. Il frontend non chiama mai direttamente AnimeUnion: sempre via backend (proxy + cache + rate-limit).
4. Docker-ready: il container deve poter buildare.
5. Test sui servizi core (catalog, download, renamer DEVONO avere test).
6. Spiega passo passo le scelte architetturali (l'utente è in learning mode).
7. Nessun segreto nel codice: token/password/URL solo in env o `.env` (gitignored).
8. Credenziali AnimeUnion in `.env`, token in SQLite. Mai token in chiaro nel compose.
9. Un commit = un task. Messaggio in italiano, descrittivo.
10. Niente commenti superflui (solo se la logica non è ovvia). Niente emoji nel codice.
11. TypeScript strict: niente `any`, usa `unknown` + narrowing.
12. Error handling: mai `catch {}` vuoto, almeno `logger.error/​debug`.
13. **Niente "Scarica intera serie" cross-stagione**: un episodio alla volta; ammesso accodare gli
    episodi mancanti della stessa entry/stagione (`download.addMissing/addAll`).
14. **Ogni step di un batch va prima approfondito, poi implementato a checkbox**: (1) approfondire lo
    step nel file di piano con contesto tecnico verificato (file + righe, contratti, impatto sui
    test) e sotto-task a checkbox `- [ ]`; (2) implementare spuntando le checkbox; (3) chiudere con
    `lint`/`typecheck`/`test`/`build` verdi e un commit dedicato (Regola #9).
15. **Piano durevole in `plan/`, plan mode per ogni step**: il piano vivo del batch sta in `plan/`
    (gitignored, fonte canonica); `~/.claude/plans/` è solo temporaneo. CLAUDE.md "Roadmap verso vX"
    rimanda sempre al piano in `plan/`. **Prima di implementare uno step si entra in plan mode**
    (approfondimento Regola #14), poi si implementa. A fine step aggiorna AVANZAMENTO nel piano +
    "Roadmap verso vX" + "Stato attuale" in CLAUDE.md.

## Convenzioni

File kebab-case; funzioni camelCase; componenti React PascalCase; colonne DB snake_case.
Import order: `node:*` → esterni → `@animeunion/*` → `./` → `../`. Commit in italiano.

## Crediti

Powered by AnimeUnion (https://animeunion.tv) — Applicazione ufficiale affiliata.
Sviluppata da iCosiSenpai — https://github.com/iCosiSenpai/animeunion
