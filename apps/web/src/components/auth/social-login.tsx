'use client';

import { Button } from '@/components/ui/button';
import { trpc } from '@/lib/trpc';
import type { SocialProvider, SocialStartOutput } from '@animeunion/shared';
import { ExternalLink, Loader2 } from 'lucide-react';
import { type ComponentType, useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

const PROVIDER_LABELS: Record<SocialProvider, string> = {
  google: 'Google',
  discord: 'Discord',
};

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.56c2.08-1.92 3.28-4.74 3.28-8.09Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.56-2.76c-.98.66-2.23 1.06-3.72 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.18a11 11 0 0 0 0 9.9l3.66-2.84Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.05l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38Z"
      />
    </svg>
  );
}

function DiscordIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="#5865F2" aria-hidden="true">
      <path d="M20.317 4.369A19.79 19.79 0 0 0 16.558 3c-.2.36-.43.85-.6 1.23a18.27 18.27 0 0 0-5.92 0A12.6 12.6 0 0 0 9.43 3a19.74 19.74 0 0 0-3.76 1.37C2.28 8.06 1.6 11.64 1.94 15.17a19.9 19.9 0 0 0 6.07 3.08c.49-.67.93-1.38 1.3-2.12-.71-.27-1.39-.6-2.03-.99.17-.13.34-.26.5-.4a14.2 14.2 0 0 0 12.06 0c.16.14.33.27.5.4-.65.39-1.33.72-2.04.99.37.74.81 1.45 1.3 2.12a19.87 19.87 0 0 0 6.07-3.08c.4-4.1-.68-7.65-2.88-10.8ZM8.52 13.34c-1.18 0-2.15-1.08-2.15-2.41 0-1.33.95-2.42 2.15-2.42 1.21 0 2.18 1.09 2.16 2.42 0 1.33-.95 2.41-2.16 2.41Zm6.96 0c-1.18 0-2.15-1.08-2.15-2.41 0-1.33.95-2.42 2.15-2.42 1.21 0 2.18 1.09 2.16 2.42 0 1.33-.95 2.41-2.16 2.41Z" />
    </svg>
  );
}

const PROVIDER_ICONS: Record<SocialProvider, ComponentType> = {
  google: GoogleIcon,
  discord: DiscordIcon,
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
        {(['google', 'discord'] as const).map((provider) => {
          const Icon = PROVIDER_ICONS[provider];
          return (
            <Button
              key={provider}
              type="button"
              variant="outline"
              className="h-10 gap-2"
              disabled={start.isPending}
              onClick={() => begin(provider)}
            >
              <Icon />
              {PROVIDER_LABELS[provider]}
            </Button>
          );
        })}
      </div>
      <p className="text-center text-xs text-muted-foreground">
        Registrato con Google/Discord? Accedi senza password.
      </p>
    </div>
  );
}
