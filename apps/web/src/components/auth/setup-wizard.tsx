'use client';

import { AppearanceSection } from '@/components/settings/appearance-section';
import { FolderInput } from '@/components/settings/folder-picker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { trpc } from '@/lib/trpc';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Clapperboard,
  FolderTree,
  Loader2,
  Palette,
  RefreshCw,
  Server,
  Sparkles,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import { useState } from 'react';
import { toast } from 'sonner';

type PathKey = 'seriesPathSub' | 'seriesPathDub' | 'moviePathSub' | 'moviePathDub';

const DIR_FIELDS: { key: PathKey; label: string; hint: string; required?: boolean }[] = [
  {
    key: 'seriesPathSub',
    label: 'Serie · SUB ITA',
    hint: 'Cartella base per le serie sottotitolate. Obbligatoria: è anche il fallback delle altre.',
    required: true,
  },
  {
    key: 'seriesPathDub',
    label: 'Serie · DUB ITA',
    hint: 'Opzionale: serie doppiate in italiano.',
  },
  { key: 'moviePathSub', label: 'Film · SUB ITA', hint: 'Opzionale: film sottotitolati.' },
  { key: 'moviePathDub', label: 'Film · DUB ITA', hint: 'Opzionale: film doppiati.' },
];

// Passi del wizard nell'ordine di navigazione. Lo stepper li mostra etichettati.
const STEPS = ['Benvenuto', 'Cartelle', 'Aspetto', 'Jellyfin', 'Fine'] as const;

