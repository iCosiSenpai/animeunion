'use client';

import { useEffect, useState } from 'react';

/**
 * Restituisce una versione "ritardata" di `value`: si aggiorna solo dopo che `value` è rimasto
 * stabile per `delayMs`. Utile per non scatenare una query a ogni tasto nella ricerca (debounce).
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}
