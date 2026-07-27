'use client';

import { useEffect, useState } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

/**
 * `true` se il sistema operativo chiede di ridurre il movimento.
 *
 * Nota: NON sostituisce `useAnimationsOn()`. L'interruttore in-app resta la fonte di verità per
 * le transizioni framer (vedi `AnimationProvider`); questo hook serve ai contenuti che si muovono
 * *da soli* senza input dell'utente — es. la rotazione automatica dell'hero — dove la preferenza
 * di sistema va rispettata come default (WCAG 2.2.2).
 *
 * SSR-safe: durante il render sul server (e al primo render client) vale `false`, poi si allinea.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }
    const mql = window.matchMedia(QUERY);
    setReduced(mql.matches);
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return reduced;
}
