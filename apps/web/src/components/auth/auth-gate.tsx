'use client';

import { trpc } from '@/lib/trpc';
import { Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { InitialSync } from './initial-sync';
import { LockScreen } from './lock-screen';
import { SetupScreen } from './setup-screen';
import { SetupWizard } from './setup-wizard';

function FullScreenSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}

export function AuthGate({ children }: { children: ReactNode }) {
  // Gate più esterno: blocco web UI con passcode (se attivo).
  const lockStatus = trpc.lock.status.useQuery(undefined, { retry: false });
  const locked = lockStatus.data ? lockStatus.data.enabled && !lockStatus.data.unlocked : false;

  const status = trpc.auth.status.useQuery(undefined, {
    retry: false,
    enabled: !!lockStatus.data && !locked,
  });
  const authenticated = status.data?.authenticated === true;
  // Solo dopo il login: serve sapere se le cartelle sono configurate (wizard).
  const configQuery = trpc.config.getAll.useQuery(undefined, { enabled: authenticated && !locked });

  if (lockStatus.isLoading) {
    return <FullScreenSpinner />;
  }

  if (locked) {
    return <LockScreen />;
  }

  if (status.isLoading) {
    return <FullScreenSpinner />;
  }

  if (!authenticated) {
    return <SetupScreen />;
  }

  if (configQuery.isLoading || !configQuery.data) {
    return <FullScreenSpinner />;
  }

  if (!configQuery.data.seriesPathSub) {
    return <SetupWizard />;
  }

  return (
    <>
      {children}
      <InitialSync />
    </>
  );
}
