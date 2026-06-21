'use client';

import { registerServiceWorker } from '@/lib/push';
import { type InstallPromptEvent, usePwaInstall } from '@/lib/pwa-install-store';
import { useEffect } from 'react';

// Registra il service worker (solo in contesto sicuro) e cattura il prompt di installazione.
export function PwaRegister() {
  const setDeferred = usePwaInstall((s) => s.setDeferred);

  useEffect(() => {
    void registerServiceWorker();

    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setDeferred(event as InstallPromptEvent);
    };
    const onInstalled = () => setDeferred(null);

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, [setDeferred]);

  return null;
}
