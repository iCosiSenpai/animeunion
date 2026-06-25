'use client';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { trpc } from '@/lib/trpc';
import { useState } from 'react';
import { toast } from 'sonner';

const CURL_EXAMPLE = `curl -X POST http://<host>:3001/api/integration/requests \\
  -H "X-Api-Key: <chiave>" \\
  -H "content-type: application/json" \\
  -d '{"slug":"one-piece"}'`;

export function RequestsSection() {
  const utils = trpc.useUtils();
  const status = trpc.requests.status.useQuery();
  const configured = status.data?.configured === true;

  const generate = trpc.requests.generateKey.useMutation();
  const revoke = trpc.requests.revoke.useMutation();
  const pending = generate.isPending || revoke.isPending;

  const [generatedKey, setGeneratedKey] = useState<string | null>(null);

  const refresh = () => void utils.requests.status.invalidate();

  async function onGenerate() {
    try {
      const res = await generate.mutateAsync();
      setGeneratedKey(res.key);
      refresh();
      toast.success('Chiave generata. Copiala ora: non sarà più mostrata.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Operazione non riuscita.');
    }
  }

  async function onRevoke() {
    try {
      await revoke.mutateAsync();
      setGeneratedKey(null);
      refresh();
      toast.success('Chiave revocata.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Operazione non riuscita.');
    }
  }

  async function onCopy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast.success('Copiato negli appunti.');
    } catch {
      toast.error('Copia non riuscita.');
    }
  }

  return (
    <Card className="space-y-4 p-5">
      <div>
        <h2 className="text-lg font-semibold">API richieste (integrazioni)</h2>
        <p className="text-xs text-muted-foreground">
          Permette a servizi esterni (bot, automazioni, un&apos;istanza Seerr) di chiedere
          all&apos;app di seguire e scaricare un anime. L&apos;accesso è protetto da una chiave
          segreta inviata nell&apos;header X-Api-Key.
        </p>
      </div>
      <Separator />
      <div className="space-y-3">
        <p className="text-sm">
          Stato:{' '}
          {configured ? (
            <span className="font-medium text-foreground">chiave configurata</span>
          ) : (
            <span className="text-muted-foreground">nessuna chiave</span>
          )}
        </p>

        {generatedKey ? (
          <div className="space-y-1.5">
            <div className="flex gap-2">
              <Input readOnly value={generatedKey} className="font-mono text-xs" />
              <Button variant="outline" onClick={() => onCopy(generatedKey)}>
                Copia
              </Button>
            </div>
            <p className="text-xs text-destructive">
              Copiala adesso: per sicurezza non verrà più mostrata.
            </p>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button onClick={onGenerate} disabled={pending}>
            {configured ? 'Rigenera chiave' : 'Genera chiave'}
          </Button>
          {configured ? (
            <Button variant="outline" onClick={onRevoke} disabled={pending}>
              Revoca
            </Button>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">Esempio</p>
          <pre className="overflow-x-auto rounded-md border bg-muted/40 p-3 text-xs">
            {CURL_EXAMPLE}
          </pre>
          <p className="text-xs text-muted-foreground">
            Identifica l&apos;anime con slug, anilistId, malId o title (+ season). I match per id
            esterno (anilistId/malId) funzionano solo sui titoli già in cache: per il match più
            affidabile usa slug o title.
          </p>
        </div>
      </div>
    </Card>
  );
}
