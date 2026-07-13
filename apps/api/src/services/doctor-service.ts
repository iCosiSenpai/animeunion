import type { DoctorCheck, DoctorCheckCategory, DoctorState } from '@animeunion/shared';
import { freeDiskBytes as freeDiskBytesDefault } from '../lib/download-fs';
import type { Logger } from '../lib/logger';
import type { AuthService } from './auth-service';
import type { ConfigService } from './config-service';
import type { JellyfinService } from './jellyfin-service';
import type { NotificationService } from './notification-service';

// Soglia di avviso spazio disco (1 GiB): allineata a quella storica dello scheduler (DISK_LOW_BYTES),
// più alta dell'hard-stop del worker (500 MiB) per avvisare prima.
const DISK_LOW_BYTES = 1024 * 1024 * 1024;

/**
 * Doctor: monitoraggio attivo e continuo dello stato operativo. A differenza di `health` (che
 * ricalcola tutto al volo e non ricorda nulla), il Doctor MANTIENE lo stato tra un tick e l'altro,
 * così sa distinguere una condizione appena diventata critica (→ notifica di allerta) da una appena
 * tornata a posto (→ notifica di ripristino, e l'alert sparisce da solo).
 *
 * Generalizza il vecchio pattern `lowRoots` dello scheduler (che notificava solo alla transizione
 * ok→low per il disco) estendendolo a: scrivibilità cartelle, spazio disco, connessione API, Jellyfin.
 * Tutto in memoria (Regola #1: nessuna tabella nuova); il segnale "cartella di nuovo scrivibile"
 * prodotto qui è il gancio per lo Step 2 (ripresa automatica download).
 */
export interface DoctorService {
  /** Esegue i controlli, aggiorna lo stato interno, notifica le transizioni e ritorna lo snapshot. */
  runChecks(): Promise<DoctorState>;
  /** Snapshot corrente senza rieseguire i controlli (cheap). */
  getState(): DoctorState;
}

export interface DoctorServiceDeps {
  config: Pick<ConfigService, 'downloadDirsStatus' | 'distinctDownloadRoots' | 'get'>;
  auth: Pick<AuthService, 'status'>;
  jellyfin: Pick<JellyfinService, 'testConnection'>;
  notifications: Pick<NotificationService, 'create'>;
  logger?: Logger;
  now?: () => Date;
  /** Iniettabile nei test per evitare l'I/O reale sul disco. */
  freeDiskBytes?: (path: string) => Promise<number | null>;
  /**
   * Invocato al massimo una volta per ciclo di controlli quando almeno un check ambientale
   * (cartella scrivibile o spazio disco) transita da critico a ok. Gancio per la ripresa automatica
   * dei download falliti per cartella read-only (Step 2 v0.16.0).
   */
  onWritableRestored?: () => void;
}

/** Testo di notifica per la transizione di un check (allerta o ripristino). */
function messageFor(
  category: DoctorCheckCategory,
  status: 'alert' | 'resolved',
  check: DoctorCheck,
): { title: string; body: string | null } {
  const detail = check.detail;
  switch (category) {
    case 'writable':
      return status === 'alert'
        ? { title: 'Cartella di download non scrivibile', body: detail }
        : { title: 'Cartella di download di nuovo scrivibile', body: detail };
    case 'disk':
      return status === 'alert'
        ? { title: 'Spazio su disco in esaurimento', body: detail }
        : { title: 'Spazio su disco di nuovo sufficiente', body: detail };
    case 'api':
      return status === 'alert'
        ? { title: 'Connessione ad AnimeUnion assente', body: detail }
        : { title: 'Connessione ad AnimeUnion ripristinata', body: null };
    case 'jellyfin':
      return status === 'alert'
        ? { title: 'Jellyfin non raggiungibile', body: detail }
        : { title: 'Jellyfin di nuovo raggiungibile', body: null };
  }
}

