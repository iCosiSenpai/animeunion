'use client';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { trpc } from '@/lib/trpc';
import type { AppConfig } from '@animeunion/shared';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1.5 sm:grid-cols-[220px_1fr] sm:items-center sm:gap-4">
      <div>
        <p className="text-sm font-medium">{label}</p>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </div>
      <div>{children}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="space-y-4 p-5">
      <h2 className="text-lg font-semibold">{title}</h2>
      <Separator />
      <div className="space-y-4">{children}</div>
    </Card>
  );
}

export function SettingsView() {
  const utils = trpc.useUtils();
  const configQuery = trpc.config.getAll.useQuery();
  const setMutation = trpc.config.set.useMutation();
  const syncMutation = trpc.catalog.sync.useMutation();
  const { theme, setTheme } = useTheme();

  const [draft, setDraft] = useState<AppConfig | null>(null);
  const [saving, setSaving] = useState(false);

  // Inizializza il form quando arriva la config dal backend.
  useEffect(() => {
    if (configQuery.data && !draft) {
      setDraft(configQuery.data);
    }
  }, [configQuery.data, draft]);

  if (!draft) {
    return (
      <div className="space-y-4">
        <div className="h-40 animate-pulse rounded-lg bg-muted" />
        <div className="h-40 animate-pulse rounded-lg bg-muted" />
      </div>
    );
  }

  const update = <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => {
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const onSave = async () => {
    if (!configQuery.data) {
      return;
    }
    const original = configQuery.data;
    const changed = (Object.keys(draft) as (keyof AppConfig)[]).filter(
      (key) => draft[key] !== original[key],
    );
    if (changed.length === 0) {
      toast.info('Nessuna modifica da salvare.');
      return;
    }
    setSaving(true);
    try {
      for (const key of changed) {
        await setMutation.mutateAsync({ key, value: draft[key] });
      }
      await utils.config.getAll.invalidate();
      toast.success('Impostazioni salvate.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Salvataggio non riuscito.');
    } finally {
      setSaving(false);
    }
  };

  const onSyncNow = async () => {
    try {
      await syncMutation.mutateAsync();
      toast.success('Sincronizzazione del catalogo avviata.');
    } catch {
      toast.error('Impossibile avviare la sincronizzazione.');
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-24">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Impostazioni</h1>
        <p className="text-sm text-muted-foreground">
          Configurazione di download, pianificazione e organizzazione dei file.
        </p>
      </div>

      <Section title="Libreria">
        <Field
          label="Cartella della libreria"
          hint="Percorso dove salvare gli episodi (volume Docker, es. /data/anime montato sul tuo NAS)."
        >
          <Input value={draft.animePath} onChange={(e) => update('animePath', e.target.value)} />
        </Field>
        <Field label="Download simultanei" hint="Quanti episodi scaricare in parallelo (1-5).">
          <Select
            value={String(draft.maxConcurrent)}
            onValueChange={(v) => update('maxConcurrent', Number(v))}
          >
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[1, 2, 3, 4, 5].map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </Section>

      <Section title="Pianificazione">
        <Field label="Auto-download" hint="Scarica automaticamente i nuovi episodi dei preferiti.">
          <Select
            value={draft.autoDownload ? 'on' : 'off'}
            onValueChange={(v) => update('autoDownload', v === 'on')}
          >
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="on">Attivo</SelectItem>
              <SelectItem value="off">Disattivo</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field
          label="Frequenza sync preferiti"
          hint="Ogni quanti minuti controllare le novità dei preferiti."
        >
          <Input
            type="number"
            min={1}
            className="w-32"
            value={draft.favoritesSyncMinutes}
            onChange={(e) => update('favoritesSyncMinutes', Number(e.target.value))}
          />
        </Field>
        <Field
          label="Pulizia automatica coda"
          hint="Dopo quanti giorni rimuovere i download completati, cancellati o falliti."
        >
          <Input
            type="number"
            min={1}
            className="w-32"
            value={draft.queueRetentionDays}
            onChange={(e) => update('queueRetentionDays', Number(e.target.value))}
          />
        </Field>
      </Section>

      <Section title="Catalogo">
        <Field
          label="Frequenza sync catalogo"
          hint="Ogni quante ore aggiornare il catalogo locale."
        >
          <Select
            value={String(draft.catalogSyncHours)}
            onValueChange={(v) => update('catalogSyncHours', Number(v))}
          >
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="6">Ogni 6 ore</SelectItem>
              <SelectItem value="12">Ogni 12 ore</SelectItem>
              <SelectItem value="24">Ogni 24 ore</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Sincronizzazione manuale" hint="Forza subito un aggiornamento del catalogo.">
          <Button variant="outline" onClick={onSyncNow} disabled={syncMutation.isPending}>
            {syncMutation.isPending ? 'Avvio…' : 'Sincronizza ora'}
          </Button>
        </Field>
      </Section>

      <Section title="Lingua">
        <Field label="Lingua preferita" hint="Lingua da scaricare quando disponibile.">
          <Select
            value={draft.language}
            onValueChange={(v) => update('language', v as AppConfig['language'])}
          >
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="SUB_ITA">Sub ITA</SelectItem>
              <SelectItem value="DUB_ITA">Dub ITA</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field
          label="Fallback lingua"
          hint="Se l'episodio non è disponibile nella lingua preferita, prova con l'altra."
        >
          <Select
            value={draft.languageFallback ? 'on' : 'off'}
            onValueChange={(v) => update('languageFallback', v === 'on')}
          >
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="on">Attivo</SelectItem>
              <SelectItem value="off">Disattivo</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </Section>

      <Section title="Notifiche">
        <Field
          label="Notifica completamento"
          hint="Mostra un toast quando un episodio finisce di scaricarsi."
        >
          <Select
            value={draft.notifyOnComplete ? 'on' : 'off'}
            onValueChange={(v) => update('notifyOnComplete', v === 'on')}
          >
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="on">Attivo</SelectItem>
              <SelectItem value="off">Disattivo</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field
          label="Provider futuri"
          hint="Web Push, Telegram e Discord saranno disponibili in una prossima release."
        >
          <div className="flex flex-wrap gap-2">
            {['Web Push', 'Telegram', 'Discord'].map((name) => (
              <span
                key={name}
                className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs text-muted-foreground"
              >
                {name}
              </span>
            ))}
          </div>
        </Field>
      </Section>

      <Section title="Aspetto">
        <Field label="Tema" hint="Chiaro, scuro o come il sistema.">
          <Select value={theme ?? 'system'} onValueChange={setTheme}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="light">Chiaro</SelectItem>
              <SelectItem value="dark">Scuro</SelectItem>
              <SelectItem value="system">Sistema</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </Section>

      <div className="fixed inset-x-0 bottom-0 border-t bg-background/95 p-4 backdrop-blur">
        <div className="mx-auto flex max-w-3xl justify-end">
          <Button onClick={onSave} disabled={saving}>
            {saving ? 'Salvataggio…' : 'Salva'}
          </Button>
        </div>
      </div>
    </div>
  );
}
