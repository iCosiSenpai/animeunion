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
  type LucideIcon,
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

const STEPS: { label: string; description: string }[] = [
  { label: 'Benvenuto', description: 'Come funzionerà il tuo spazio' },
  { label: 'Cartelle', description: 'Destinazioni per serie e film' },
  { label: 'Aspetto', description: 'Tema, colore e wallpaper' },
  { label: 'Jellyfin', description: 'Collegamento facoltativo' },
  { label: 'Fine', description: 'Riepilogo e primo avvio' },
];

function SetupProgress({ step, variant }: { step: number; variant: 'mobile' | 'desktop' }) {
  if (variant === 'desktop') {
    return (
      <ol className="space-y-1" aria-label="Avanzamento setup">
        {STEPS.map((item, index) => {
          const done = index < step;
          const current = index === step;
          return (
            <li
              key={item.label}
              className={`grid grid-cols-[2rem_minmax(0,1fr)] gap-3 rounded-xl px-3 py-2.5 transition-colors ${
                current ? 'bg-primary/10 text-foreground' : 'text-muted-foreground'
              }`}
              aria-current={current ? 'step' : undefined}
            >
              <span
                className={`flex h-8 w-8 items-center justify-center rounded-full border text-xs font-semibold transition-colors ${
                  done
                    ? 'border-primary/30 bg-primary/15 text-primary'
                    : current
                      ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                      : 'border-border/70 bg-background/50'
                }`}
              >
                {done ? <Check className="h-4 w-4" aria-hidden /> : index + 1}
              </span>
              <span className="min-w-0 pt-0.5">
                <span className={`block text-sm font-semibold ${current ? 'text-foreground' : ''}`}>
                  {item.label}
                </span>
                <span className="mt-0.5 block text-[11px] leading-4">{item.description}</span>
              </span>
            </li>
          );
        })}
      </ol>
    );
  }

  return (
    <ol
      className="flex items-center justify-center gap-1.5 sm:gap-2"
      aria-label="Avanzamento setup"
    >
      {STEPS.map((item, index) => {
        const done = index < step;
        const current = index === step;
        return (
          <li
            key={item.label}
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
              {done ? <Check className="h-3.5 w-3.5" aria-hidden /> : index + 1}
            </span>
            <span
              className={`hidden text-xs font-medium sm:inline ${
                current ? 'text-foreground' : 'text-muted-foreground'
              }`}
            >
              {item.label}
            </span>
            {index < STEPS.length - 1 ? (
              <span className="mx-0.5 h-px w-3 bg-border sm:w-4" aria-hidden />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

function StepHeader({
  icon: Icon,
  eyebrow,
  title,
  description,
}: {
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  description: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 sm:gap-4">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-primary/15 bg-primary/10 text-primary shadow-sm">
        <Icon className="h-5 w-5" aria-hidden />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
          {eyebrow}
        </p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

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
      // Il marker viene scritto prima della cartella obbligatoria: l'invalidazione finale non può
      // far interpretare un setup ancora in corso come già completato e smontare il wizard.
      await setMutation.mutateAsync({ key: 'setupCompleted', value: false });
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
    try {
      await setMutation.mutateAsync({ key, value });
      await utils.config.getAll.invalidate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Modifica dell’aspetto non riuscita.');
    }
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
      // Solo il CTA finale chiude l'onboarding. Dopo l'invalidazione AuthGate entra nell'app e
      // InitialSync avvia il catalogo in background se necessario.
      await setMutation.mutateAsync({ key: 'setupCompleted', value: true });
      await utils.config.getAll.invalidate();
      toast.success('Configurazione completata. Buona visione!');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Completamento non riuscito. Riprova.');
    } finally {
      setFinishing(false);
    }
  };

  const themeLabel = theme === 'light' ? 'Chiaro' : theme === 'dark' ? 'Scuro' : 'Sistema';

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-x-hidden p-3 sm:p-6 lg:p-8">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-[-18%] h-[46rem] w-[46rem] -translate-x-1/2 rounded-full bg-primary/20 blur-[140px]" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/40 to-background" />
      </div>

      <div className="w-full max-w-6xl">
        <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/80 shadow-2xl backdrop-blur-sm lg:grid lg:min-h-[38rem] lg:grid-cols-[18rem_minmax(0,1fr)] lg:rounded-[1.75rem]">
          <aside className="relative hidden overflow-hidden border-r border-border/60 bg-muted/30 p-7 lg:flex lg:flex-col">
            <div className="pointer-events-none absolute -left-24 -top-24 h-64 w-64 rounded-full bg-primary/15 blur-3xl" />
            <div className="relative">
              <img src="/logo.png" alt="AnimeUnion" className="h-10 w-auto drop-shadow" />
              <p className="mt-6 font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-primary">
                Setup / {String(step + 1).padStart(2, '0')} di 05
              </p>
              <p className="mt-2 text-xl font-semibold leading-tight tracking-tight">
                Prepara il tuo spazio anime.
              </p>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                Una configurazione guidata, poi tutto resta modificabile dalle Impostazioni.
              </p>
            </div>

            <div className="relative my-7 h-px bg-border/70" />
            <div className="relative flex-1">
              <SetupProgress step={step} variant="desktop" />
            </div>

            <p className="relative mt-6 rounded-xl border border-border/60 bg-background/35 p-3 text-[11px] leading-5 text-muted-foreground">
              I percorsi e le credenziali restano nella tua installazione. Nessun file multimediale
              viene spostato durante il setup.
            </p>
          </aside>

          <main className="min-w-0 p-5 sm:p-8 lg:p-10">
            <div className="mb-7 lg:hidden">
              <SetupProgress step={step} variant="mobile" />
            </div>

            {step === 0 ? (
              <div className="grid items-center gap-8 lg:min-h-[30rem] lg:grid-cols-[minmax(0,1.1fr)_minmax(17rem,0.9fr)]">
                <div className="space-y-5">
                  <img
                    src="/logo.png"
                    alt="AnimeUnion"
                    className="h-14 w-auto drop-shadow lg:hidden"
                  />
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
                      Prima configurazione
                    </p>
                    <h1 className="mt-2 text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
                      La tua libreria, nel posto giusto.
                    </h1>
                    <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground sm:text-base">
                      Scegli dove salvare i download, personalizza l'app e collega Jellyfin se lo
                      usi. Dopo potrai cambiare ogni scelta dalle Impostazioni.
                    </p>
                  </div>
                  <p className="rounded-xl border border-border/60 bg-muted/40 p-4 text-xs leading-5 text-muted-foreground lg:hidden">
                    <strong className="text-foreground">Come funzionano le cartelle:</strong> nel
                    container hai montato le cartelle multimediali sotto <code>/media</code>. Qui
                    scegli quali usare, così i file non restano dentro il container.
                  </p>
                  <Button
                    className="h-11 w-full text-base font-semibold sm:w-auto sm:min-w-44"
                    onClick={() => setStep(1)}
                  >
                    <Sparkles className="mr-2 h-4 w-4" />
                    Iniziamo
                  </Button>
                </div>

                <div className="hidden rounded-2xl border border-border/60 bg-muted/30 p-6 lg:block">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <FolderTree className="h-5 w-5" aria-hidden />
                  </div>
                  <h3 className="mt-5 text-base font-semibold">I file restano dove decidi tu</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    Nel container le cartelle multimediali sono montate sotto <code>/media</code>.
                    Indica qui le destinazioni e AnimeUnion userà direttamente la tua libreria.
                  </p>
                  <ul className="mt-5 space-y-3 text-xs text-muted-foreground">
                    {[
                      'Cartelle verificate prima dei download',
                      'Tema applicato in anteprima',
                      'Jellyfin sempre facoltativo',
                    ].map((item) => (
                      <li key={item} className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : null}

            {step === 1 ? (
              <div>
                <StepHeader
                  icon={FolderTree}
                  eyebrow="Passo 2 di 5"
                  title="Cartelle di download"
                  description={
                    <>
                      Usa percorsi sotto <code>/media</code>. “Serie · SUB ITA” è obbligatoria e fa
                      da fallback alle destinazioni lasciate vuote.
                    </>
                  }
                />

                <div className="mt-6 grid gap-3 md:grid-cols-2 lg:gap-4">
                  {DIR_FIELDS.map((field) => {
                    const dir = dirsQuery.data?.find((item) => item.key === field.key);
                    const configured = paths[field.key].trim() !== '';
                    return (
                      <div
                        key={field.key}
                        className="min-w-0 space-y-2 rounded-xl border border-border/60 bg-background/35 p-4"
                      >
                        <div className="flex min-h-5 items-start justify-between gap-2">
                          <p className="text-sm font-medium">
                            {field.label}
                            {field.required ? (
                              <span className="ml-1 text-destructive" aria-label="obbligatoria">
                                *
                              </span>
                            ) : null}
                          </p>
                          {folderVerified && configured && dir ? (
                            <DirBadge writable={dir.writable} />
                          ) : null}
                        </div>
                        <FolderInput
                          value={paths[field.key]}
                          placeholder={
                            field.required ? '/media/Anime' : '(eredita da Serie · SUB ITA)'
                          }
                          onChange={(path) => {
                            setPaths((previous) => ({ ...previous, [field.key]: path }));
                            setFolderVerified(false);
                          }}
                        />
                        <p className="text-xs leading-5 text-muted-foreground">{field.hint}</p>
                      </div>
                    );
                  })}
                </div>

                {folderVerified &&
                dirsQuery.data?.some(
                  (dir) => paths[dir.key as PathKey]?.trim() !== '' && !dir.writable,
                ) ? (
                  <p className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-xs leading-5 text-amber-700 dark:text-amber-400">
                    Una o più cartelle non sono scrivibili. Di solito è il volume Docker non montato
                    o un percorso sbagliato: controlla il mapping in <code>docker-compose</code>.
                    Puoi proseguire, ma i download in quelle cartelle falliranno.
                  </p>
                ) : null}

                <div className="mt-6 flex flex-col gap-2 border-t border-border/60 pt-5 sm:flex-row sm:items-center sm:justify-between">
                  <Button
                    variant="ghost"
                    className="w-full sm:w-auto"
                    onClick={() => setStep(0)}
                    disabled={saving}
                  >
                    Indietro
                  </Button>
                  {folderVerified ? (
                    <Button className="w-full sm:w-auto sm:min-w-40" onClick={() => setStep(2)}>
                      Continua
                    </Button>
                  ) : (
                    <Button
                      className="w-full sm:w-auto sm:min-w-40"
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
              <div>
                <StepHeader
                  icon={Palette}
                  eyebrow="Passo 3 di 5"
                  title="Aspetto"
                  description="Scegli tema, colore e sfondo. Le modifiche si vedono subito e restano modificabili nelle Impostazioni."
                />

                <div className="mt-6">
                  <AppearanceSection
                    variant="setup"
                    theme={(theme ?? 'system') as 'light' | 'dark' | 'system'}
                    onThemeChange={setTheme}
                    accent={accent}
                    onAccentChange={(value) => applyTheme('themeAccent', value)}
                    backgroundUrl={background}
                    onBackgroundChange={(url) => applyTheme('themeBackgroundUrl', url)}
                    animationsEnabled={animationsEnabled}
                    onAnimationsChange={(enabled) => applyTheme('animationsEnabled', enabled)}
                  />
                </div>

                <div className="mt-6 flex flex-col gap-2 border-t border-border/60 pt-5 sm:flex-row sm:items-center sm:justify-between">
                  <Button variant="ghost" className="w-full sm:w-auto" onClick={() => setStep(1)}>
                    Indietro
                  </Button>
                  <Button className="w-full sm:w-auto sm:min-w-40" onClick={() => setStep(3)}>
                    Continua
                  </Button>
                </div>
              </div>
            ) : null}

            {step === 3 ? (
              <div>
                <StepHeader
                  icon={Clapperboard}
                  eyebrow="Passo 4 di 5"
                  title="Jellyfin (opzionale)"
                  description="Collega Jellyfin per aggiornare la libreria dopo ogni download, oppure salta e configuralo più tardi."
                />

                <div className="mt-6 grid gap-4 md:grid-cols-2">
                  <div className="space-y-2 rounded-xl border border-border/60 bg-background/35 p-4">
                    <p className="text-sm font-medium">URL del server</p>
                    <Input
                      autoComplete="off"
                      placeholder="http://…:8096"
                      value={jellyfin.serverUrl}
                      onChange={(event) => {
                        setJellyfin((previous) => ({
                          ...previous,
                          serverUrl: event.target.value,
                        }));
                        setJfResult(null);
                      }}
                    />
                    <p className="text-xs leading-5 text-muted-foreground">
                      L'indirizzo raggiungibile dal container AnimeUnion.
                    </p>
                  </div>
                  <div className="space-y-2 rounded-xl border border-border/60 bg-background/35 p-4">
                    <p className="text-sm font-medium">API key</p>
                    <Input
                      type="password"
                      autoComplete="off"
                      placeholder="incolla la chiave API di Jellyfin"
                      value={jellyfin.apiKey}
                      onChange={(event) => {
                        setJellyfin((previous) => ({ ...previous, apiKey: event.target.value }));
                        setJfResult(null);
                      }}
                    />
                    <p className="text-xs leading-5 text-muted-foreground">
                      Creala dal pannello API di Jellyfin; viene salvata in modo protetto.
                    </p>
                  </div>

                  <div className="flex flex-col gap-4 rounded-xl border border-border/60 bg-muted/25 p-4 sm:flex-row sm:items-center sm:justify-between md:col-span-2">
                    <label className="flex items-center gap-2 text-sm text-muted-foreground">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-primary"
                        checked={jellyfin.autoRefresh}
                        onChange={(event) =>
                          setJellyfin((previous) => ({
                            ...previous,
                            autoRefresh: event.target.checked,
                          }))
                        }
                      />
                      Aggiorna la libreria Jellyfin dopo ogni download
                    </label>

                    <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
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
                </div>

                <div className="mt-6 flex flex-col gap-2 border-t border-border/60 pt-5 sm:flex-row sm:items-center sm:justify-between">
                  <Button
                    variant="ghost"
                    className="w-full sm:w-auto"
                    onClick={() => setStep(2)}
                    disabled={savingJf}
                  >
                    Indietro
                  </Button>
                  <div className="flex flex-col gap-2 sm:ml-auto sm:flex-row">
                    <Button
                      variant="ghost"
                      className="w-full sm:w-auto"
                      onClick={() => finishJellyfin(false)}
                      disabled={savingJf}
                    >
                      Salta
                    </Button>
                    <Button
                      className="w-full sm:min-w-40"
                      onClick={() => finishJellyfin(true)}
                      disabled={savingJf}
                    >
                      {savingJf ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      {jellyfin.serverUrl.trim() ? 'Salva e continua' : 'Continua'}
                    </Button>
                  </div>
                </div>
              </div>
            ) : null}

            {step === 4 ? (
              <div className="grid items-center gap-8 lg:min-h-[30rem] lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.9fr)]">
                <div>
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-500/10 text-green-500">
                    <Check className="h-6 w-6" aria-hidden />
                  </div>
                  <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
                    Passo 5 di 5
                  </p>
                  <h1 className="mt-2 text-3xl font-bold tracking-tight">Tutto pronto</h1>
                  <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
                    La configurazione è salvata. Entrando nell'app partirà la prima sincronizzazione
                    del catalogo in background: potrai già navigare mentre si popola.
                  </p>
                  <Button
                    className="mt-6 h-11 w-full text-base font-semibold sm:w-auto sm:min-w-48"
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

                <dl className="min-w-0 divide-y divide-border/60 rounded-2xl border border-border/60 bg-muted/30 px-5">
                  <div className="py-4">
                    <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Cartella principale
                    </dt>
                    <dd className="mt-1 break-all font-mono text-xs text-foreground">
                      {paths.seriesPathSub || 'Da configurare'}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-4 py-4">
                    <dt className="text-xs text-muted-foreground">Tema</dt>
                    <dd className="text-sm font-medium">{themeLabel}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-4 py-4">
                    <dt className="text-xs text-muted-foreground">Jellyfin</dt>
                    <dd className="max-w-[65%] truncate text-right text-sm font-medium">
                      {jellyfin.serverUrl.trim() || 'Non collegato'}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-4 py-4">
                    <dt className="text-xs text-muted-foreground">Catalogo</dt>
                    <dd className="inline-flex items-center gap-1.5 text-sm font-medium text-primary">
                      <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden />
                      Sync al primo avvio
                    </dd>
                  </div>
                </dl>
              </div>
            ) : null}
          </main>
        </div>
      </div>
    </div>
  );
}
