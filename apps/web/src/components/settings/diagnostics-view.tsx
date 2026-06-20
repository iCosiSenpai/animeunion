'use client';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { trpc } from '@/lib/trpc';
import { formatBytes, formatDate } from '@/lib/utils';
import {
  AlertTriangle,
  CheckCircle2,
  FolderOpen,
  HardDrive,
  Loader2,
  RefreshCw,
  XCircle,
} from 'lucide-react';
import type { ReactNode } from 'react';

function StatRow({
  label,
  ok,
  children,
}: {
  label: string;
  ok?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b py-2 last:border-b-0">
      <span className="flex items-center gap-2 text-sm text-muted-foreground">
        {ok === undefined ? null : ok ? (
          <CheckCircle2 className="h-4 w-4 text-green-500" />
        ) : (
          <XCircle className="h-4 w-4 text-destructive" />
        )}
        {label}
      </span>
      <span className="text-right text-sm font-medium tabular-nums">{children}</span>
    </div>
  );
}

export function DiagnosticsView() {
  const health = trpc.health.status.useQuery(undefined, { refetchInterval: 15000 });
  const data = health.data;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">Diagnostica</h1>
          <p className="text-sm text-muted-foreground">
            Stato del sistema: download, cartelle, spazio disco, catalogo e connessione.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => health.refetch()}
          disabled={health.isFetching}
          className="gap-1"
        >
          <RefreshCw className={`h-4 w-4 ${health.isFetching ? 'animate-spin' : ''}`} />
          Aggiorna
        </Button>
      </div>

      {!data ? (
        <div className="flex items-center justify-center p-12 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : (
        <>
          <Card className="space-y-3 p-5">
            <h2 className="text-lg font-semibold">Sistema</h2>
            <StatRow label="Versione">{data.version}</StatRow>
            <StatRow label="Connessione ad AnimeUnion" ok={data.authenticated}>
              {data.authenticated ? 'Connesso' : 'Non autenticato'}
            </StatRow>
            <StatRow label="Catalogo">
              {data.catalog.totalAnime} anime
              {data.catalog.running ? ' · sync in corso…' : ''}
            </StatRow>
            <StatRow label="Ultima sincronizzazione">
              {data.catalog.lastSyncedAt ? formatDate(data.catalog.lastSyncedAt) : 'mai'}
            </StatRow>
          </Card>

          <Card className="space-y-3 p-5">
            <h2 className="text-lg font-semibold">Coda download</h2>
            <StatRow label="Stato worker" ok={!data.worker.paused}>
              {data.worker.paused ? 'In pausa' : 'Attivo'}
            </StatRow>
            <StatRow label="In download">{data.worker.active}</StatRow>
            <StatRow label="In coda">{data.worker.queued}</StatRow>
            <StatRow label="Falliti" ok={data.worker.failed === 0}>
              {data.worker.failed}
            </StatRow>
          </Card>

          <Card className="space-y-3 p-5">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <HardDrive className="h-5 w-5" />
              Cartelle di download
            </h2>
            <ul className="space-y-3">
              {data.dirs.map((d) => {
                const healthy = d.writable;
                return (
                  <li key={d.key} className="rounded-md border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2 text-sm font-medium">
                        {healthy ? (
                          <CheckCircle2 className="h-4 w-4 text-green-500" />
                        ) : (
                          <AlertTriangle className="h-4 w-4 text-amber-500" />
                        )}
                        {d.label}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {d.freeBytes != null ? `${formatBytes(d.freeBytes)} liberi` : '—'}
                      </span>
                    </div>
                    <p className="mt-1 flex items-center gap-1 break-all font-mono text-xs text-muted-foreground">
                      <FolderOpen className="h-3 w-3 shrink-0" />
                      {d.path || '(non impostata)'}
                    </p>
                    {!d.writable ? (
                      <p className="mt-1 text-xs text-destructive">
                        Non scrivibile: controlla il volume nel compose e i permessi.
                      </p>
                    ) : !d.configured ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Eredita dalla cartella "Serie · SUB ITA".
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </Card>
        </>
      )}
    </div>
  );
}
