'use client';

import { Button } from '@/components/ui/button';
import { usePwaInstall } from '@/lib/pwa-install-store';

export function InstallButton() {
  const deferred = usePwaInstall((s) => s.deferred);
  const setDeferred = usePwaInstall((s) => s.setDeferred);

  if (!deferred) {
    return (
      <p className="text-xs text-muted-foreground">
        Già installata o non disponibile su questo browser/contesto.
      </p>
    );
  }

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
