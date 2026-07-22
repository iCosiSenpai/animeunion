import { logger } from '@animeunion/worker';
import { autoUpdater } from 'electron-updater';

/**
 * Auto-update via electron-updater; il feed è GitHub Releases (configurato in electron-builder.yml).
 * Va invocato solo nell'app pacchettizzata. Scarica in background e installa alla chiusura/riavvio.
 * Gli errori (offline, nessuna release) sono degradati a warning: non devono bloccare il worker.
 */
export function initAutoUpdater(): void {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('error', (err) => logger.warn({ err }, 'Auto-update: errore (ignorato)'));
  autoUpdater.on('update-available', (info) =>
    logger.info({ version: info.version }, 'Auto-update: aggiornamento disponibile'),
  );
  autoUpdater.on('update-downloaded', (info) =>
    logger.info(
      { version: info.version },
      'Auto-update: scaricato, verrà installato al prossimo riavvio',
    ),
  );
  void autoUpdater.checkForUpdates().catch((err) => {
    logger.warn({ err }, 'Auto-update: verifica fallita');
  });
}
