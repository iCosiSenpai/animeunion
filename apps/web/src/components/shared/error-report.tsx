'use client';

import { Button } from '@/components/ui/button';
import { buildIssueUrl, clientContext } from '@/lib/github';
import { AlertTriangle, Copy, Github, RefreshCw } from 'lucide-react';
import { useState } from 'react';

function buildDetails(error: { message?: string; digest?: string }): string {
  const { path, userAgent } = clientContext();
  return [
    `Errore: ${error.message ?? 'sconosciuto'}`,
    `Digest: ${error.digest ?? '-'}`,
    `Pagina: ${path}`,
    `Browser: ${userAgent}`,
  ].join('\n');
}

/**
 * Schermata d'errore con segnalazione OPT-IN: niente invio automatico (quindi niente
 * cookie/consenso). L'utente può copiare i dettagli o aprire un issue GitHub precompilato.
 */
export function ErrorReport({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const details = buildDetails(error);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(details);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Contesto non sicuro (http LAN): l'utente copia dal box qui sotto.
    }
  };

  const issueUrl = buildIssueUrl({
    title: `Errore UI: ${(error.message ?? '').slice(0, 80)}`,
    body: `**Cosa stavi facendo:**\n\n\n---\n\`\`\`\n${details}\n\`\`\``,
  });

  return (
    <div className="mx-auto flex max-w-lg flex-col items-center gap-4 py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertTriangle className="h-7 w-7" />
      </div>
      <div className="space-y-1">
        <h2 className="text-xl font-semibold">Qualcosa è andato storto</h2>
        <p className="text-sm text-muted-foreground">
          Puoi riprovare. Se il problema persiste, copia i dettagli o segnalalo: la condivisione è
          volontaria, niente viene inviato automaticamente.
        </p>
      </div>

      <textarea
        readOnly
        value={details}
        className="h-28 w-full resize-none rounded-md border bg-muted/40 p-2 font-mono text-xs"
        onFocus={(e) => e.currentTarget.select()}
      />

      <div className="flex flex-wrap items-center justify-center gap-2">
        {reset ? (
          <Button onClick={reset} className="gap-1">
            <RefreshCw className="h-4 w-4" />
            Riprova
          </Button>
        ) : null}
        <Button variant="outline" onClick={copy} className="gap-1">
          <Copy className="h-4 w-4" />
          {copied ? 'Copiato!' : 'Copia dettagli'}
        </Button>
        <Button variant="outline" asChild className="gap-1">
          <a href={issueUrl} target="_blank" rel="noopener noreferrer">
            <Github className="h-4 w-4" />
            Segnala su GitHub
          </a>
        </Button>
      </div>
    </div>
  );
}
