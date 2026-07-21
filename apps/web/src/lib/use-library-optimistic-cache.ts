'use client';

import { trpc } from '@/lib/trpc';
import { useQueryClient } from '@tanstack/react-query';
import { getQueryKey } from '@trpc/react-query';
import {
  LibraryOptimisticDeleteSerializer,
  type LibraryOptimisticStore,
  type LibraryOptimisticTransaction,
  type OptimisticLibraryDelete,
  rollbackOptimisticLibraryDelete,
} from './library-optimistic';

export type { LibraryOptimisticTransaction } from './library-optimistic';

// Condiviso tra tutte le card e tutte le istanze dell'hook: una seconda delete non può catturare
// uno snapshot mentre la prima mutation è ancora in volo.
const deleteSerializer = new LibraryOptimisticDeleteSerializer();

/** Operazioni condivise per una transaction ottimistica sulle query della Libreria. */
export function useLibraryOptimisticCache() {
  const utils = trpc.useUtils();
  const queryClient = useQueryClient();
  const listQueryKey = getQueryKey(trpc.library.list, undefined, 'query');
  const statsQueryKey = getQueryKey(trpc.library.stats, undefined, 'query');
  const store: LibraryOptimisticStore = {
    cancelList: () => utils.library.list.cancel(),
    cancelStats: () => utils.library.stats.cancel(),
    getList: () => utils.library.list.getData(),
    getStats: () => utils.library.stats.getData(),
    setList: (list) => utils.library.list.setData(undefined, list),
    setStats: (stats) => utils.library.stats.setData(undefined, stats),
    removeList: () => queryClient.removeQueries({ queryKey: listQueryKey, exact: true }),
    removeStats: () => queryClient.removeQueries({ queryKey: statsQueryKey, exact: true }),
  };

  function remove(target: OptimisticLibraryDelete): Promise<LibraryOptimisticTransaction> {
    return deleteSerializer.begin(store, target);
  }

  function restore(transaction: LibraryOptimisticTransaction | undefined): void {
    rollbackOptimisticLibraryDelete(store, transaction?.snapshot);
  }

  async function invalidateRelated(): Promise<void> {
    await Promise.all([
      utils.library.list.invalidate(),
      utils.library.stats.invalidate(),
      utils.download.invalidate(),
      utils.catalog.invalidate(),
      utils.follow.list.invalidate(),
    ]);
  }

  async function settle(transaction: LibraryOptimisticTransaction | undefined): Promise<void> {
    try {
      await invalidateRelated();
    } finally {
      transaction?.release();
    }
  }

  return { remove, restore, settle, invalidateRelated };
}
