import { AuthGate } from '@/components/auth/auth-gate';
import { AppMain } from '@/components/layout/app-main';
import { CommandPalette } from '@/components/layout/command-palette';
import { Footer } from '@/components/layout/footer';
import { KeyboardShortcuts } from '@/components/layout/keyboard-shortcuts';
import { Navbar } from '@/components/layout/navbar';
import { PageTransition } from '@/components/layout/page-transition';
import { SetupBanner } from '@/components/layout/setup-banner';
import { Sidebar } from '@/components/layout/sidebar';
import type { ReactNode } from 'react';

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGate>
      <div className="flex min-h-screen overflow-x-hidden">
        <Sidebar />
        <AppMain>
          <Navbar />
          <SetupBanner />
          <main className="container flex-1 py-6 pb-8 md:pb-6">
            <PageTransition>{children}</PageTransition>
          </main>
          <Footer />
        </AppMain>
      </div>
      <CommandPalette />
      <KeyboardShortcuts />
    </AuthGate>
  );
}
