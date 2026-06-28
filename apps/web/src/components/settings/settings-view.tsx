'use client';

import { AccentPicker } from '@/components/settings/accent-picker';
import { FolderInput } from '@/components/settings/folder-picker';
import { HomeLayoutSection } from '@/components/settings/home-layout-section';
import { InstallButton } from '@/components/settings/install-button';
import { PushToggle } from '@/components/settings/push-toggle';
import { RequestsSection } from '@/components/settings/requests-section';
import { SecuritySection } from '@/components/settings/security-section';
import { WallpaperPicker } from '@/components/settings/wallpaper-picker';
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
import { PageHeader } from '@/components/ui/page-header';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { trpc } from '@/lib/trpc';
import { cn } from '@/lib/utils';
import { type AppConfig, SECRET_MASK } from '@animeunion/shared';
import {
  Bell,
  CalendarClock,
  Compass,
  ExternalLink,
  FolderDown,
  Languages,
  LayoutGrid,
  Lock,
  type LucideIcon,
  Palette,
  Send,
  Server,
  Shield,
  SlidersHorizontal,
  Webhook,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import { useRouter, useSearchParams } from 'next/navigation';
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

function Section({
  id,
  title,
  hidden,
  children,
}: {
  id?: string;
  title: string;
  hidden?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Card id={id} className={cn('space-y-4 p-5', hidden && 'hidden')}>
      <h2 className="text-lg font-semibold">{title}</h2>
      <Separator />
      <div className="space-y-4">{children}</div>
    </Card>
  );
}

type SectionId =
  | 'download'
  | 'pianificazione'
  | 'catalogo'
  | 'lingua'
  | 'notifiche'
  | 'aspetto'
  | 'home'
  | 'sicurezza'
  | 'integrazioni'
  | 'avanzate';

const SECTIONS: { id: SectionId; label: string; icon: LucideIcon }[] = [
  { id: 'download', label: 'Download', icon: FolderDown },
  { id: 'pianificazione', label: 'Pianificazione', icon: CalendarClock },
  { id: 'catalogo', label: 'Catalogo', icon: Compass },
  { id: 'lingua', label: 'Lingua', icon: Languages },
  { id: 'notifiche', label: 'Notifiche', icon: Bell },
  { id: 'aspetto', label: 'Aspetto', icon: Palette },
  { id: 'home', label: 'Home', icon: LayoutGrid },
  { id: 'sicurezza', label: 'Sicurezza', icon: Shield },
  { id: 'integrazioni', label: 'Integrazioni', icon: Webhook },
  { id: 'avanzate', label: 'Avanzate', icon: SlidersHorizontal },
];

const SECTION_IDS = new Set<string>(SECTIONS.map((s) => s.id));
function isSectionId(value: string | null): value is SectionId {
  return value != null && SECTION_IDS.has(value);
}

function SectionNavButton({
  section,
  active,
  onSelect,
  className,
}: {
  section: { id: SectionId; label: string; icon: LucideIcon };
  active: SectionId;
  onSelect: (id: SectionId) => void;
  className?: string;
}) {
  const Icon = section.icon;
  const isOn = active === section.id;
  return (
    <button
      type="button"
      onClick={() => onSelect(section.id)}
      aria-current={isOn ? 'page' : undefined}
      className={cn(
        'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        isOn
          ? 'bg-accent font-medium text-foreground'
          : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
        className,
      )}
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="whitespace-nowrap">{section.label}</span>
    </button>
  );
}

export function SettingsView() {
  const utils = trpc.useUtils();
  const router = useRouter();
  const searchParams = useSearchParams();
  const configQuery = trpc.config.getAll.useQuery();
  const setMutation = trpc.config.set.useMutation();
  const syncMutation = trpc.catalog.sync.useMutation();
  const testTelegramMutation = trpc.notifications.testTelegram.useMutation();
  const testJellyfinMutation = trpc.jellyfin.testConnection.useMutation();
  const { theme, setTheme } = useTheme();

  // Sezione iniziale da deep-link (`/settings?section=notifiche`, usato dalla palette).
  const sectionParam = searchParams.get('section');
  const [draft, setDraft] = useState<AppConfig | null>(null);
  const [active, setActive] = useState<SectionId>(() =>
    isSectionId(sectionParam) ? sectionParam : 'download',
  );

  // Aggiorna la sezione anche quando il deep-link cambia mentre siamo già su /settings
  // (sola direzione URL → stato: il click sul rail non riscrive l'URL, niente loop).
  useEffect(() => {
    if (isSectionId(sectionParam)) {
      setActive(sectionParam);
    }
  }, [sectionParam]);
  const [saving, setSaving] = useState(false);
  const [showLeaveDialog, setShowLeaveDialog] = useState(false);
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [importing, setImporting] = useState(false);

  // Inizializza il form quando arriva la config dal backend.
  useEffect(() => {
    if (configQuery.data && !draft) {
      setDraft(configQuery.data);
    }
  }, [configQuery.data, draft]);

  const original = configQuery.data ?? null;
  const dirtyKeys = useMemo(() => {
    if (!draft || !original) return [];
    // homeLayout (array) è gestito dal pannello standalone HomeLayoutSection con un proprio
    // salvataggio: escluso dal draft globale (il confronto qui è per riferimento, valido solo
    // sui primitivi) per non far scattare la barra "Modifiche non salvate" né riscriverlo.
    return (Object.keys(draft) as (keyof AppConfig)[]).filter(
      (key) => key !== 'homeLayout' && draft[key] !== original[key],
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
        href.startsWith('tel:') ||
        href.startsWith('blob:') ||
        anchor.hasAttribute('download')
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
      // Refetch + reset del draft (come onImport): cosi' draft === original anche per i campi che il
      // server normalizza/maschera (segreti -> ••••••••), altrimenti il banner "Modifiche non salvate"
      // resterebbe acceso per sempre sul confronto draft[key] !== original[key].
      const fresh = await utils.config.getAll.fetch();
      setDraft(fresh);
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

  const onExport = () => {
    if (!original) return;
    // original arriva già con i segreti mascherati: il token non finisce nel file.
    const blob = new Blob([JSON.stringify(original, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'animeunion-config.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const onImport = async () => {
    if (!original) return;
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(importText) as Record<string, unknown>;
    } catch {
      toast.error('JSON non valido.');
      return;
    }
    setImporting(true);
    try {
      let applied = 0;
      for (const key of Object.keys(original) as (keyof AppConfig)[]) {
        if (!(key in parsed)) continue;
        const value = parsed[key];
        // Non reimportare i segreti mascherati (manterrebbero il placeholder).
        if (value === SECRET_MASK) continue;
        await setMutation.mutateAsync({ key, value });
        applied += 1;
      }
      const fresh = await utils.config.getAll.fetch();
      setDraft(fresh);
      toast.success(`Configurazione importata (${applied} campi).`);
      setImportOpen(false);
      setImportText('');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Import non riuscito.');
    } finally {
      setImporting(false);
    }
  };

  const onTestTelegram = async () => {
    try {
      const res = await testTelegramMutation.mutateAsync({
        // Mascherato e non modificato ⇒ undefined: il server usa il token salvato.
        botToken: draft.telegramBotToken === SECRET_MASK ? undefined : draft.telegramBotToken,
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

  const onTestJellyfin = async () => {
    try {
      const res = await testJellyfinMutation.mutateAsync({
        serverUrl: draft.jellyfinServerUrl,
        // Mascherata e non modificata ⇒ undefined: il server usa la chiave salvata.
        apiKey: draft.jellyfinApiKey === SECRET_MASK ? undefined : draft.jellyfinApiKey,
      });
      if (res.ok) {
        toast.success(
          `Connesso a ${res.serverName ?? 'Jellyfin'}${res.version ? ` (v${res.version})` : ''}.`,
        );
      } else {
        toast.error(res.error ?? 'Connessione a Jellyfin non riuscita.');
      }
    } catch {
      toast.error('Connessione a Jellyfin non riuscita.');
    }
  };

  return (
    <div
      className={cn(
        'mx-auto max-w-5xl',
        // Riserva spazio in fondo solo quando la barra di salvataggio è visibile, così su
        // mobile la barra non copre l'ultima sezione e il footer resta raggiungibile.
        isDirty ? 'pb-44 md:pb-28' : 'pb-12 md:pb-8',
      )}
    >
      <PageHeader
        eyebrow="Configurazione"
        title="Impostazioni"
        description="Download, pianificazione, libreria, notifiche e aspetto dell'app."
      />

      {/* Navigazione sezioni: pillole scrollabili su mobile */}
      <div className="mb-5 flex gap-2 overflow-x-auto pb-1 lg:hidden">
        {SECTIONS.map((s) => (
          <SectionNavButton
            key={s.id}
            section={s}
            active={active}
            onSelect={setActive}
            className="shrink-0"
          />
        ))}
      </div>

      <div className="lg:grid lg:grid-cols-[200px_1fr] lg:gap-8">
        {/* Rail verticale su desktop */}
        <nav className="hidden lg:block">
          <div className="sticky top-20 space-y-1">
            {SECTIONS.map((s) => (
              <SectionNavButton
                key={s.id}
                section={s}
                active={active}
                onSelect={setActive}
                className="w-full"
              />
            ))}
          </div>
        </nav>

        <div className="space-y-6">
          <Section id="download" hidden={active !== 'download'} title="Cartelle di download">
            <p className="text-xs text-muted-foreground">
              Scegli dove salvare i file. Monta le tue cartelle nel container (volume del compose) e
              selezionale qui con <strong>Sfoglia</strong>. Serie e film, SUB e DUB possono andare
              in cartelle diverse: se lasci vuoto un campo, eredita dalla cartella "Serie · SUB
              ITA".
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
            <Field
              label="Download simultanei"
              hint="Download simultaneo non disponibile per ora — in arrivo con il Premium."
            >
              <div className="inline-flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                <Lock className="h-4 w-4" aria-hidden="true" />
                <span>1 alla volta</span>
                <span className="ml-1 rounded-full border border-primary/40 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">
                  Premium
                </span>
              </div>
            </Field>
          </Section>

          <Section id="pianificazione" hidden={active !== 'pianificazione'} title="Pianificazione">
            <Field
              label="Auto-download"
              hint="Scarica i nuovi episodi (da quando inizi a seguire in poi) dei seguiti «In corso». Non tocca gli episodi già presenti su disco."
            >
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

          <Section id="catalogo" hidden={active !== 'catalogo'} title="Catalogo">
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
            <Field
              label="Sincronizzazione manuale"
              hint="Forza subito un aggiornamento del catalogo."
            >
              <Button variant="outline" onClick={onSyncNow} disabled={syncMutation.isPending}>
                {syncMutation.isPending ? 'Avvio…' : 'Sincronizza ora'}
              </Button>
            </Field>
          </Section>

          <Section id="lingua" hidden={active !== 'lingua'} title="Lingua">
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

          <Section id="notifiche" hidden={active !== 'notifiche'} title="Notifiche">
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
              label="Prova notifica in-app"
              hint="Mostra un toast di prova per verificare la posizione (utile su iPhone/PWA)."
            >
              <Button
                variant="outline"
                onClick={() =>
                  toast.success('Notifica di prova', {
                    description: 'Se la vedi qui, i toast in-app funzionano.',
                  })
                }
              >
                <Bell className="mr-2 h-4 w-4" />
                Mostra toast di prova
              </Button>
            </Field>
            <Field
              label="Nuove stagioni"
              hint="Avvisa quando una serie che segui ottiene una nuova stagione o contenuto correlato."
            >
              <Select
                value={draft.notifyNewSeasons ? 'on' : 'off'}
                onValueChange={(v) => update('notifyNewSeasons', v === 'on')}
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
              <div className="space-y-1.5">
                <Input
                  type="password"
                  autoComplete="off"
                  placeholder={
                    original?.telegramBotToken === SECRET_MASK
                      ? 'Configurato — digita per sostituirlo'
                      : '123456:ABC-DEF…'
                  }
                  value={draft.telegramBotToken === SECRET_MASK ? '' : draft.telegramBotToken}
                  onChange={(e) => update('telegramBotToken', e.target.value)}
                />
                {original?.telegramBotToken === SECRET_MASK &&
                draft.telegramBotToken === SECRET_MASK ? (
                  <p className="text-xs text-muted-foreground">
                    Token configurato (mascherato). Lascia vuoto per mantenerlo, digita per
                    sostituirlo o{' '}
                    <button
                      type="button"
                      className="text-primary underline-offset-4 hover:underline"
                      onClick={() => update('telegramBotToken', '')}
                    >
                      rimuovilo
                    </button>
                    .
                  </p>
                ) : null}
              </div>
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
                    testTelegramMutation.isPending ||
                    !draft.telegramBotToken ||
                    !draft.telegramChatId
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
              label="Notifiche push"
              hint="Notifiche del browser (anche ad app chiusa). Richiede HTTPS — vedi la guida nel README."
            >
              <PushToggle />
            </Field>
            <Field
              label="App installabile"
              hint="Installa AnimeUnion come app (PWA). Richiede HTTPS."
            >
              <InstallButton />
            </Field>
            <Field label="Provider futuri" hint="Discord sarà disponibile in una prossima release.">
              <div className="flex flex-wrap gap-2">
                <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs text-muted-foreground">
                  Discord
                </span>
              </div>
            </Field>
          </Section>

          <Section id="avanzate" hidden={active !== 'avanzate'} title="Diagnostica">
            <Field
              label="Stato del sistema"
              hint="Download, cartelle, spazio disco, catalogo e connessione."
            >
              <Button variant="outline" onClick={() => router.push('/diagnostica')}>
                Apri diagnostica
              </Button>
            </Field>
          </Section>

          <Section id="aspetto" hidden={active !== 'aspetto'} title="Aspetto">
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
            <Field
              label="Colore accent"
              hint="Il colore principale dell'app. Si applica dopo il salvataggio."
            >
              <AccentPicker value={draft.themeAccent} onChange={(v) => update('themeAccent', v)} />
            </Field>
            <Field
              label="Sfondo"
              hint="Un wallpaper anime soffuso su tutta l'app (SFW, via wallhaven)."
            >
              <WallpaperPicker
                value={draft.themeBackgroundUrl}
                onChange={(url) => update('themeBackgroundUrl', url)}
              />
            </Field>
            <Field
              label="Animazioni"
              hint="Transizioni di pagina e micro-interazioni dell'interfaccia. Consumano un po' di GPU/CPU: su dispositivi lenti conviene disattivarle."
            >
              <Select
                value={draft.animationsEnabled ? 'on' : 'off'}
                onValueChange={(v) => update('animationsEnabled', v === 'on')}
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

          <Section id="avanzate" hidden={active !== 'avanzate'} title="Backup configurazione">
            <Field
              label="Esporta"
              hint="Scarica un file JSON con le tue impostazioni (i token non sono inclusi)."
            >
              <Button variant="outline" onClick={onExport}>
                Esporta configurazione
              </Button>
            </Field>
            <Field label="Importa" hint="Ripristina le impostazioni da un file esportato.">
              <Button variant="outline" onClick={() => setImportOpen(true)}>
                Importa configurazione
              </Button>
            </Field>
          </Section>

          <div className={cn(active !== 'home' && 'hidden')}>
            <HomeLayoutSection />
          </div>

          <div className={cn(active !== 'sicurezza' && 'hidden')}>
            <SecuritySection />
          </div>

          <Section id="integrazioni" hidden={active !== 'integrazioni'} title="Jellyfin / Plex">
            <Field
              label="Sidecar NFO + artwork"
              hint="Scrive metadati .nfo e poster/fanart accanto ai video: i media server (Jellyfin/Plex/Kodi/Emby) mostrano i dati corretti. Funziona anche senza server configurato."
            >
              <Select
                value={draft.writeNfo ? 'on' : 'off'}
                onValueChange={(v) => update('writeNfo', v === 'on')}
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
              label="URL del server Jellyfin"
              hint="Es. http://192.168.1.10:8096 (o l'indirizzo Tailscale/HTTPS). Lascia vuoto per non usare il refresh automatico."
            >
              <Input
                autoComplete="off"
                placeholder="http://…:8096"
                value={draft.jellyfinServerUrl}
                onChange={(e) => update('jellyfinServerUrl', e.target.value)}
              />
            </Field>
            <Field label="API key" hint="Jellyfin → Pannello di controllo → Avanzate → Chiavi API.">
              <div className="space-y-1.5">
                <Input
                  type="password"
                  autoComplete="off"
                  placeholder={
                    original?.jellyfinApiKey === SECRET_MASK
                      ? 'Configurata — digita per sostituirla'
                      : 'incolla la chiave'
                  }
                  value={draft.jellyfinApiKey === SECRET_MASK ? '' : draft.jellyfinApiKey}
                  onChange={(e) => update('jellyfinApiKey', e.target.value)}
                />
                {original?.jellyfinApiKey === SECRET_MASK &&
                draft.jellyfinApiKey === SECRET_MASK ? (
                  <p className="text-xs text-muted-foreground">
                    Chiave configurata (mascherata). Lascia vuoto per mantenerla, digita per
                    sostituirla o{' '}
                    <button
                      type="button"
                      className="text-primary underline-offset-4 hover:underline"
                      onClick={() => update('jellyfinApiKey', '')}
                    >
                      rimuovila
                    </button>
                    .
                  </p>
                ) : null}
              </div>
            </Field>
            <Field
              label="Refresh automatico"
              hint="A fine download chiede a Jellyfin di scansionare la libreria (best-effort, con debounce)."
            >
              <Select
                value={draft.jellyfinAutoRefresh ? 'on' : 'off'}
                onValueChange={(v) => update('jellyfinAutoRefresh', v === 'on')}
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
            <Field label="Verifica" hint="Prova la connessione con i valori inseriti.">
              <Button
                variant="outline"
                onClick={onTestJellyfin}
                disabled={
                  testJellyfinMutation.isPending ||
                  !draft.jellyfinServerUrl ||
                  !draft.jellyfinApiKey
                }
              >
                <Server className="mr-2 h-4 w-4" />
                {testJellyfinMutation.isPending ? 'Verifica…' : 'Prova connessione'}
              </Button>
            </Field>
          </Section>

          <div className={cn(active !== 'integrazioni' && 'hidden')}>
            <RequestsSection />
          </div>
        </div>
      </div>

      {isDirty ? (
        <div className="fixed inset-x-0 bottom-dock-safe z-30 border-t bg-background/95 p-4 backdrop-blur md:bottom-0">
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-2 md:pl-16">
            <p className="text-sm text-muted-foreground">Modifiche non salvate</p>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setDraft(original)} disabled={saving}>
                Annulla
              </Button>
              <Button onClick={onSave} disabled={saving}>
                {saving ? 'Salvataggio…' : 'Salva'}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

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

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Importa configurazione</DialogTitle>
            <DialogDescription>Incolla il contenuto del file JSON esportato.</DialogDescription>
          </DialogHeader>
          <textarea
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder='{ "themeAccent": "blue", "language": "SUB_ITA" }'
            className="h-40 w-full resize-none rounded-md border bg-muted/40 p-2 font-mono text-xs"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setImportOpen(false)} disabled={importing}>
              Annulla
            </Button>
            <Button onClick={onImport} disabled={importing || !importText.trim()}>
              {importing ? 'Importo…' : 'Importa'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
