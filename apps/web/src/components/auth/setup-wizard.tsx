'use client';

import { FolderInput } from '@/components/settings/folder-picker';
import { Button } from '@/components/ui/button';
import { trpc } from '@/lib/trpc';
import { Check, FolderTree, Loader2, RefreshCw, Sparkles } from 'lucide-react';
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

function StepDots({ step }: { step: number }) {
  return (
    <div className="flex items-center justify-center gap-2">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={`h-1.5 rounded-full transition-all ${
            i === step ? 'w-6 bg-primary' : 'w-1.5 bg-muted-foreground/30'
          }`}
        />
      ))}
    </div>
  );
}

export function SetupWizard() {
  const utils = trpc.useUtils();
  const configQuery = trpc.config.getAll.useQuery();
  const setMutation = trpc.config.set.useMutation();
  const syncMutation = trpc.catalog.sync.useMutation();

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

  // Prefill una sola volta con quanto già in config (es. ripresa wizard).
  if (configQuery.data && !savedInit) {
    setPaths({
      seriesPathSub: configQuery.data.seriesPathSub,
      seriesPathDub: configQuery.data.seriesPathDub,
      moviePathSub: configQuery.data.moviePathSub,
      moviePathDub: configQuery.data.moviePathDub,
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
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Salvataggio non riuscito.');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const goToSync = async () => {
    if (!seriesReady) return;
    const ok = await saveFolders();
    if (ok) setStep(2);
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
              <img src="/logo.png" alt="AnimeUnion" className="h-14 w-auto drop-shadow" />
              <div className="space-y-2">
                <h1 className="text-2xl font-bold tracking-tight">
                  Benvenuto su AnimeUnion Docker
                </h1>
                <p className="text-sm text-muted-foreground">
                  Ancora un passo: scegli <strong>dove salvare i download</strong>. Userai le
                  cartelle che hai montato nel container (sotto <code>/media</code>), così i file
                  finiscono nella tua libreria e non in una cartella interna.
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
                    Almeno la cartella "Serie · SUB ITA" è obbligatoria.
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                {DIR_FIELDS.map((f) => (
                  <div key={f.key} className="space-y-1.5">
                    <p className="text-sm font-medium">
                      {f.label}
                      {f.required ? <span className="ml-1 text-destructive">*</span> : null}
                    </p>
                    <FolderInput
                      value={paths[f.key]}
                      placeholder={f.required ? '/media/Anime' : '(eredita da Serie · SUB ITA)'}
                      onChange={(path) => setPaths((prev) => ({ ...prev, [f.key]: path }))}
                    />
                    <p className="text-xs text-muted-foreground">{f.hint}</p>
                  </div>
                ))}
              </div>

              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => setStep(0)} disabled={saving}>
                  Indietro
                </Button>
                <Button className="flex-1" onClick={goToSync} disabled={!seriesReady || saving}>
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Salva e continua
                </Button>
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="flex flex-col items-center gap-5 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-500/10 text-green-500">
                <Check className="h-6 w-6" />
              </div>
              <div className="space-y-2">
                <h2 className="text-lg font-semibold">Tutto pronto</h2>
                <p className="text-sm text-muted-foreground">
                  Cartelle salvate. Avvio la prima sincronizzazione del catalogo in background:
                  potrai già navigare mentre si popola.
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
            <StepDots step={step} />
          </div>
        </div>
      </div>
    </div>
  );
}
