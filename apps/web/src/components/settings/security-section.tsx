'use client';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { clearSessionToken, setSessionToken } from '@/lib/session';
import { trpc } from '@/lib/trpc';
import { useState } from 'react';
import { toast } from 'sonner';

export function SecuritySection() {
  const utils = trpc.useUtils();
  const lockStatus = trpc.lock.status.useQuery();
  const enabled = lockStatus.data?.enabled === true;

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');

  const setPasscode = trpc.lock.setPasscode.useMutation();
  const disable = trpc.lock.disable.useMutation();
  const pending = setPasscode.isPending || disable.isPending;

  const reset = () => {
    setCurrent('');
    setNext('');
    setConfirm('');
  };
  const refresh = () => void utils.lock.status.invalidate();

  const mismatch = next.length > 0 && confirm.length > 0 && next !== confirm;
  const canSubmit = next.length >= 4 && next === confirm && (!enabled || current.length > 0);

  async function onSubmit() {
    try {
      const res = await setPasscode.mutateAsync({ next, current: enabled ? current : undefined });
      setSessionToken(res.token);
      reset();
      refresh();
      toast.success(enabled ? 'Passcode aggiornato.' : 'Passcode impostato.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Operazione non riuscita.');
    }
  }

  async function onDisable() {
    try {
      await disable.mutateAsync({ current });
      clearSessionToken();
      reset();
      refresh();
      toast.success('Blocco disattivato.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Operazione non riuscita.');
    }
  }

  return (
    <Card className="space-y-4 p-5">
      <div>
        <h2 className="text-lg font-semibold">Sicurezza</h2>
        <p className="text-xs text-muted-foreground">
          {enabled
            ? 'Blocco con passcode attivo: la web UI lo richiede per accedere.'
            : 'Proteggi l’accesso alla web UI con un passcode (opzionale).'}
        </p>
      </div>
      <Separator />
      <div className="max-w-sm space-y-3">
        {enabled ? (
          <Input
            type="password"
            placeholder="Passcode attuale"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
          />
        ) : null}
        <Input
          type="password"
          placeholder={enabled ? 'Nuovo passcode (min 4)' : 'Passcode (min 4)'}
          autoComplete="new-password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
        />
        <Input
          type="password"
          placeholder="Conferma passcode"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
        {mismatch ? <p className="text-xs text-destructive">I passcode non coincidono.</p> : null}
        <div className="flex flex-wrap gap-2">
          <Button onClick={onSubmit} disabled={pending || !canSubmit}>
            {enabled ? 'Aggiorna passcode' : 'Imposta passcode'}
          </Button>
          {enabled ? (
            <Button
              variant="outline"
              onClick={onDisable}
              disabled={pending || current.length === 0}
            >
              Disattiva blocco
            </Button>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
