'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { setSessionToken } from '@/lib/session';
import { trpc } from '@/lib/trpc';
import { Loader2, Lock } from 'lucide-react';
import { type FormEvent, useEffect, useRef, useState } from 'react';

export function LockScreen() {
  const utils = trpc.useUtils();
  const inputRef = useRef<HTMLInputElement>(null);
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState(false);
  const unlock = trpc.lock.unlock.useMutation();

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(false);
    try {
      const res = await unlock.mutateAsync({ passcode });
      if (res.ok && res.token) {
        setSessionToken(res.token);
        await utils.invalidate();
      } else {
        setError(true);
      }
    } catch {
      setError(true);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden p-4">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-[-12%] h-[42rem] w-[42rem] -translate-x-1/2 rounded-full bg-primary/20 blur-[130px]" />
      </div>
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm space-y-5 rounded-2xl border border-border/60 bg-card/80 p-8 text-center shadow-2xl backdrop-blur-sm"
      >
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Lock className="h-7 w-7" />
        </div>
        <div className="space-y-1">
          <h1 className="text-xl font-bold tracking-tight">App bloccata</h1>
          <p className="text-sm text-muted-foreground">Inserisci il passcode per continuare.</p>
        </div>
        <Input
          ref={inputRef}
          type="password"
          autoComplete="current-password"
          placeholder="Passcode"
          value={passcode}
          onChange={(e) => setPasscode(e.target.value)}
          className="text-center"
        />
        {error ? <p className="text-sm text-destructive">Passcode errato.</p> : null}
        <Button type="submit" className="w-full" disabled={unlock.isPending || !passcode}>
          {unlock.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Sblocca
        </Button>
      </form>
    </div>
  );
}
