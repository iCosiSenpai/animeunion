'use client';

import { trpc } from '@/lib/trpc';

/**
 * Query condivisa del riassunto download con polling adattivo: 5s a riposo, 1.5s quando
 * qualcosa è in download/elaborazione. Centralizza la logica duplicata tra la pagina Download
 * e il widget in navbar.
 */
export function useDownloadSummary() {
  const query = trpc.download.summary.useQuery(undefined, {
    refetchInterval: (q) => {
      const data = q.state.data;
      if (!data) return 5000;
      const active = data.counts.downloading + data.counts.processing > 0;
      return active ? 1500 : 5000;
    },
  });

  const counts = query.data?.counts;
  const activeCount = counts ? counts.queued + counts.downloading + counts.processing : 0;
  const hasFailed = (counts?.failed ?? 0) > 0;

  return { query, counts, activeCount, hasFailed };
}
