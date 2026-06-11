'use client';

import { trpc } from '@/lib/trpc';
import { useEffect, useRef } from 'react';
import { toast } from 'sonner';

export function InitialSync() {
  const utils = trpc.useUtils();
  const sync = trpc.catalog.sync.useMutation();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) {
      return;
    }
    started.current = true;
    void (async () => {
      const status = await utils.catalog.syncStatus.fetch();
      if (!status.lastSyncedAt && !status.running) {
        sync.mutate();
        toast.message('Sincronizzazione del catalogo avviata in background.');
      }
    })();
  }, [utils, sync]);

  return null;
}
