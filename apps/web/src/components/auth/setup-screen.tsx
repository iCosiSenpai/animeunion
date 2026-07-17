'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { trpc } from '@/lib/trpc';
import { type AuthLoginInput, authLoginInputSchema } from '@animeunion/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { Lock, Mail } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { SocialLogin } from './social-login';

export function SetupScreen() {
  const utils = trpc.useUtils();
  const login = trpc.auth.login.useMutation();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<AuthLoginInput>({ resolver: zodResolver(authLoginInputSchema) });

  const onSubmit = handleSubmit(async (values) => {
    try {
      await login.mutateAsync(values);
      toast.success('Benvenuto! Accesso effettuato.');
      await utils.auth.status.invalidate();
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (!message || /failed to fetch|networkerror|load failed/i.test(message)) {
        toast.error('Impossibile contattare il server. Verifica che il backend (API) sia avviato.');
      } else {
        toast.error(message);
      }
    }
  });

  const pending = isSubmitting || login.isPending;

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden p-4">
      {/* Sfondo premium: glow brand + sfumatura verso il fondo. */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-[-12%] h-[42rem] w-[42rem] -translate-x-1/2 rounded-full bg-primary/20 blur-[130px]" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/40 to-background" />
      </div>

      <div className="w-full max-w-md">
        <div className="rounded-2xl border border-border/60 bg-card/80 p-8 shadow-2xl backdrop-blur-sm">
          <div className="flex flex-col items-center gap-4 text-center">
            <img src="/logo.png" alt="AnimeUnion" className="h-16 w-auto drop-shadow" />
            <div className="space-y-1.5">
              <h1 className="text-2xl font-bold tracking-tight">AnimeUnion Docker</h1>
              <p className="text-sm text-muted-foreground">
                Accedi con il tuo account AnimeUnion. Dopo il login bastano due minuti per scegliere
                dove salvare i download e sei pronto.
              </p>
            </div>
          </div>

          <form onSubmit={onSubmit} className="mt-7 space-y-4">
            <div className="space-y-1.5">
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="email"
                  placeholder="Email"
                  autoComplete="username"
                  className="h-11 pl-10"
                  {...register('email')}
                />
              </div>
              {errors.email ? (
                <p className="text-xs text-destructive">Inserisci un'email valida.</p>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="password"
                  placeholder="Password"
                  autoComplete="current-password"
                  className="h-11 pl-10"
                  {...register('password')}
                />
              </div>
              {errors.password ? (
                <p className="text-xs text-destructive">La password è richiesta.</p>
              ) : null}
            </div>

            <Button
              type="submit"
              className="h-11 w-full text-base font-semibold"
              disabled={pending}
            >
              {pending ? 'Accesso in corso…' : 'Accedi'}
            </Button>
          </form>

          <div className="mt-6">
            <SocialLogin />
          </div>

          <p className="mt-7 text-center text-xs text-muted-foreground">
            Non hai un account?{' '}
            <a
              href="https://animeunion.tv/registrati"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-foreground underline underline-offset-4 transition-colors hover:text-primary"
            >
              Registrati su animeunion.tv
            </a>
          </p>
        </div>

        <p className="mt-5 text-center text-xs text-muted-foreground">
          Applicazione ufficiale affiliata ad AnimeUnion.
        </p>
      </div>
    </div>
  );
}
