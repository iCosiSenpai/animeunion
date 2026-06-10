'use client';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { trpc } from '@/lib/trpc';
import { type AuthLoginInput, authLoginInputSchema } from '@animeunion/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

export function SetupScreen() {
  const utils = trpc.useUtils();
  const login = trpc.auth.login.useMutation();
  const sync = trpc.catalog.sync.useMutation();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<AuthLoginInput>({ resolver: zodResolver(authLoginInputSchema) });

  const onSubmit = handleSubmit(async (values) => {
    try {
      await login.mutateAsync(values);
      toast.success('Benvenuto! Accesso effettuato.');
      const status = await utils.catalog.syncStatus.fetch();
      if (!status.lastSyncedAt) {
        sync.mutate();
        toast.message('Sincronizzazione del catalogo avviata in background.');
      }
      await utils.auth.status.invalidate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Accesso fallito');
    }
  });

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md space-y-5 p-6">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-bold tracking-tight">Benvenuto su AnimeUnion Docker</h1>
          <p className="text-sm text-muted-foreground">
            Applicazione ufficiale affiliata. Accedi con il tuo account AnimeUnion per iniziare.
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-3">
          <div className="space-y-1">
            <Input
              type="email"
              placeholder="Email"
              autoComplete="username"
              {...register('email')}
            />
            {errors.email ? (
              <p className="text-xs text-destructive">Inserisci un'email valida.</p>
            ) : null}
          </div>
          <div className="space-y-1">
            <Input
              type="password"
              placeholder="Password"
              autoComplete="current-password"
              {...register('password')}
            />
            {errors.password ? (
              <p className="text-xs text-destructive">La password e richiesta.</p>
            ) : null}
          </div>
          <Button type="submit" className="w-full" disabled={isSubmitting || login.isPending}>
            {isSubmitting || login.isPending ? 'Accesso in corso...' : 'Accedi'}
          </Button>
        </form>

        <p className="text-center text-xs text-muted-foreground">
          Non hai un account?{' '}
          <a
            href="https://animeunion.tv/registrati"
            target="_blank"
            rel="noreferrer"
            className="font-medium underline underline-offset-4"
          >
            Registrati su animeunion.tv
          </a>
        </p>
      </Card>
    </div>
  );
}
