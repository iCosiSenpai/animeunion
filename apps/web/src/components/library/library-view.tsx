'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { trpc } from '@/lib/trpc';
import { formatBytes } from '@/lib/utils';
import type { LibraryGroup, LibraryScanResult } from '@animeunion/shared';
import {
  ArrowDownUp,
  Film,
  FolderOpen,
  FolderTree,
  HardDrive,
  Play,
  RefreshCw,
  Search,
  Trash2,
  Tv,
} from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { LibrarySeriesCard } from './library-series-card';
import { LibrarySkeleton } from './library-skeleton';
import { MissingDialog } from './missing-dialog';

type SortKey = 'title' | 'recent' | 'size' | 'episodes';

const SORT_LABELS: Record<SortKey, string> = {
  title: 'Alfabetico',
  recent: 'Ultimo aggiunto',
  size: 'Dimensione',
  episodes: 'N. episodi',
};

function lastAddedOf(group: LibraryGroup): number {
  let max = 0;
  for (const entry of group.entries) {
    for (const ep of entry.episodes) {
      const t = ep.downloadedAt ? Date.parse(ep.downloadedAt) : 0;
      if (Number.isFinite(t) && t > max) max = t;
    }
  }
  return max;
}

function ScanSummary({
  result,
  onShowMissing,
}: {
  result: LibraryScanResult;
  onShowMissing: () => void;
}) {
  if (result.found === 0 && result.orphans === 0 && result.missing === 0) {
    return (
      <p className="text-sm text-muted-foreground">Nessuna novità: libreria già sincronizzata.</p>
    );
  }

  return (
    <div className="flex flex-wrap gap-2 text-sm">
      <Badge variant="secondary" className="gap-1">
        <FolderOpen className="h-3 w-3" />
        Trovati: {result.found}
      </Badge>
      {result.updated > 0 ? (
        <Badge variant="secondary" className="gap-1">
          <RefreshCw className="h-3 w-3" />
          Aggiornati: {result.updated}
        </Badge>
      ) : null}
      {result.missing > 0 ? (
        <button type="button" onClick={onShowMissing} title="Gestisci gli episodi mancanti">
          <Badge
            variant="destructive"
            className="cursor-pointer gap-1 transition-opacity hover:opacity-80"
          >
            Mancanti: {result.missing} →
          </Badge>
        </button>
      ) : null}
      {result.orphans > 0 ? (
        <Badge variant="outline" className="gap-1">
          Orfani: {result.orphans}
        </Badge>
      ) : null}
    </div>
  );
}