function SetupStepper({ step }: { step: number }) {
  return (
    <ol
      className="flex items-center justify-center gap-1.5 sm:gap-2"
      aria-label="Avanzamento setup"
    >
      {STEPS.map((label, i) => {
        const done = i < step;
        const current = i === step;
        return (
          <li
            key={label}
            className="flex items-center gap-1.5"
            aria-current={current ? 'step' : undefined}
          >
            <span
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
                done
                  ? 'bg-primary/20 text-primary'
                  : current
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground'
              }`}
            >
              {done ? <Check className="h-3.5 w-3.5" aria-hidden /> : i + 1}
            </span>
            <span
              className={`hidden text-xs font-medium sm:inline ${
                current ? 'text-foreground' : 'text-muted-foreground'
              }`}
            >
              {label}
            </span>
            {i < STEPS.length - 1 ? (
              <span className="mx-0.5 h-px w-3 bg-border sm:w-4" aria-hidden />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

// Badge di stato scrivibilità per una cartella di download (dopo la verifica).
function DirBadge({ writable }: { writable: boolean }) {
  return writable ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-600 dark:text-green-400">
      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
      Scrivibile
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
      <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
      Non scrivibile / non montata
    </span>
  );
}

export function SetupWizard() {
  const utils = trpc.useUtils();
  const configQuery = trpc.config.getAll.useQuery();
  const dirsQuery = trpc.config.downloadDirs.useQuery();
  const setMutation = trpc.config.set.useMutation();
  const syncMutation = trpc.catalog.sync.useMutation();
  const testJellyfin = trpc.jellyfin.testConnection.useMutation();
  const { theme, setTheme } = useTheme();

  const [step, setStep] = useState(0);
  const [paths, setPaths] = useState<Record<PathKey, string>>({
    seriesPathSub: '',
    seriesPathDub: '',
    moviePathSub: '',
    moviePathDub: '',
  });
  const [savedInit, setSavedInit] = useState(false);
  const [saving, setSaving] = useState(false);
  const [finishing, setFinishing] = useState(false);
  // La verifica cartelle avviene in due tempi: "Salva e verifica" (mostra i badge) → "Continua".
  // Ogni modifica a un percorso richiede una nuova verifica.
  const [folderVerified, setFolderVerified] = useState(false);

  const [jellyfin, setJellyfin] = useState({ serverUrl: '', apiKey: '', autoRefresh: true });
  const [savingJf, setSavingJf] = useState(false);
  const [jfResult, setJfResult] = useState<{
    ok: boolean;
    serverName?: string;
    version?: string;
    error?: string;
  } | null>(null);

  // Prefill una sola volta con quanto già in config (es. ripresa wizard). L'API key è un segreto
  // (mascherata da getAll): non la ripopolo, è primo setup.
  if (configQuery.data && !savedInit) {
    setPaths({
      seriesPathSub: configQuery.data.seriesPathSub,
      seriesPathDub: configQuery.data.seriesPathDub,
      moviePathSub: configQuery.data.moviePathSub,
      moviePathDub: configQuery.data.moviePathDub,
    });
    setJellyfin({
      serverUrl: configQuery.data.jellyfinServerUrl,
      apiKey: '',
      autoRefresh: configQuery.data.jellyfinAutoRefresh,
    });
    setSavedInit(true);
  }

  const seriesReady = paths.seriesPathSub.trim() !== '';

  const saveFolders = async (): Promise<boolean> => {
    setSaving(true);
    try {
      for (const field of DIR_FIELDS) {
        await setMutation.mutateAsync({ key: field.key, value: paths[field.key].trim() });
      }
      await utils.config.getAll.invalidate();
      await utils.config.downloadDirs.invalidate();
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Salvataggio non riuscito.');
      return false;
    } finally {
      setSaving(false);
    }
  };

  // Prima passata: salva i percorsi e verifica la scrivibilità (mostra i badge, non avanza).
  const verifyFolders = async () => {
    if (!seriesReady) return;
    const ok = await saveFolders();
    if (ok) setFolderVerified(true);
  };

  const accent = configQuery.data?.themeAccent ?? 'green';
  const background = configQuery.data?.themeBackgroundUrl ?? '';
  const animationsEnabled = configQuery.data?.animationsEnabled ?? true;
  const applyTheme = async (
    key: 'themeAccent' | 'themeBackgroundUrl' | 'animationsEnabled',
    value: unknown,
  ) => {
    await setMutation.mutateAsync({ key, value });
    await utils.config.getAll.invalidate();
  };

  const onTestJellyfin = async () => {
    try {
      const res = await testJellyfin.mutateAsync({
        serverUrl: jellyfin.serverUrl.trim(),
        apiKey: jellyfin.apiKey.trim() || undefined,
      });
      setJfResult(res);
      if (!res.ok) toast.error(res.error ?? 'Connessione non riuscita.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Connessione non riuscita.';
      setJfResult({ ok: false, error: message });
      toast.error(message);
    }
  };

  // Salva la config Jellyfin (l'API key solo se digitata) e avanza. "Salta" chiama con save=false.
  const finishJellyfin = async (save: boolean) => {
    if (save && jellyfin.serverUrl.trim()) {
      setSavingJf(true);
      try {
        await setMutation.mutateAsync({
          key: 'jellyfinServerUrl',
          value: jellyfin.serverUrl.trim(),
        });
        if (jellyfin.apiKey.trim()) {
          await setMutation.mutateAsync({ key: 'jellyfinApiKey', value: jellyfin.apiKey.trim() });
        }
        await setMutation.mutateAsync({ key: 'jellyfinAutoRefresh', value: jellyfin.autoRefresh });
        await utils.config.getAll.invalidate();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Salvataggio non riuscito.');
        setSavingJf(false);
        return;
      }
      setSavingJf(false);
    }
    setStep(4);
  };

  const finish = async () => {
    setFinishing(true);
    try {
      const status = await utils.catalog.syncStatus.fetch();
      if (!status.lastSyncedAt && !status.running) {
        syncMutation.mutate();
      }
      // Config già salvata: invalida così l'AuthGate fa entrare nell'app.
      await utils.config.getAll.invalidate();
      toast.success('Configurazione completata. Buona visione!');
    } finally {
      setFinishing(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden p-4">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-[-12%] h-[42rem] w-[42rem] -translate-x-1/2 rounded-full bg-primary/20 blur-[130px]" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/40 to-background" />
      </div>

      <div className="w-full max-w-lg">
        <div className="rounded-2xl border border-border/60 bg-card/80 p-8 shadow-2xl backdrop-blur-sm">
          {step === 0 ? (
            <div className="flex flex-col items-center gap-5 text-center">
              <img src="/logo.png" alt="AnimeUnion" className="h-16 w-auto drop-shadow" />
              <div className="space-y-2">
                <h1 className="text-2xl font-bold tracking-tight">
                  Benvenuto su AnimeUnion Docker
                </h1>
                <p className="text-sm text-muted-foreground">
                  In pochi passi scegli dove salvare i download, l'aspetto dell'app e, se la usi, la
                  connessione a Jellyfin. Puoi cambiare tutto dopo nelle Impostazioni.
                </p>
                <p className="rounded-lg bg-muted/50 p-3 text-left text-xs text-muted-foreground">
                  <strong className="text-foreground">Come funzionano le cartelle:</strong> nel
                  container hai montato le tue cartelle multimediali sotto <code>/media</code> (nel
                  file <code>docker-compose</code>). Qui indichi <em>quali</em> di quelle cartelle
                  usare, così i file finiscono nella tua libreria e non dentro il container.
                </p>
              </div>
              <Button className="h-11 w-full text-base font-semibold" onClick={() => setStep(1)}>
                <Sparkles className="mr-2 h-4 w-4" />
                Iniziamo
              </Button>
            </div>
          ) : null}

          {step === 1 ? (
            <div className="space-y-5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <FolderTree className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold">Cartelle di download</h2>
                  <p className="text-xs text-muted-foreground">
                    Usa percorsi sotto <code>/media</code>. Almeno "Serie · SUB ITA" è obbligatoria.
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                {DIR_FIELDS.map((f) => {
                  const dir = dirsQuery.data?.find((d) => d.key === f.key);
                  const configured = paths[f.key].trim() !== '';
                  return (
                    <div key={f.key} className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium">
                          {f.label}
                          {f.required ? <span className="ml-1 text-destructive">*</span> : null}
                        </p>
                        {folderVerified && configured && dir ? (
                          <DirBadge writable={dir.writable} />
                        ) : null}
                      </div>
                      <FolderInput
                        value={paths[f.key]}
                        placeholder={f.required ? '/media/Anime' : '(eredita da Serie · SUB ITA)'}
                        onChange={(path) => {
                          setPaths((prev) => ({ ...prev, [f.key]: path }));
                          setFolderVerified(false);
                        }}
                      />
                      <p className="text-xs text-muted-foreground">{f.hint}</p>
                    </div>
                  );
                })}
              </div>

              {folderVerified &&
              dirsQuery.data?.some((d) => paths[d.key as PathKey]?.trim() !== '' && !d.writable) ? (
                <p className="rounded-lg bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400">
                  Una o più cartelle non sono scrivibili. Di solito è il volume Docker non montato o
                  un percorso sbagliato: controlla il mapping in <code>docker-compose</code>. Puoi
                  proseguire e sistemare dopo, ma i download in quelle cartelle falliranno.
                </p>
              ) : null}

              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => setStep(0)} disabled={saving}>
                  Indietro
                </Button>
                {folderVerified ? (
                  <Button className="flex-1" onClick={() => setStep(2)}>
                    Continua
                  </Button>
                ) : (
                  <Button
                    className="flex-1"
                    onClick={verifyFolders}
                    disabled={!seriesReady || saving}
                  >
                    {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Salva e verifica
                  </Button>
                )}
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="space-y-5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Palette className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold">Aspetto</h2>
                  <p className="text-xs text-muted-foreground">
                    Tema, colore e sfondo. Modificabili quando vuoi nelle Impostazioni.
                  </p>
                </div>
              </div>

              <AppearanceSection
                theme={(theme ?? 'system') as 'light' | 'dark' | 'system'}
                onThemeChange={setTheme}
                accent={accent}
                onAccentChange={(v) => applyTheme('themeAccent', v)}
                backgroundUrl={background}
                onBackgroundChange={(url) => applyTheme('themeBackgroundUrl', url)}
                animationsEnabled={animationsEnabled}
                onAnimationsChange={(enabled) => applyTheme('animationsEnabled', enabled)}
              />

              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => setStep(1)}>
                  Indietro
                </Button>
                <Button className="flex-1" onClick={() => setStep(3)}>
                  Continua
                </Button>
              </div>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="space-y-5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Clapperboard className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold">Jellyfin (opzionale)</h2>
                  <p className="text-xs text-muted-foreground">
                    Se usi Jellyfin, collegalo per aggiornare la libreria dopo ogni download. Puoi
                    saltare e farlo dopo nelle Impostazioni.
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <p className="text-sm font-medium">URL del server</p>
                  <Input
                    autoComplete="off"
                    placeholder="http://…:8096"
                    value={jellyfin.serverUrl}
                    onChange={(e) => {
                      setJellyfin((prev) => ({ ...prev, serverUrl: e.target.value }));
                      setJfResult(null);
                    }}
                  />
                </div>
                <div className="space-y-1.5">
                  <p className="text-sm font-medium">API key</p>
                  <Input
                    type="password"
                    autoComplete="off"
                    placeholder="incolla la chiave API di Jellyfin"
                    value={jellyfin.apiKey}
                    onChange={(e) => {
                      setJellyfin((prev) => ({ ...prev, apiKey: e.target.value }));
                      setJfResult(null);
                    }}
                  />
                </div>
                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-primary"
                    checked={jellyfin.autoRefresh}
                    onChange={(e) =>
                      setJellyfin((prev) => ({ ...prev, autoRefresh: e.target.checked }))
                    }
                  />
                  Aggiorna la libreria Jellyfin dopo ogni download
                </label>

                <div className="flex items-center gap-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onTestJellyfin}
                    disabled={
                      testJellyfin.isPending ||
                      !jellyfin.serverUrl.trim() ||
                      !jellyfin.apiKey.trim()
                    }
                  >
                    {testJellyfin.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Server className="mr-2 h-4 w-4" />
                    )}
                    Prova connessione
                  </Button>
                  {jfResult?.ok ? (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-green-600 dark:text-green-400">
                      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                      {jfResult.serverName ?? 'Connesso'}
                      {jfResult.version ? ` · v${jfResult.version}` : ''}
                    </span>
                  ) : jfResult ? (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-destructive">
                      <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                      {jfResult.error ?? 'Non riuscita'}
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => setStep(2)} disabled={savingJf}>
                  Indietro
                </Button>
                <Button variant="ghost" onClick={() => finishJellyfin(false)} disabled={savingJf}>
                  Salta
                </Button>
                <Button className="flex-1" onClick={() => finishJellyfin(true)} disabled={savingJf}>
                  {savingJf ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {jellyfin.serverUrl.trim() ? 'Salva e continua' : 'Continua'}
                </Button>
              </div>
            </div>
          ) : null}

          {step === 4 ? (
            <div className="flex flex-col items-center gap-5 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-500/10 text-green-500">
                <Check className="h-6 w-6" />
              </div>
              <div className="space-y-2">
                <h2 className="text-lg font-semibold">Tutto pronto</h2>
                <p className="text-sm text-muted-foreground">
                  Configurazione salvata. Avvio la prima sincronizzazione del catalogo in
                  background: potrai già navigare e seguire i tuoi anime mentre si popola.
                </p>
              </div>
              <Button
                className="h-11 w-full text-base font-semibold"
                onClick={finish}
                disabled={finishing}
              >
                {finishing ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 h-4 w-4" />
                )}
                Entra nell'app
              </Button>
            </div>
          ) : null}

          <div className="mt-7">
            <SetupStepper step={step} />
          </div>
        </div>
      </div>
    </div>
  );
}
