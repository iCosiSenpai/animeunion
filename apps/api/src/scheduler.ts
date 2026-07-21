import { createSeasonWatcher } from './services/season-watcher';
import type { Context } from './trpc';

export interface Scheduler {
  start(): Promise<void>;
  stop(): void;
}

/** Garantisce che nessuna porta venga aperta prima della readiness dello scheduler/worker. */
export async function startSchedulerThenListen(
  scheduler: Scheduler,
  listen: () => Promise<unknown>,
): Promise<void> {
  await scheduler.start();
  await listen();
}

const DOWNLOAD_AUTODOWNLOAD_MINUTES = 30;
const QUEUE_PURGE_HOURS = 6;
const TRASH_PRUNE_HOURS = 12;
const SEASON_CHECK_HOURS = 12;
const SEASON_CHECK_STARTUP_MS = 2 * 60 * 1000; // prima passata ~2 min dopo l'avvio
const LIBRARY_CHECK_MINUTES = 15; // controllo attivo integrità libreria (episodi spariti dal disco)
const LIBRARY_CHECK_STARTUP_MS = 3 * 60 * 1000;
// Doctor: monitoraggio attivo (writability cartelle, disco, API, Jellyfin) con notifiche di
// allerta/ripristino. Tick frequente (5 min) così un ripristino, es. cartella tornata scrivibile,
// si nota in fretta (il vecchio check disco a 6h era assorbito qui).
const DOCTOR_CHECK_MINUTES = 5;
const DOCTOR_CHECK_STARTUP_MS = 20 * 1000;

/**
 * Scheduler di polling dei preferiti del sito (v1.0.3) + auto-download per i follow
 * `watching`. All'avvio fa un import completo, poi sincronizza in modo incrementale
 * via `?updatedSince=` ad intervalli regolari (config `favoritesSyncMinutes`). Tollerante
 * agli endpoint non ancora deployati (le chiamate falliscono in modo silenzioso lato
 * service). Il worker di download e' event-driven: qui lo accendiamo e aggiungiamo
 * un tick periodico che accoda nuovi episodi per i follow `watching`.
 */
