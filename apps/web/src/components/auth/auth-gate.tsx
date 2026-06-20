'use client';

import { trpc } from '@/lib/trpc';
import { Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { InitialSync } from './initial-sync';
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
  const status = trpc.auth.status.useQuery(undefined, { retry: false });
  const authenticated = status.data?.authenticated === true;
  // Solo dopo il login: serve sapere se le cartelle sono configurate (wizard).
  const configQuery = trpc.config.getAll.useQuery(undefined, { enabled: authenticated });

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
