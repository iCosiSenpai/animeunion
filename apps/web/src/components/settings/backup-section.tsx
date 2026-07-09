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
import { CloudUpload, Database, HardDriveDownload, Link2, Link2Off, RotateCcw } from 'lucide-react';
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
 * In coda: sotto-sezione "Google Drive" per il push cloud (bring-your-own OAuth client).
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

      <GoogleDriveSection />
    </div>
  );
}

/**
 * Push dei backup sul Google Drive dell'utente (bring-your-own OAuth client "Desktop").
 * Flusso HTTPS-free: autorizza → Google reindirizza al loopback → l'utente incolla il `code`.
 * Scope `drive.file` (solo i file dell'app). Secret cifrati a riposo e mascherati.
 */
function GoogleDriveSection() {
  const utils = trpc.useUtils();
  const config = trpc.config.getAll.useQuery();
  const status = trpc.backup.googleStatus.useQuery();

  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [code, setCode] = useState('');
  const [gRetention, setGRetention] = useState(7);
  useEffect(() => {
    if (config.data) {
      setClientId(config.data.gdriveClientId);
      setGRetention(config.data.gdriveRetention);
    }
  }, [config.data]);

  const refresh = () => {
    void utils.config.getAll.invalidate();
    void utils.backup.googleStatus.invalidate();
  };

  const setConfig = trpc.config.set.useMutation({ onError: (e) => toastError(e) });
  const exchange = trpc.backup.googleExchange.useMutation({
    onSuccess: () => {
      toast.success('Google Drive collegato.');
      setCode('');
      refresh();
    },
    onError: (e) => toastError(e, 'Collegamento non riuscito'),
  });
  const disconnect = trpc.backup.googleDisconnect.useMutation({
    onSuccess: () => {
      toast.success('Google Drive scollegato.');
      refresh();
    },
    onError: (e) => toastError(e, 'Operazione non riuscita'),
  });
  const backupNow = trpc.backup.googleBackupNow.useMutation({
    onSuccess: (r) => {
      toast.success(r.name ? `Caricato su Drive: ${r.name}` : 'Backup caricato su Drive.');
      void utils.backup.googleStatus.invalidate();
    },
    onError: (e) => {
      toastError(e, 'Upload su Drive non riuscito');
      void utils.backup.googleStatus.invalidate();
    },
  });

  const st = status.data;
  const connected = st?.connected ?? false;
  const clientConfigured = st?.clientConfigured ?? false;

  async function saveCredentials() {
    await setConfig.mutateAsync({ key: 'gdriveClientId', value: clientId.trim() });
    // Aggiorna il secret solo se l'utente ne ha digitato uno nuovo (campo vuoto = conserva quello
    // salvato). config.set ignora comunque il placeholder SECRET_MASK.
    if (clientSecret.trim() !== '') {
      await setConfig.mutateAsync({ key: 'gdriveClientSecret', value: clientSecret.trim() });
      setClientSecret('');
    }
    toast.success('Credenziali salvate.');
    refresh();
  }

  async function authorize() {
    try {
      const { url } = await utils.backup.googleAuthUrl.fetch();
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (e) {
      toastError(e, 'Impossibile generare il link di autorizzazione');
    }
  }

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold">Backup su Google Drive</h3>
          <p className="text-sm text-muted-foreground">
            Carica automaticamente l'ultimo backup nel tuo Drive. Usa un client OAuth tuo (scope{' '}
            <code className="text-xs">drive.file</code>: l'app vede solo i file che crea).
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
            connected
              ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
              : 'bg-muted text-muted-foreground'
          }`}
        >
          {connected ? 'Collegato' : 'Non collegato'}
        </span>
      </div>

      {/* Passo 1: credenziali del client OAuth Desktop */}
      <div className="space-y-3">
        <p className="text-sm font-medium">1. Credenziali client OAuth (Desktop)</p>
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer select-none">Come ottenerle</summary>
          <ol className="mt-1.5 list-decimal space-y-0.5 pl-4">
            <li>
              Su Google Cloud Console crea un progetto e abilita <strong>Google Drive API</strong>.
            </li>
            <li>
              In "Credenziali" crea un <strong>ID client OAuth</strong> di tipo{' '}
              <strong>App desktop</strong>.
            </li>
            <li>Incolla qui Client ID e Client Secret, poi salva.</li>
          </ol>
        </details>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <span className="text-sm font-medium">Client ID</span>
            <Input
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder="xxxxx.apps.googleusercontent.com"
            />
          </div>
          <div className="space-y-1.5">
            <span className="text-sm font-medium">Client Secret</span>
            <Input
              type="password"
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
              placeholder={clientConfigured ? '••••••••  (salvato)' : 'GOCSPX-…'}
            />
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void saveCredentials()}
          disabled={setConfig.isPending || clientId.trim() === ''}
        >
          Salva credenziali
        </Button>
      </div>

      {/* Passo 2: autorizzazione via loopback + incolla-codice */}
      <div className="space-y-3">
        <p className="text-sm font-medium">2. Autorizza l'accesso</p>
        {connected ? (
          <p className="text-sm text-muted-foreground">
            Accesso concesso. Puoi ripetere l'autorizzazione se cambi account.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Apri il consenso Google, autorizza, poi copia il <code className="text-xs">code</code>{' '}
            dalla barra dell'indirizzo (la pagina di reindirizzamento resta vuota) e incollalo qui.
          </p>
        )}
        <div className="flex flex-wrap items-end gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => void authorize()}
            disabled={!clientConfigured}
          >
            <Link2 className="h-4 w-4" /> {connected ? 'Ri-autorizza' : 'Autorizza Google Drive'}
          </Button>
          <div className="flex flex-1 items-end gap-2">
            <div className="min-w-0 flex-1 space-y-1.5">
              <span className="text-sm font-medium">Codice di autorizzazione</span>
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="4/0Axxxxxx…"
              />
            </div>
            <Button
              size="sm"
              onClick={() => exchange.mutate({ code: code.trim() })}
              disabled={exchange.isPending || code.trim() === ''}
            >
              Collega
            </Button>
          </div>
        </div>
      </div>

      {/* Passo 3: opzioni + azioni (solo se collegato) */}
      {connected && (
        <div className="space-y-3 border-t pt-3">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <span className="text-sm font-medium">Upload automatico su Drive</span>
              <Select
                value={st?.enabled ? 'on' : 'off'}
                onValueChange={(v) => {
                  setConfig.mutate(
                    { key: 'gdriveEnabled', value: v === 'on' },
                    { onSuccess: refresh },
                  );
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="on">Attivo (dopo ogni backup)</SelectItem>
                  <SelectItem value="off">Disattivo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <span className="text-sm font-medium">Copie su Drive da conservare</span>
              <Input
                type="number"
                min={1}
                value={gRetention}
                onChange={(e) => setGRetention(Number(e.target.value))}
                onBlur={() => setConfig.mutate({ key: 'gdriveRetention', value: gRetention })}
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              className="gap-1.5"
              onClick={() => backupNow.mutate()}
              disabled={backupNow.isPending}
            >
              <CloudUpload className="h-4 w-4" /> Backup su Drive ora
            </Button>
            <Button
              variant="outline"
              className="gap-1.5"
              onClick={() => disconnect.mutate()}
              disabled={disconnect.isPending}
            >
              <Link2Off className="h-4 w-4" /> Scollega
            </Button>
          </div>

          <div className="flex items-start gap-2 text-xs text-muted-foreground">
            <HardDriveDownload className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <div className="space-y-0.5">
              {st?.lastUploadAt ? (
                <p>
                  Ultimo upload: {new Date(st.lastUploadAt).toLocaleString('it-IT')}
                  {st.lastUploadName ? ` · ${st.lastUploadName}` : ''}
                </p>
              ) : (
                <p>Nessun upload ancora in questa sessione.</p>
              )}
              {st?.lastError && <p className="text-destructive">Ultimo errore: {st.lastError}</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
