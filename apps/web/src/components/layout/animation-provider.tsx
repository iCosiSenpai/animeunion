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
  const config = trpc.config.getAll.useQuery(undefined, { staleTime: 60_000 });
  const enabled = config.data?.animationsEnabled ?? true;

  return (
    <AnimationsContext.Provider value={enabled}>
      {/* reducedMotion 'always' = framer riduce il movimento; combinato col gate dei componenti
          (useAnimationsOn) disattiva del tutto. 'user' rispetta l'impostazione del sistema. */}
      <MotionConfig reducedMotion={enabled ? 'user' : 'always'}>{children}</MotionConfig>
    </AnimationsContext.Provider>
  );
}
