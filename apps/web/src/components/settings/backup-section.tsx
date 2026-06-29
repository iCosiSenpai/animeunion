'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toastError } from '@/lib/toast-error';
import { trpc } from '@/lib/trpc';
import { Database, RotateCcw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i += 1;
  }
  return `${n.toFixed(n >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

/**
 * Backup/ripristino del database. Pannello standalone (config salvata subito via config.set,
 * fuori dal draft globale), con azioni dirette: esegui backup, elenco copie, ripristina (riavvio).
 */
export function BackupSection() {
  const utils = trpc.useUtils();
  const config = trpc.config.getAll.useQuery();
  const list = trpc.backup.list.useQuery();

  const enabled = config.data?.dbBackupEnabled ?? false;
  const [intervalHours, setIntervalHours] = useState(24);
  const [retention, setRetention] = useState(7);
  useEffect(() => {
    if (config.data) {
      setIntervalHours(config.data.dbBackupIntervalHours);
      setRetention(config.data.dbBackupRetention);
    }
  }, [config.data]);

  const setConfig = trpc.config.set.useMutation({
    onSuccess: () => void utils.config.getAll.invalidate(),
    onError: (e) => toastError(e),
  });
  const runNow = trpc.backup.runNow.useMutation({
    onSuccess: (r) => {
      toast.success(`Backup creato (${formatBytes(r.size)}).`);
      void utils.backup.list.invalidate();
    },
    onError: (e) => toastError(e, 'Backup non riuscito'),
  });
  const restore = trpc.backup.restore.useMutation({
    onSuccess: () => toast.success('Ripristino pronto: riavvia il server per applicarlo.'),
    onError: (e) => toastError(e, 'Ripristino non riuscito'),
  });

  const entries = list.data?.entries ?? [];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Backup del database</h2>
        <p className="text-sm text-muted-foreground">
          Copia di sicurezza di seguiti, coda, libreria e organizzazione file. Il ripristino
          richiede il riavvio del server.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <span className="text-sm font-medium">Backup automatico</span>
          <Select
            value={enabled ? 'on' : 'off'}
            onValueChange={(v) => setConfig.mutate({ key: 'dbBackupEnabled', value: v === 'on' })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="on">Attivo</SelectItem>
              <SelectItem value="off">Disattivo</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <span className="text-sm font-medium">Ogni quante ore</span>
          <Input
            type="number"
            min={1}
            value={intervalHours}
            onChange={(e) => setIntervalHours(Number(e.target.value))}
            onBlur={() => setConfig.mutate({ key: 'dbBackupIntervalHours', value: intervalHours })}
          />
        </div>
        <div className="space-y-1.5">
          <span className="text-sm font-medium">Copie da conservare</span>
          <Input
            type="number"
            min={1}
            value={retention}
            onChange={(e) => setRetention(Number(e.target.value))}
            onBlur={() => setConfig.mutate({ key: 'dbBackupRetention', value: retention })}
          />
        </div>
      </div>

      <Button className="gap-1.5" onClick={() => runNow.mutate()} disabled={runNow.isPending}>
        <Database className="h-4 w-4" /> Esegui backup ora
      </Button>

      <div>
        <p className="mb-2 text-sm font-medium">Backup disponibili</p>
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nessun backup ancora.</p>
        ) : (
          <ul className="max-h-72 divide-y overflow-y-auto rounded-lg border">
            {entries.map((entry) => (
              <li key={entry.name} className="flex items-center justify-between gap-2 p-2 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-mono text-xs">{entry.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(entry.createdAt).toLocaleString('it-IT')} · {formatBytes(entry.size)}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0 gap-1.5"
                  disabled={restore.isPending}
                  onClick={() => restore.mutate({ name: entry.name })}
                >
                  <RotateCcw className="h-4 w-4" /> Ripristina
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
