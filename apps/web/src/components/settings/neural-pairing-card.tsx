'use client';

import { Button } from '@/components/ui/button';
import { trpc } from '@/lib/trpc';
import { CheckCircle2, Link2, Loader2, RefreshCw, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

// Abbinamento del worker via codice: sostituisce l'inserimento manuale di URL + token. Il NAS
// genera un codice a tempo; l'utente lo inserisce nell'app desktop, che chiama `pair` sul NAS. Qui
// mostriamo il codice e attendiamo che lo stato del worker diventi configurato + raggiungibile.
export function NeuralPairingCard({ onPaired }: { onPaired?: () => void }) {
  const [pairing, setPairing] = useState<{ code: string; expiresAt: string } | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const status = trpc.neuralExport.status.useQuery(undefined, {
    retry: false,
    refetchInterval: (query) => {
      const s = query.state.data;
      const done = !!(s?.worker.configured && s?.worker.reachable);
      return pairing && !done ? 2500 : false;
    },
  });

  const create = trpc.neuralExport.createPairingCode.useMutation({
    onSuccess: (data) => {
      setPairing(data);
      setNowMs(Date.now());
    },
    onError: () => toast.error('Impossibile generare il codice di abbinamento'),
  });

  const worker = status.data?.worker;
  const configured = !!worker?.configured;
  const reachable = !!worker?.reachable;
  const configuredReachable = configured && reachable;

  // Tick al secondo mentre un codice è attivo (countdown/scadenza).
  useEffect(() => {
    if (!pairing) {
      return;
    }
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [pairing]);

  // Successo: il worker è diventato raggiungibile mentre un codice era attivo → l'app ha abbinato.
  useEffect(() => {
    if (pairing && configuredReachable) {
      setPairing(null);
      toast.success('Worker abbinato');
      onPaired?.();
    }
  }, [pairing, configuredReachable, onPaired]);

  const expiresMs = pairing ? new Date(pairing.expiresAt).getTime() : 0;
  const expired = pairing ? expiresMs <= nowMs : false;
  const secondsLeft = pairing ? Math.max(0, Math.round((expiresMs - nowMs) / 1000)) : 0;

  const generate = () => create.mutate();

  // Codice attivo (non scaduto): mostra codice + istruzioni + attesa.
  if (pairing && !expired) {
    return (
      <div className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-4">
        <p className="text-sm font-medium">Inserisci questo codice nell'app AnimeUnion Worker</p>
        <div className="flex items-center gap-3">
          <span className="font-mono text-3xl font-bold tracking-[0.3em] text-primary">
            {pairing.code}
          </span>
          <span className="text-xs text-muted-foreground">scade tra {secondsLeft}s</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          In attesa dell'app sul PC con GPU…
        </div>
        <Button variant="ghost" size="sm" onClick={() => setPairing(null)}>
          Annulla
        </Button>
      </div>
    );
  }

  // Codice scaduto senza abbinamento.
  if (pairing && expired) {
    return (
      <div className="space-y-3 rounded-lg border p-4">
        <p className="text-sm">Codice scaduto senza abbinamento.</p>
        <Button size="sm" className="gap-1.5" disabled={create.isPending} onClick={generate}>
          <RefreshCw className={create.isPending ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
          Genera nuovo codice
        </Button>
      </div>
    );
  }

  // Nessun codice attivo: stato dell'abbinamento corrente + azione.
  return (
    <div className="space-y-3 rounded-lg border p-4">
      {configuredReachable ? (
        <div className="flex items-start gap-2.5">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" aria-hidden="true" />
          <div>
            <p className="text-sm font-medium">Worker abbinato e raggiungibile</p>
            <p className="text-xs text-muted-foreground">
              Il PC con GPU risponde sulla LAN. Puoi migliorare gli episodi a XQ/XQ+.
            </p>
          </div>
        </div>
      ) : configured ? (
        <div className="flex items-start gap-2.5">
          <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" aria-hidden="true" />
          <div>
            <p className="text-sm font-medium">Worker abbinato ma non raggiungibile</p>
            <p className="text-xs text-muted-foreground">
              Accendi il PC e avvia l'app AnimeUnion Worker, oppure ri-abbina se è cambiato
              indirizzo.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-2.5">
          <Link2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div>
            <p className="text-sm font-medium">Nessun worker abbinato</p>
            <p className="text-xs text-muted-foreground">
              Genera un codice e inseriscilo nell'app AnimeUnion Worker sul PC con GPU.
            </p>
          </div>
        </div>
      )}
      <Button size="sm" className="gap-1.5" disabled={create.isPending} onClick={generate}>
        {create.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Link2 className="h-4 w-4" />
        )}
        {configured ? 'Ri-abbina worker' : 'Abbina worker'}
      </Button>
    </div>
  );
}
