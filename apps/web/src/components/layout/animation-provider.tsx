'use client';

import { trpc } from '@/lib/trpc';
import { MotionConfig } from 'framer-motion';
import { type ReactNode, createContext, useContext } from 'react';

// True se le animazioni sono attive (config) — i componenti lo usano per renderizzare
// versioni statiche quando off. Default true finche' la config non e' caricata.
const AnimationsContext = createContext(true);

export function useAnimationsOn(): boolean {
  return useContext(AnimationsContext);
}

export function AnimationProvider({ children }: { children: ReactNode }) {
  const config = trpc.config.getAll.useQuery(undefined, { staleTime: 10_000 });
  const enabled = config.data?.animationsEnabled ?? true;

  return (
    <AnimationsContext.Provider value={enabled}>
      {/* L'interruttore in-app e' la fonte di verita': ON => 'never' (framer non riduce mai, le
          animazioni si vedono anche con "Riduci movimento" di iOS attivo); OFF => 'always' (framer
          riduce e i componenti gated via useAnimationsOn rendono la versione statica: doppio spegnimento). */}
      <MotionConfig reducedMotion={enabled ? 'never' : 'always'}>{children}</MotionConfig>
    </AnimationsContext.Provider>
  );
}