function StatsCards({
  stats,
  isLoading,
}: {
  stats: { totalEpisodes: number; totalSizeBytes: number; totalSeries: number } | undefined;
  isLoading: boolean;
}) {
  const items = [
    { icon: Play, label: 'Episodi scaricati', value: stats?.totalEpisodes ?? 0 },
    { icon: HardDrive, label: 'Spazio occupato', value: formatBytes(stats?.totalSizeBytes ?? 0) },
    { icon: Tv, label: 'Serie', value: stats?.totalSeries ?? 0 },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {items.map((item) => (
        <Card key={item.label}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {item.label}
            </CardTitle>
            <item.icon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-7 w-16" />
            ) : (
              <div className="text-2xl font-bold">{item.value}</div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function LibraryView() {
  const utils = trpc.useUtils();
  const statsQuery = trpc.library.stats.useQuery();
  const listQuery = trpc.library.list.useQuery();
  const scanMutation = trpc.library.scan.useMutation({
    onSuccess: () => {
      void utils.library.stats.invalidate();
      void utils.library.list.invalidate();
    },
  });

  const [lastScan, setLastScan] = useState<LibraryScanResult | null>(null);
  const [confirmOrphans, setConfirmOrphans] = useState(false);
  const [missingOpen, setMissingOpen] = useState(false);

  const deleteOrphans = trpc.library.deleteOrphans.useMutation({
    onSuccess: (res) => {
      toast.success(
        `Eliminati ${res.deletedFiles} orfani · ${formatBytes(res.freedBytes)} liberati`,
      );
      void utils.library.stats.invalidate();
      void utils.library.list.invalidate();
      setLastScan((prev) => (prev ? { ...prev, orphans: 0, orphanPaths: [] } : prev));
      setConfirmOrphans(false);
    },
    onError: () => toast.error('Eliminazione orfani fallita'),
  });

  async function onScan() {
    try {
      const result = await scanMutation.mutateAsync();
      setLastScan(result);
      toast.success('Libreria scansionata');
    } catch {
      toast.error('Scansione libreria fallita');
    }
  }

  const items = listQuery.data ?? [];

  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('title');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const displayed = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? items.filter((g) => (g.anime.titleIta ?? g.anime.title).toLowerCase().includes(q))
      : items;
    const sorted = [...filtered].sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'title') {
        cmp = (a.anime.titleIta ?? a.anime.title).localeCompare(
          b.anime.titleIta ?? b.anime.title,
          'it',
        );
      } else if (sortKey === 'recent') {
        cmp = lastAddedOf(a) - lastAddedOf(b);
      } else if (sortKey === 'size') {
        cmp = a.totalSizeBytes - b.totalSizeBytes;
      } else {
        cmp = a.totalEpisodes - b.totalEpisodes;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return sorted;
  }, [items, search, sortKey, sortDir]);

  const tvGroups = displayed.filter((g) => g.category === 'tv');
  const filmGroups = displayed.filter((g) => g.category === 'film');

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="La tua collezione"
        title="Libreria"
        description={
          <>
            Esplora e sincronizza gli episodi scaricati in{' '}
            {statsQuery.data?.totalSizeBytes ? formatBytes(statsQuery.data.totalSizeBytes) : '—'}.
          </>
        }
        actions={
          <>
            <Button asChild variant="outline" className="gap-2">
              <Link href="/library/files">
                <FolderTree className="h-4 w-4" />
                Gestore file
              </Link>
            </Button>
            <Button onClick={onScan} disabled={scanMutation.isPending} className="gap-2">
              <RefreshCw className={`h-4 w-4 ${scanMutation.isPending ? 'animate-spin' : ''}`} />
              {scanMutation.isPending ? 'Scansione...' : 'Scansiona libreria'}
            </Button>
          </>
        }
      />

      <StatsCards stats={statsQuery.data} isLoading={statsQuery.isLoading} />

      {scanMutation.isPending || lastScan ? (
        <Card className="p-4">
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">Ultima scansione</h3>
            {scanMutation.isPending ? (
              <Skeleton className="h-5 w-48" />
            ) : lastScan ? (
              <ScanSummary result={lastScan} onShowMissing={() => setMissingOpen(true)} />
            ) : null}
            {lastScan && lastScan.orphanPaths.length > 0 ? (
              <Button
                variant="destructive"
                size="sm"
                className="mt-2 gap-1"
                disabled={deleteOrphans.isPending}
                onClick={() => setConfirmOrphans(true)}
              >
                <Trash2 className="h-4 w-4" />
                Elimina {lastScan.orphanPaths.length} orfan
                {lastScan.orphanPaths.length === 1 ? 'o' : 'i'}
              </Button>
            ) : null}
          </div>
        </Card>
      ) : null}

      <Dialog open={confirmOrphans} onOpenChange={setConfirmOrphans}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive">Eliminare i file orfani?</DialogTitle>
            <DialogDescription>
              Verranno cancellati {lastScan?.orphanPaths.length ?? 0} file presenti su disco ma non
              collegati ad alcun episodio del catalogo. L&apos;operazione &egrave;{' '}
              <strong>irreversibile</strong>.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmOrphans(false)}
              disabled={deleteOrphans.isPending}
            >
              Annulla
            </Button>
            <Button
              variant="destructive"
              className="gap-2"
              disabled={deleteOrphans.isPending}
              onClick={() => deleteOrphans.mutate({ paths: lastScan?.orphanPaths ?? [] })}
            >
              <Trash2 className="h-4 w-4" />
              Elimina definitivamente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <MissingDialog
        open={missingOpen}
        entries={lastScan?.missingEntries ?? []}
        onOpenChange={setMissingOpen}
        onChanged={() => {
          void utils.download.queue.invalidate();
          void utils.library.list.invalidate();
        }}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold tracking-tight">Serie scaricate</h2>
        {items.length > 0 ? (
          <div className="flex items-center gap-2">
            <div className="relative w-full sm:w-56">
              <Search className="-translate-y-1/2 absolute top-1/2 left-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cerca nella libreria…"
                className="pl-8"
              />
            </div>
            <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
              <SelectTrigger className="w-[150px] shrink-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
                  <SelectItem key={k} value={k}>
                    {SORT_LABELS[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="icon"
              className="shrink-0"
              aria-label={sortDir === 'asc' ? 'Ordine crescente' : 'Ordine decrescente'}
              title={sortDir === 'asc' ? 'Crescente' : 'Decrescente'}
              onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
            >
              <ArrowDownUp className="h-4 w-4" />
            </Button>
          </div>
        ) : null}
      </div>

      {listQuery.isLoading ? (
        <LibrarySkeleton />
      ) : items.length === 0 ? (
        <EmptyState
          icon={FolderOpen}
          title="Libreria vuota"
          description="Nessun episodio scaricato. Vai al catalogo e segui un anime per iniziare."
          action={
            <Button asChild>
              <Link href="/catalog">Esplora il catalogo</Link>
            </Button>
          }
        />
      ) : displayed.length === 0 ? (
        <EmptyState
          icon={Search}
          title="Nessun risultato"
          description={`Nessuna serie corrisponde a "${search}".`}
        />
      ) : (
        <div className="space-y-8">
          {tvGroups.length > 0 ? (
            <section className="space-y-4">
              <h3 className="flex items-center gap-2 font-semibold text-muted-foreground text-sm">
                <Tv className="h-4 w-4" />
                Serie TV ({tvGroups.length})
              </h3>
              <div className="grid gap-4">
                {tvGroups.map((group) => (
                  <LibrarySeriesCard key={`tv-${group.seriesId}`} group={group} />
                ))}
              </div>
            </section>
          ) : null}
          {filmGroups.length > 0 ? (
            <section className="space-y-4">
              <h3 className="flex items-center gap-2 font-semibold text-muted-foreground text-sm">
                <Film className="h-4 w-4" />
                Film ({filmGroups.length})
              </h3>
              <div className="grid gap-4">
                {filmGroups.map((group) => (
                  <LibrarySeriesCard key={`film-${group.seriesId}`} group={group} />
                ))}
              </div>
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}
