'use client';

import { FolderInput } from '@/components/settings/folder-picker';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { ExternalLink, Send } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useRouter } from 'next/navigation';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

type PathKey = 'seriesPathSub' | 'seriesPathDub' | 'moviePathSub' | 'moviePathDub';

const DIR_FIELDS: { key: PathKey; label: string; hint: string }[] = [
  {
    key: 'seriesPathSub',
    label: 'Serie · SUB ITA',
    hint: 'Cartella base per le serie (SUB ITA). È anche il fallback per le altre se vuote.',
  },
  {
    key: 'seriesPathDub',
    label: 'Serie · DUB ITA',
    hint: 'Opzionale: cartella separata per le serie DUB ITA.',
  },
  {
    key: 'moviePathSub',
    label: 'Film · SUB ITA',
    hint: 'Opzionale: cartella separata per i film (SUB ITA).',
  },
  {
    key: 'moviePathDub',
    label: 'Film · DUB ITA',
    hint: 'Opzionale: cartella separata per i film DUB ITA.',
  },
];

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
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
  const router = useRouter();
  const configQuery = trpc.config.getAll.useQuery();
  const setMutation = trpc.config.set.useMutation();
  const syncMutation = trpc.catalog.sync.useMutation();
  const testTelegramMutation = trpc.notifications.testTelegram.useMutation();
  const { theme, setTheme } = useTheme();

  const [draft, setDraft] = useState<AppConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [showLeaveDialog, setShowLeaveDialog] = useState(false);
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  // Inizializza il form quando arriva la config dal backend.
  useEffect(() => {
    if (configQuery.data && !draft) {
      setDraft(configQuery.data);
    }
  }, [configQuery.data, draft]);

  const original = configQuery.data ?? null;
  const dirtyKeys = useMemo(() => {
    if (!draft || !original) return [];
    return (Object.keys(draft) as (keyof AppConfig)[]).filter(
      (key) => draft[key] !== original[key],
    );
  }, [draft, original]);
  const isDirty = dirtyKeys.length > 0;

  // Avvisa il browser prima di ricaricare/chiudere la pagina con modifiche pending.
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  // Intercetta la navigazione interna sui link mentre il form è dirty.
  useEffect(() => {
    if (!isDirty) return;

    const handler = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement).closest<HTMLAnchorElement>('a[href]');
      if (!anchor) return;
      const href = anchor.getAttribute('href');
      if (
        !href ||
        href.startsWith('http') ||
        href.startsWith('mailto:') ||
        href.startsWith('tel:')
      ) {
        return;
      }
      if (href.startsWith('#')) return;
      e.preventDefault();
      setPendingHref(href);
      setShowLeaveDialog(true);
    };

    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [isDirty]);

  // Intercetta il pulsante indietro del browser.
  useEffect(() => {
    if (!isDirty) return;
    const handler = () => {
      // Mostra il dialog: push una state fittizia per permettere all'utente di rimanere.
      window.history.pushState({ leaveGuard: true }, '');
      setPendingHref(null);
      setShowLeaveDialog(true);
    };
    window.addEventListener('popstate', handler);
    return () => window.removeEventListener('popstate', handler);
  }, [isDirty]);

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

  const saveChanges = async (): Promise<boolean> => {
    if (!original) return false;
    if (dirtyKeys.length === 0) {
      return true;
    }
    setSaving(true);
    try {
      for (const key of dirtyKeys) {
        await setMutation.mutateAsync({ key, value: draft[key] });
      }
      await utils.config.getAll.invalidate();
      toast.success('Impostazioni salvate.');
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Salvataggio non riuscito.');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const onSave = async () => {
    await saveChanges();
  };

  const onDiscard = () => {
    if (original) {
      setDraft(original);
    }
    setShowLeaveDialog(false);
    if (pendingHref) {
      router.push(pendingHref);
      setPendingHref(null);
    }
  };

  const onSaveAndContinue = async () => {
    const ok = await saveChanges();
    if (ok) {
      setShowLeaveDialog(false);
      if (pendingHref) {
        router.push(pendingHref);
        setPendingHref(null);
      }
    }
  };

  const onStay = () => {
    setShowLeaveDialog(false);
    setPendingHref(null);
  };

  const onSyncNow = async () => {
    try {
      await syncMutation.mutateAsync();
      toast.success('Sincronizzazione del catalogo avviata.');
    } catch {
      toast.error('Impossibile avviare la sincronizzazione.');
    }
  };

  const onTestTelegram = async () => {
    try {
      const res = await testTelegramMutation.mutateAsync({
        botToken: draft.telegramBotToken,
        chatId: draft.telegramChatId,
      });
      if (res.ok) {
        toast.success('Messaggio di test inviato su Telegram.');
      } else {
        toast.error(res.error ?? 'Invio del messaggio di test non riuscito.');
      }
    } catch {
      toast.error('Invio del messaggio di test non riuscito.');
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

      <Section title="Cartelle di download">
        <p className="text-xs text-muted-foreground">
          Scegli dove salvare i file. Monta le tue cartelle nel container (volume del compose) e
          selezionale qui con <strong>Sfoglia</strong>. Serie e film, SUB e DUB possono andare in
          cartelle diverse: se lasci vuoto un campo, eredita dalla cartella "Serie · SUB ITA".
        </p>
        {DIR_FIELDS.map((f) => (
          <Field key={f.key} label={f.label} hint={f.hint}>
            <FolderInput
              value={(draft[f.key] as string) ?? ''}
              placeholder={
                f.key === 'seriesPathSub' ? '/media/Anime' : '(eredita da Serie · SUB ITA)'
              }
              onChange={(path) => update(f.key, path as AppConfig[PathKey])}
            />
          </Field>
        ))}
        <Field label="Download simultanei" hint="Quanti episodi scaricare in parallelo (1-3).">
          <Select
            value={String(draft.maxConcurrent)}
            onValueChange={(v) => update('maxConcurrent', Number(v))}
          >
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[1, 2, 3].map((n) => (
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
          label="Notifiche Telegram"
          hint="Inoltra le notifiche al tuo bot Telegram. Configura token e chat id qui sotto."
        >
          <Select
            value={draft.notifyTelegram ? 'on' : 'off'}
            onValueChange={(v) => update('notifyTelegram', v === 'on')}
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
        <Field label="Bot Token" hint="Token del bot ottenuto da @BotFather.">
          <Input
            type="password"
            autoComplete="off"
            placeholder="123456:ABC-DEF…"
            value={draft.telegramBotToken}
            onChange={(e) => update('telegramBotToken', e.target.value)}
          />
        </Field>
        <Field
          label="Chat ID"
          hint="Id della chat dove ricevere i messaggi (es. con @userinfobot)."
        >
          <Input
            autoComplete="off"
            placeholder="123456789"
            value={draft.telegramChatId}
            onChange={(e) => update('telegramChatId', e.target.value)}
          />
        </Field>
        <Field label="Verifica" hint="Invia un messaggio di prova con i valori inseriti.">
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="outline"
              onClick={onTestTelegram}
              disabled={
                testTelegramMutation.isPending || !draft.telegramBotToken || !draft.telegramChatId
              }
            >
              <Send className="mr-2 h-4 w-4" />
              {testTelegramMutation.isPending ? 'Invio…' : 'Invia messaggio di test'}
            </Button>
            <a
              href="https://github.com/iCosiSenpai/animeunion#configurazione-notifiche-telegram"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm text-primary underline-offset-4 hover:underline"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Come si configura?
            </a>
          </div>
        </Field>
        <Field
          label="Provider futuri"
          hint="Web Push e Discord saranno disponibili in una prossima release."
        >
          <div className="flex flex-wrap gap-2">
            {['Web Push', 'Discord'].map((name) => (
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

      <Section title="Diagnostica">
        <Field
          label="Stato del sistema"
          hint="Download, cartelle, spazio disco, catalogo e connessione."
        >
          <Button variant="outline" onClick={() => router.push('/diagnostica')}>
            Apri diagnostica
          </Button>
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
        <div className="mx-auto flex max-w-3xl justify-end gap-2">
          {isDirty ? (
            <Button variant="ghost" onClick={() => setDraft(original)} disabled={saving}>
              Annulla modifiche
            </Button>
          ) : null}
          <Button onClick={onSave} disabled={saving || !isDirty}>
            {saving ? 'Salvataggio…' : 'Salva'}
          </Button>
        </div>
      </div>

      <Dialog open={showLeaveDialog} onOpenChange={setShowLeaveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modifiche non salvate</DialogTitle>
            <DialogDescription>
              Hai modificato alcune impostazioni. Vuoi salvarle prima di uscire?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={onStay} disabled={saving}>
              Rimani
            </Button>
            <Button variant="outline" onClick={onDiscard} disabled={saving}>
              Abbandona
            </Button>
            <Button onClick={onSaveAndContinue} disabled={saving}>
              {saving ? 'Salvataggio…' : 'Salva e continua'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
