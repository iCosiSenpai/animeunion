'use client';

import { Button } from '@/components/ui/button';
import { trpc } from '@/lib/trpc';
import { CheckCircle2, Loader2, Monitor, RefreshCw, XCircle } from 'lucide-react';
import { useEffect, useRef } from 'react';

// Stato del worker collegato. Con il nuovo flusso è il worker (app sul PC) a collegarsi al NAS
// (enrollment): qui non si digita più nulla, si mostra solo lo stato e si può forzare una verifica.
export function NeuralWorkerCard({ onWorkerChanged }: { onWorkerChanged?: () => void }) {
  const utils = trpc.useUtils();
  const status = trpc.neuralExport.status.useQuery(undefined, {
    retry: false,
    refetchInterval: 15000,
  });

  const worker = status.data?.worker;
  const configured = !!worker?.configured;
  const reachable = !!worker?.reachable;

  // Quando il worker passa a "collegato" (enroll dal PC), risincronizza il draft del form
  // Impostazioni così URL/token/abilitazione riflettono quanto scritto lato server.
  const prevConfigured = useRef(configured);
  useEffect(() => {
    if (configured && !prevConfigured.current) {
      onWorkerChanged?.();
    }
    prevConfigured.current = configured;
  }, [configured, onWorkerChanged]);

  return (
    <div className="space-y-3 rounded-lg border p-4">
      {reachable ? (
        <div className="flex items-start gap-2.5">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-sm font-medium">Worker collegato e raggiungibile</p>
            <p className="text-xs text-muted-foreground">
              {worker?.name ? `«${worker.name}»` : 'Il PC con GPU'} risponde sulla LAN
              {worker?.url ? ` (${worker.url})` : ''}. Puoi migliorare gli episodi a XQ/XQ+.
            </p>
          </div>
        </div>
      ) : configured ? (
        <div className="flex items-start gap-2.5">
          <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-sm font-medium">Worker collegato ma non raggiungibile</p>
            <p className="text-xs text-muted-foreground">
              Accendi il PC e avvia l'app AnimeUnion Worker
              {worker?.name ? ` («${worker.name}»)` : ''}.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-2.5">
          <Monitor className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-sm font-medium">Nessun worker collegato</p>
            <p className="text-xs text-muted-foreground">
              Apri l'app AnimeUnion Worker sul PC con GPU e premi «Collega al NAS»: comparirà qui in
              automatico.
            </p>
          </div>
        </div>
      )}
      <Button
        size="sm"
        variant="outline"
        className="gap-1.5"
        disabled={status.isFetching}
        onClick={() => void utils.neuralExport.status.invalidate()}
      >
        {status.isFetching ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <RefreshCw className="h-4 w-4" />
        )}
        Aggiorna stato
      </Button>
    </div>
  );
}
