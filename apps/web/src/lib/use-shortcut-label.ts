'use client';

import { useEffect, useState } from 'react';

/**
 * Etichetta della scorciatoia dipendente dalla piattaforma: `⌘K` su macOS/iOS, `Ctrl K`
 * altrove (Windows/Linux). Il rilevamento avviene dopo il mount per non causare hydration
 * mismatch: server e primo render client mostrano sempre `Ctrl K`, poi su Mac diventa `⌘K`.
 */
export function useShortcutLabel(key: string): string {
  const [isMac, setIsMac] = useState(false);
  useEffect(() => {
    const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
    const platform = nav.userAgentData?.platform ?? navigator.platform ?? navigator.userAgent;
    setIsMac(/mac|iphone|ipad|ipod/i.test(platform));
  }, []);
  return isMac ? `⌘${key}` : `Ctrl ${key}`;
}
