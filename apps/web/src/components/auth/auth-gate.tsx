'use client';

import { trpc } from '@/lib/trpc';
import { Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { InitialSync } from './initial-sync';
import { SetupScreen } from './setup-screen';

export function AuthGate({ children }: { children: ReactNode }) {
  const status = trpc.auth.status.useQuery(undefined, { retry: false });

  if (status.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!status.data?.authenticated) {
    return <SetupScreen />;
  }

  return (
    <>
      {children}
      <InitialSync />
    </>
  );
}
