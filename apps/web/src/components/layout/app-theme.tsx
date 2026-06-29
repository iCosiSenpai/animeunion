'use client';

import { ACCENT_THEMES } from '@/lib/themes';
import { trpc } from '@/lib/trpc';
import { useEffect } from 'react';

// Applica il tema (accent + sfondo) leggendo la config. Montato in alto (Providers)
// cosi' vale su login, wizard e app.
export function AppTheme() {
  const config = trpc.config.getAll.useQuery(undefined, { staleTime: 60_000 });
  const accent = config.data?.themeAccent ?? 'green';
  const backgroundUrl = config.data?.themeBackgroundUrl ?? '';

  // Accent: override delle CSS var su <html> (vince su :root/.dark).
  useEffect(() => {
    const theme = ACCENT_THEMES[accent] ?? ACCENT_THEMES.green;
    const root = document.documentElement;
    root.style.setProperty('--primary', theme.primary);
    root.style.setProperty('--ring', theme.primary);
    root.style.setProperty('--primary-foreground', theme.primaryForeground);
  }, [accent]);

  // Sfondo: classe su <html> (rende il body trasparente, vedi globals.css).
  useEffect(() => {
    const root = document.documentElement;
    if (backgroundUrl) {
      root.style.setProperty('--theme-bg-image', `url(${backgroundUrl})`);
    } else {
      root.style.removeProperty('--theme-bg-image');
    }
    root.classList.toggle('theme-has-bg', Boolean(backgroundUrl));
    return () => {
      root.classList.remove('theme-has-bg');
      root.style.removeProperty('--theme-bg-image');
    };
  }, [backgroundUrl]);

  if (!backgroundUrl) {
    return null;
  }
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10">
      <div className="absolute inset-0 bg-[image:var(--theme-bg-image)] bg-cover bg-center" />
      {/* Velo theme-aware: su tema chiaro --background e' quasi bianco, all'80% slaverebbe il
          wallpaper; su scuro resta denso. Le card usano --card opaco -> il testo resta leggibile. */}
      <div className="absolute inset-0 bg-background/55 backdrop-blur-sm dark:bg-background/80" />
    </div>
  );
}
