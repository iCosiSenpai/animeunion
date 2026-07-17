'use client';

import { Button } from '@/components/ui/button';
import { usePwaInstall } from '@/lib/pwa-install-store';
import { CheckCircle2, ExternalLink } from 'lucide-react';
import { useEffect, useState } from 'react';

// True se l'app gira gia' come PWA installata (display standalone, o navigator.standalone su iOS).
function isRunningStandalone(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  const standaloneMatch = window.matchMedia?.('(display-mode: standalone)').matches ?? false;
  // iOS Safari non implementa display-mode: usa navigator.standalone (non standard nei tipi DOM).
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return standaloneMatch || iosStandalone;
}

export function InstallButton() {
  const deferred = usePwaInstall((s) => s.deferred);
  const setDeferred = usePwaInstall((s) => s.setDeferred);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    setInstalled(isRunningStandalone());
    const onInstalled = () => setInstalled(true);
    window.addEventListener('appinstalled', onInstalled);
    return () => window.removeEventListener('appinstalled', onInstalled);
  }, []);

  // Stato 1 — gia' installata: nessuna azione, solo conferma.
  if (installed) {
    return (
      <p className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
        <CheckCircle2 className="h-4 w-4 text-primary" aria-hidden="true" />
        AnimeUnion è installata come app.
      </p>
    );
  }

  // Stato 2 — installabile: il browser ha offerto il prompt.
  if (deferred) {
    return (
      <Button
        variant="outline"
        onClick={async () => {
          await deferred.prompt();
          setDeferred(null);
        }}
      >
        Installa app
      </Button>
    );
  }

  // Stato 3 — non disponibile: manca il prompt (di solito perche' non si e' su HTTPS, oppure il
  // browser non supporta l'installazione). Spieghiamo il perche' e rimandiamo alla guida.
  return (
    <div className="space-y-2 rounded-md border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground">
      <p>
        L'installazione come app non è disponibile su questo browser/indirizzo. Come le notifiche
        push, richiede un indirizzo sicuro <strong>HTTPS</strong> (o <code>localhost</code>).
      </p>
      <a
        href="https://icosisenpai.github.io/animeunion/faq.html#https"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
      >
        <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
        Apri la guida
      </a>
    </div>
  );
}
