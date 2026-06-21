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
import { Skeleton } from '@/components/ui/skeleton';
import { trpc } from '@/lib/trpc';
import { formatBytes } from '@/lib/utils';
import type { LibraryScanResult } from '@animeunion/shared';
import { FolderOpen, FolderTree, HardDrive, Play, RefreshCw, Trash2, Tv } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { LibrarySeriesCard } from './library-series-card';
import { LibrarySkeleton } from './library-skeleton';

function ScanSummary({ result }: { result: LibraryScanResult }) {
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
        <Badge variant="destructive" className="gap-1">
          Mancanti: {result.missing}
        </Badge>
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">Libreria</h1>
          <p className="text-sm text-muted-foreground">
            Esplora e sincronizza gli episodi scaricati in{' '}
            {statsQuery.data?.totalSizeBytes ? formatBytes(statsQuery.data.totalSizeBytes) : '—'}.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
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
        </div>
      </div>

      <StatsCards stats={statsQuery.data} isLoading={statsQuery.isLoading} />

      {scanMutation.isPending || lastScan ? (
        <Card className="p-4">
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">Ultima scansione</h3>
            {scanMutation.isPending ? (
              <Skeleton className="h-5 w-48" />
            ) : lastScan ? (
              <ScanSummary result={lastScan} />
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

      <div className="space-y-1">
        <h2 className="text-lg font-semibold tracking-tight">Serie scaricate</h2>
      </div>

      {listQuery.isLoading ? (
        <LibrarySkeleton />
      ) : items.length === 0 ? (
        <div className="py-16 text-center">
          <FolderOpen className="mx-auto h-12 w-12 text-muted-foreground" />
          <h3 className="mt-4 text-lg font-semibold">Libreria vuota</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Nessun episodio scaricato. Vai al catalogo e segui un anime per iniziare.
          </p>
          <Button asChild className="mt-6">
            <Link href="/catalog">Esplora il catalogo</Link>
          </Button>
        </div>
      ) : (
        <div className="grid gap-4">
          {items.map((item) => (
            <LibrarySeriesCard
              key={`${item.anime.id}-${item.seasonNumber}-${item.language}`}
              item={item}
            />
          ))}
        </div>
      )}
    </div>
  );
}
