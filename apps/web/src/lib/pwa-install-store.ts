import { create } from 'zustand';

// Evento beforeinstallprompt (non standard nei tipi DOM): minimo necessario.
export interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface PwaInstallState {
  deferred: InstallPromptEvent | null;
  setDeferred: (event: InstallPromptEvent | null) => void;
}

// Catturato globalmente da PwaRegister, consumato dal bottone "Installa app".
export const usePwaInstall = create<PwaInstallState>((set) => ({
  deferred: null,
  setDeferred: (deferred) => set({ deferred }),
}));
