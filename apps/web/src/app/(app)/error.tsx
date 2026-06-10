'use client';

import { Button } from '@/components/ui/button';

export default function AppError({
  reset,
}: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
      <h2 className="text-xl font-semibold">Qualcosa e andato storto</h2>
      <p className="text-muted-foreground">Si e verificato un errore nel caricamento.</p>
      <Button onClick={reset}>Riprova</Button>
    </div>
  );
}
