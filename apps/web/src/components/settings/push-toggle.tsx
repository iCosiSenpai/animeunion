'use client';

import { Button } from '@/components/ui/button';
import { getSubscription, isPushSupported, subscribePush } from '@/lib/push';
import { trpc } from '@/lib/trpc';
import { ExternalLink, HelpCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

export function PushToggle() {
  const utils = trpc.useUtils();
  const subscribe = trpc.push.subscribe.useMutation();
  const unsubscribe = trpc.push.unsubscribe.useMutation();
  const sendTest = trpc.push.test.useMutation();
  const [supported, setSupported] = useState<boolean | null>(null);
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const ok = isPushSupported();
    setSupported(ok);
    if (ok) {
      void getSubscription().then((s) => setSubscribed(Boolean(s)));
    }
  }, []);

  async function enable() {
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        toast.error('Permesso notifiche negato dal browser.');
        return;
      }
      const { publicKey } = await utils.push.publicKey.fetch();
      const sub = await subscribePush(publicKey);
      const json = sub?.toJSON();
      if (!json?.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
        toast.error('Sottoscrizione non riuscita.');
        return;
      }
      await subscribe.mutateAsync({
        endpoint: json.endpoint,
        keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
      });
      setSubscribed(true);
      toast.success('Notifiche push attivate.');
    } catch {
      toast.error('Attivazione non riuscita.');
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const sub = await getSubscription();
      if (sub) {
        await unsubscribe.mutateAsync({ endpoint: sub.endpoint });
        await sub.unsubscribe();
      }
      setSubscribed(false);
      toast.success('Notifiche push disattivate.');
    } catch {
      toast.error('Operazione non riuscita.');
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    try {
      const res = await sendTest.mutateAsync();
      if (!res.ok) {
        toast.info('Nessun dispositivo iscritto: attiva prima le notifiche push.');
        return;
      }
      toast.success(
        res.sent === 1
          ? 'Notifica di prova inviata a 1 dispositivo.'
          : `Notifica di prova inviata a ${res.sent} dispositivi.`,
      );
    } catch {
      toast.error('Invio di prova non riuscito.');
    }
  }

  if (supported === null) {
    return null;
  }
  if (!supported) {
    return (
      <div className="space-y-2 rounded-md border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground">
        <p className="flex items-center gap-1.5 font-medium text-foreground">
          <HelpCircle className="h-4 w-4 text-primary" aria-hidden="true" />
          Perché le notifiche richiedono HTTPS?
        </p>
        <p>
          Le notifiche del browser (e l'installazione come app) funzionano solo su un indirizzo
          sicuro <strong>HTTPS</strong>, oppure su <code>localhost</code>. È una regola del browser,
          non dell'app.
        </p>
        <p>
          La via più semplice è <strong>Tailscale</strong>: ti dà un indirizzo HTTPS valido in
          automatico, senza certificati da gestire.
        </p>
        <a
          href="https://github.com/iCosiSenpai/animeunion#https-app-installabile-pwa-e-notifiche-push"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
        >
          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          Apri la guida
        </a>
      </div>
    );
  }
  return subscribed ? (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" onClick={disable} disabled={busy}>
        Disattiva push
      </Button>
      <Button variant="secondary" onClick={test} disabled={busy || sendTest.isPending}>
        {sendTest.isPending ? 'Invio…' : 'Invia notifica di test'}
      </Button>
    </div>
  ) : (
    <Button onClick={enable} disabled={busy}>
      Attiva push
    </Button>
  );
}
