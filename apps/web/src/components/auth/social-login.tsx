'use client';

import { Button } from '@/components/ui/button';
import { trpc } from '@/lib/trpc';
import type { SocialProvider, SocialStartOutput } from '@animeunion/shared';
import { ExternalLink, Loader2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

const PROVIDER_LABELS: Record<SocialProvider, string> = {
  google: 'Google',
  discord: 'Discord',
};

export function SocialLogin() {
  const utils = trpc.useUtils();
  const start = trpc.auth.socialStart.useMutation();
  const poll = trpc.auth.socialPoll.useMutation();

  const [flow, setFlow] = useState<SocialStartOutput | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intervalRef = useRef(5);

  const stop = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  // Pulisce il timer allo smontaggio.
  useEffect(() => () => stop(), [stop]);

  const schedule = useCallback(() => {
    timer.current = setTimeout(async () => {
      try {
        const res = await poll.mutateAsync();
        if (res.status === 'approved') {
          stop();
          setFlow(null);
          toast.success('Accesso effettuato!');
          await utils.auth.status.invalidate();
          return;
        }
        if (res.status === 'denied') {
          stop();
          setFlow(null);
          toast.error('Accesso negato. Riprova.');
          return;
        }
        if (res.status === 'expired') {
          stop();
          setFlow(null);
          toast.error('Codice scaduto. Riprova.');
          return;
        }
        if (res.status === 'slow_down') {
          intervalRef.current += 5;
        }
        schedule();
      } catch {
        stop();
        setFlow(null);
        toast.error('Errore durante la verifica. Riprova.');
      }
    }, intervalRef.current * 1000);
  }, [poll, stop, utils]);

  const begin = async (provider: SocialProvider) => {
    try {
      const res = await start.mutateAsync({ provider });
      setFlow(res);
      intervalRef.current = res.interval > 0 ? res.interval : 5;
      window.open(res.verificationUriComplete, '_blank', 'noopener,noreferrer');
      schedule();
    } catch {
      toast.error('Impossibile avviare il login social. Verifica che il backend sia avviato.');
    }
  };

  const cancel = () => {
    stop();
    setFlow(null);
  };

  if (flow) {
    return (
      <div className="space-y-3 rounded-md border p-4 text-center">
        <p className="text-sm text-muted-foreground">
          Apri la pagina di accesso e conferma questo codice:
        </p>
        <p className="font-mono text-2xl font-bold tracking-widest">{flow.userCode}</p>
        <a
          href={flow.verificationUriComplete}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm font-medium underline underline-offset-4"
        >
          Apri la pagina di accesso
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
        <div className="flex items-center justify-center gap-2 pt-1 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          In attesa dell'autorizzazione…
        </div>
        <Button variant="ghost" size="sm" onClick={cancel}>
          Annulla
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-border" />
        <span className="text-xs text-muted-foreground">oppure</span>
        <div className="h-px flex-1 bg-border" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        {(['google', 'discord'] as const).map((provider) => (
          <Button
            key={provider}
            type="button"
            variant="outline"
            disabled={start.isPending}
            onClick={() => begin(provider)}
          >
            {PROVIDER_LABELS[provider]}
          </Button>
        ))}
      </div>
      <p className="text-center text-xs text-muted-foreground">
        Registrato con Google/Discord? Accedi senza password.
      </p>
    </div>
  );
}
