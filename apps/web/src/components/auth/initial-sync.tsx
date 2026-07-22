'use client';

import { trpc } from '@/lib/trpc';
import { useEffect } from 'react';
import { toast } from 'sonner';
import { createInitialCatalogSyncCoordinator, runInitialCatalogSync } from './initial-sync-runner';

// L'operazione appartiene al modulo, non al singolo effect: in Strict Mode e durante i remount di
// AuthGate continua a osservare la sync e a invalidare la QueryClient condivisa dai Providers.
const coordinateInitialCatalogSync = createInitialCatalogSyncCoordinator();

export function InitialSync() {
  const utils = trpc.useUtils();
  const startSync = trpc.catalog.sync.useMutation().mutateAsync;

  useEffect(() => {
    let mounted = true;
    const operation = coordinateInitialCatalogSync(() =>
      runInitialCatalogSync({
        fetchStatus: () => utils.catalog.syncStatus.fetch(undefined, { staleTime: 0 }),
        startSync,
        invalidateCatalog: () => utils.catalog.invalidate(),
      }),
    );

    void operation
      .then(({ started }) => {
        if (mounted && started) {
          toast.success('Catalogo sincronizzato.');
        }
      })
      .catch((error) => {
        if (mounted) {
          toast.error(
            error instanceof Error
              ? error.message
              : 'Impossibile completare la sincronizzazione del catalogo.',
          );
        }
      });

    return () => {
      mounted = false;
    };
  }, [startSync, utils]);

  return null;
}
