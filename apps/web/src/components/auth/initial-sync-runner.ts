export interface CatalogSyncStatus {
  running: boolean;
  lastSyncedAt: string | null;
}

export interface InitialCatalogSyncDependencies {
  fetchStatus: () => Promise<CatalogSyncStatus>;
  startSync: () => Promise<{ started: boolean }>;
  invalidateCatalog: () => Promise<void>;
  waitForPoll?: () => Promise<void>;
}

export interface InitialCatalogSyncResult {
  started: boolean;
}

const SYNC_POLL_INTERVAL_MS = 500;

function defaultWaitForPoll(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, SYNC_POLL_INTERVAL_MS));
}

export async function runInitialCatalogSync({
  fetchStatus,
  startSync,
  invalidateCatalog,
  waitForPoll = defaultWaitForPoll,
}: InitialCatalogSyncDependencies): Promise<InitialCatalogSyncResult> {
  let status = await fetchStatus();
  const previousLastSyncedAt = status.lastSyncedAt;

  // Anche un catalogo già sincronizzato va invalidato: se un precedente observer è stato smontato
  // subito dopo la sync, la QueryClient può ancora contenere il risultato vuoto pre-import.
  if (previousLastSyncedAt && !status.running) {
    await invalidateCatalog();
    return { started: false };
  }

  let started = false;
  if (!status.running) {
    const result = await startSync();
    started = result.started;
  }

  for (;;) {
    status = await fetchStatus();
    if (!status.running) {
      break;
    }
    await waitForPoll();
  }

  // Un timestamp invariato distingue il fallimento di una sync concorrente da un completamento:
  // syncStatus conserva infatti l'ultima sync riuscita anche quando quella corrente fallisce.
  if (!status.lastSyncedAt || status.lastSyncedAt === previousLastSyncedAt) {
    throw new Error('La sincronizzazione del catalogo non ha importato alcun anime.');
  }

  await invalidateCatalog();
  return { started };
}

export function createInitialCatalogSyncCoordinator() {
  let active: Promise<InitialCatalogSyncResult> | null = null;

  return (run: () => Promise<InitialCatalogSyncResult>): Promise<InitialCatalogSyncResult> => {
    if (active) {
      return active;
    }

    const tracked = run().finally(() => {
      if (active === tracked) {
        active = null;
      }
    });
    active = tracked;
    return tracked;
  };
}
