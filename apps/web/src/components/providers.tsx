'use client';

import { AnimationProvider } from '@/components/layout/animation-provider';
import { AppTheme } from '@/components/layout/app-theme';
import { PwaRegister } from '@/components/layout/pwa-register';
import { Toaster } from '@/components/ui/sonner';
import { getSessionToken } from '@/lib/session';
import { trpc } from '@/lib/trpc';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpLink } from '@trpc/client';
import { ThemeProvider } from 'next-themes';
import { type ReactNode, useState } from 'react';

function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        retry: 1,
      },
    },
  });
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(makeQueryClient);
  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        httpLink({
          url: '/trpc',
          headers() {
            const token = getSessionToken();
            return token ? { 'x-app-session': token } : {};
          },
        }),
      ],
    }),
  );

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <trpc.Provider client={trpcClient} queryClient={queryClient}>
        <QueryClientProvider client={queryClient}>
          <AppTheme />
          <PwaRegister />
          <AnimationProvider>{children}</AnimationProvider>
          <Toaster richColors position="top-center" offset="16px" />
        </QueryClientProvider>
      </trpc.Provider>
    </ThemeProvider>
  );
}