export function createScheduler(ctx: Context): Scheduler {
  const { services, logger } = ctx;
  const timers: NodeJS.Timeout[] = [];

  function intervalMs(): number {
    return services.config.get('favoritesSyncMinutes') * 60 * 1000;
  }

  return {
    async start(): Promise<void> {
      // La readiness del reconcile/sweep iniziale è bloccante: il bootstrap non espone l'API finché
      // il worker non ha risolto gli stati lasciati da un eventuale arresto precedente.
      await services.download.start();

      // Import iniziale (fire-and-forget: non blocca l'avvio del server).
      void services.favorites.importFromSite().catch((error) => {
        logger.debug({ err: error }, 'Import preferiti iniziale fallito');
      });
      const favTimer = setInterval(() => {
        void services.favorites.pollUpdates().catch((error) => {
          logger.debug({ err: error }, 'Tick polling preferiti fallito');
        });
      }, intervalMs());
      favTimer.unref?.();
      timers.push(favTimer);

      // Auto-enqueue per i follow watching/auto-download (status-aware: rinfresca gli ONGOING,
      // salta i COMPLETED — vedi download-service.enqueueForAutoFollows). Ora è async.
      const autoEnqueue = async () => {
        try {
          const enqueued = await services.download.enqueueForAutoFollows();
          if (enqueued > 0) {
            logger.info({ enqueued }, 'Auto-enqueue follow: nuovi episodi accodati');
          }
        } catch (error) {
          logger.debug({ err: error }, 'Tick auto-enqueue watching fallito');
        }
      };
      const dlTimer = setInterval(
        () => void autoEnqueue(),
        DOWNLOAD_AUTODOWNLOAD_MINUTES * 60 * 1000,
      );
      dlTimer.unref?.();
      timers.push(dlTimer);

      // Pulizia coda: rimuove i job terminali più vecchi di queueRetentionDays.
      const purge = () => {
        try {
          services.download.purgeOldTerminal();
        } catch (error) {
          logger.debug({ err: error }, 'Tick pulizia coda fallito');
        }
      };
      purge();
      const purgeTimer = setInterval(purge, QUEUE_PURGE_HOURS * 60 * 60 * 1000);
      purgeTimer.unref?.();
      timers.push(purgeTimer);

      // Pulizia cestino: elimina definitivamente le voci oltre trashRetentionDays.
      const pruneTrash = () => {
        if (!services.config.get('trashEnabled')) {
          return;
        }
        void services.files
          .pruneTrash(services.config.get('trashRetentionDays'))
          .then((removed) => {
            if (removed > 0) {
              logger.info({ removed }, 'Cestino: voci scadute eliminate');
            }
          })
          .catch((error) => {
            logger.debug({ err: error }, 'Tick pulizia cestino fallito');
          });
      };
      pruneTrash();
      const trashTimer = setInterval(pruneTrash, TRASH_PRUNE_HOURS * 60 * 60 * 1000);
      trashTimer.unref?.();
      timers.push(trashTimer);

      // Backup automatico del DB (opt-in): crea una copia consistente e pota oltre la retention.
      // Tick orario; esegue il backup solo se è passato l'intervallo dall'ultimo (best-effort:
      // la cadenza è guidata dal numero di backup recenti, vedi db-backup-service).
      let lastBackupMs = 0;
      const backupTick = () => {
        if (!services.config.get('dbBackupEnabled')) {
          return;
        }
        const intervalMs = services.config.get('dbBackupIntervalHours') * 60 * 60 * 1000;
        if (Date.now() - lastBackupMs < intervalMs) {
          return;
        }
        lastBackupMs = Date.now();
        void services.backup
          .runBackup()
          .then(() => services.backup.pruneBackups(services.config.get('dbBackupRetention')))
          .then((removed) => {
            if (removed > 0) {
              logger.debug({ removed }, 'Backup DB: copie vecchie eliminate');
            }
            // Push su Google Drive (best-effort): solo se abilitato e collegato. Un errore del
            // cloud non deve compromettere il backup locale gia' andato a buon fine.
            const gstatus = services.cloudBackup.getStatus();
            if (gstatus.enabled && gstatus.connected) {
              return services.cloudBackup.uploadLatestBackup().then(() => undefined);
            }
            return undefined;
          })
          .catch((error) => {
            logger.warn({ err: error }, 'Backup DB automatico fallito');
          });
      };
      backupTick();
      const backupTimer = setInterval(backupTick, 60 * 60 * 1000);
      backupTimer.unref?.();
      timers.push(backupTimer);

      // Doctor: monitoraggio attivo continuo. Assorbe il vecchio check disco (che era solo ok->low
      // per lo spazio) generalizzandolo a scrivibilità cartelle + disco + API + Jellyfin, con
      // notifica sia di allerta che di ripristino. Run allo startup (breve delay) + tick 5 min.
      const doctorTick = () => {
        void services.doctor.runChecks().catch((error) => {
          logger.debug({ err: error }, 'Tick Doctor fallito');
        });
      };
      const doctorStartup = setTimeout(doctorTick, DOCTOR_CHECK_STARTUP_MS);
      doctorStartup.unref?.();
      timers.push(doctorStartup);
      const doctorTimer = setInterval(doctorTick, DOCTOR_CHECK_MINUTES * 60 * 1000);
      doctorTimer.unref?.();
      timers.push(doctorTimer);

      // Nuove stagioni delle serie seguite (batch a rotazione, refresh forzato del dettaglio).
      const seasonWatcher = createSeasonWatcher({
        db: ctx.db,
        catalog: services.catalog,
        notifications: services.notifications,
        config: services.config,
        logger,
      });
      const seasonCheck = () => {
        void seasonWatcher.checkNewSeasons().catch((error) => {
          logger.debug({ err: error }, 'Tick season-watcher fallito');
        });
      };
      const seasonStartup = setTimeout(seasonCheck, SEASON_CHECK_STARTUP_MS);
      seasonStartup.unref?.();
      timers.push(seasonStartup);
      const seasonTimer = setInterval(seasonCheck, SEASON_CHECK_HOURS * 60 * 60 * 1000);
      seasonTimer.unref?.();
      timers.push(seasonTimer);

      // Controllo attivo integrità libreria: se un episodio scaricato sparisce dal disco (cancellato
      // fuori app), lo rileva, azzera lo stato e avvisa l'utente (notifica in-app + push).
      const libraryCheck = async () => {
        try {
          const vanished = await services.library.checkVanished();
          if (vanished.length === 0) {
            return;
          }
          // Raggruppa per anime per non floodare le notifiche.
          const byAnime = new Map<string, { title: string; nums: number[] }>();
          for (const v of vanished) {
            const entry = byAnime.get(v.animeId) ?? { title: v.animeTitle ?? 'Serie', nums: [] };
            entry.nums.push(v.episodeNumber);
            byAnime.set(v.animeId, entry);
          }
          for (const [animeId, { title, nums }] of byAnime) {
            const uniq = [...new Set(nums)].sort((a, b) => a - b);
            services.notifications.create({
              type: 'info',
              title: `Episodi mancanti: ${title}`,
              body:
                uniq.length === 1
                  ? `L'episodio ${uniq[0]} non e' piu' presente su disco.`
                  : `${uniq.length} episodi non piu' presenti su disco (${uniq.slice(0, 8).join(', ')}${uniq.length > 8 ? '…' : ''}).`,
              animeId,
            });
          }
          logger.warn({ count: vanished.length }, 'Controllo libreria: episodi spariti dal disco');
        } catch (error) {
          logger.debug({ err: error }, 'Tick controllo libreria fallito');
        }
      };
      const libStartup = setTimeout(() => void libraryCheck(), LIBRARY_CHECK_STARTUP_MS);
      libStartup.unref?.();
      timers.push(libStartup);
      const libTimer = setInterval(() => void libraryCheck(), LIBRARY_CHECK_MINUTES * 60 * 1000);
      libTimer.unref?.();
      timers.push(libTimer);

      logger.info(
        {
          favoritesEveryMinutes: services.config.get('favoritesSyncMinutes'),
          downloadEveryMinutes: DOWNLOAD_AUTODOWNLOAD_MINUTES,
        },
        'Scheduler avviato',
      );
    },

    stop(): void {
      for (const t of timers) {
        clearInterval(t);
      }
      timers.length = 0;
      services.download.stop();
    },
  };
}
