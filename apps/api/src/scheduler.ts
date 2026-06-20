import type { Context } from './trpc';

export interface Scheduler {
  start(): void;
  stop(): void;
}

const DOWNLOAD_AUTODOWNLOAD_MINUTES = 30;
const QUEUE_PURGE_HOURS = 6;

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
    start(): void {
      // Worker download event-driven (tick interno di sicurezza 60s, unref).
      services.download.start();

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

      // Auto-enqueue per i follow watching.
      const dlTimer = setInterval(
        () => {
          try {
            const enqueued = services.download.enqueueForAutoFollows();
            if (enqueued > 0) {
              logger.info({ enqueued }, 'Auto-enqueue follow: nuovi episodi accodati');
            }
          } catch (error) {
            logger.debug({ err: error }, 'Tick auto-enqueue watching fallito');
          }
        },
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
