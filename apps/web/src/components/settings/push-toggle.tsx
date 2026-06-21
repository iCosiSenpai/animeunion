'use client';

import { Button } from '@/components/ui/button';
import { getSubscription, isPushSupported, subscribePush } from '@/lib/push';
import { trpc } from '@/lib/trpc';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

export function PushToggle() {
  const utils = trpc.useUtils();
  const subscribe = trpc.push.subscribe.useMutation();
  const unsubscribe = trpc.push.unsubscribe.useMutation();
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

  if (supported === null) {
    return null;
  }
  if (!supported) {
    return (
      <p className="text-xs text-muted-foreground">
        Richiede HTTPS (contesto sicuro) e un browser compatibile. Vedi la guida nel README.
      </p>
    );
  }
  return subscribed ? (
    <Button variant="outline" onClick={disable} disabled={busy}>
      Disattiva push
    </Button>
  ) : (
    <Button onClick={enable} disabled={busy}>
      Attiva push
    </Button>
  );
}