export function createDoctorService(deps: DoctorServiceDeps): DoctorService {
  const { config, auth, jellyfin, notifications, logger } = deps;
  const now = deps.now ?? (() => new Date());
  const freeDisk = deps.freeDiskBytes ?? freeDiskBytesDefault;

  // Stato monitorato per id di check. Vuoto all'avvio: il primo passaggio con una condizione già
  // critica conta come transizione ok→critical (come il vecchio lowRoots, che partiva vuoto).
  const state = new Map<string, DoctorCheck>();
  let lastRunAt: string | null = null;

  function notify(category: DoctorCheckCategory, kind: 'alert' | 'resolved', check: DoctorCheck) {
    const { title, body } = messageFor(category, kind, check);
    notifications.create({
      type: kind === 'alert' ? 'doctor_alert' : 'doctor_resolved',
      title,
      body,
    });
  }

  /** Confronta i check nuovi con lo stato precedente e notifica solo le transizioni. */
  function reconcile(next: Map<string, DoctorCheck>) {
    // Traccia se una condizione ambientale (cartella/disco) e' tornata a posto in questo ciclo:
    // e' il segnale per ri-accodare i download falliti per cartella read-only (Step 2).
    let envRestored = false;
    const isEnv = (c: DoctorCheckCategory) => c === 'writable' || c === 'disk';
    for (const [id, check] of next) {
      const prev = state.get(id);
      if (check.status === 'critical' && (!prev || prev.status === 'ok')) {
        notify(check.category, 'alert', check);
      } else if (check.status === 'ok' && prev && prev.status === 'critical') {
        notify(check.category, 'resolved', check);
        if (isEnv(check.category)) {
          envRestored = true;
        }
      }
    }
    // Un check sparito mentre era critico (es. cartella riconfigurata) va considerato risolto,
    // altrimenti l'alert resterebbe "appeso" nello storico logico.
    for (const [id, prev] of state) {
      if (!next.has(id) && prev.status === 'critical') {
        notify(prev.category, 'resolved', prev);
      }
    }
    state.clear();
    for (const [id, check] of next) {
      state.set(id, check);
    }
    if (envRestored && deps.onWritableRestored) {
      // Robusto: un errore del consumer (ripresa download) non deve far cadere il tick del Doctor.
      try {
        deps.onWritableRestored();
      } catch (error) {
        logger?.debug({ err: error }, 'Doctor onWritableRestored fallito');
      }
    }
  }

  function snapshot(): DoctorState {
    const checks = [...state.values()];
    const criticalCount = checks.filter((c) => c.status === 'critical').length;
    return { healthy: criticalCount === 0, criticalCount, lastRunAt, checks };
  }

  return {
    async runChecks(): Promise<DoctorState> {
      const ts = now().toISOString();
      const next = new Map<string, DoctorCheck>();

      try {
        // 1. Scrivibilità delle cartelle di download (dedup per percorso: più chiavi possono
        //    risolvere lo stesso path via fallback).
        const dirs = await config.downloadDirsStatus();
        const seenPaths = new Set<string>();
        for (const d of dirs) {
          if (!d.path || seenPaths.has(d.path)) {
            continue;
          }
          seenPaths.add(d.path);
          const id = `writable:${d.path}`;
          next.set(id, {
            id,
            category: 'writable',
            label: `Cartella ${d.label}`,
            status: d.writable ? 'ok' : 'critical',
            detail: d.path,
            lastCheckedAt: ts,
          });
        }

        // 2. Spazio disco per ogni radice distinta.
        for (const root of config.distinctDownloadRoots()) {
          const free = await freeDisk(root);
          if (free == null) {
            continue;
          }
          const id = `disk:${root}`;
          next.set(id, {
            id,
            category: 'disk',
            label: `Spazio disco (${root})`,
            status: free < DISK_LOW_BYTES ? 'critical' : 'ok',
            detail: `${Math.round(free / 1024 / 1024)} MiB liberi`,
            lastCheckedAt: ts,
          });
        }

        // 3. Connessione ad AnimeUnion.
        const authed = auth.status().authenticated;
        next.set('api', {
          id: 'api',
          category: 'api',
          label: 'Connessione ad AnimeUnion',
          status: authed ? 'ok' : 'critical',
          detail: authed ? 'Connesso' : 'Non autenticato',
          lastCheckedAt: ts,
        });

        // 4. Jellyfin: monitorato solo se configurato (URL + API key).
        const jfUrl = config.get('jellyfinServerUrl').trim();
        const jfKey = config.get('jellyfinApiKey').trim();
        if (jfUrl && jfKey) {
          const res = await jellyfin.testConnection();
          next.set('jellyfin', {
            id: 'jellyfin',
            category: 'jellyfin',
            label: 'Jellyfin',
            status: res.ok ? 'ok' : 'critical',
            detail: res.ok
              ? (res.serverName ?? 'Raggiungibile')
              : (res.error ?? 'Non raggiungibile'),
            lastCheckedAt: ts,
          });
        }

        lastRunAt = ts;
        reconcile(next);
      } catch (error) {
        // Un errore imprevisto nei controlli non deve far cadere lo scheduler o la query.
        logger?.debug({ err: error }, 'Doctor runChecks fallito');
      }

      return snapshot();
    },

    getState(): DoctorState {
      return snapshot();
    },
  };
}
