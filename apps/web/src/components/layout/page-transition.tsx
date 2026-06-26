'use client';

import { useAnimationsOn } from '@/components/layout/animation-provider';
import { motion } from 'framer-motion';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

// Entrata (fade + slide) sul cambio di route. Off ⇒ passthrough.
// In App Router l'exit di AnimatePresence e' inaffidabile e puo' ritardare il contenuto: usiamo un
// singolo motion.div keyed su pathname, che rimonta a ogni navigazione e fa ripartire l'entrata.
export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const on = useAnimationsOn();

  if (!on) {
    return <>{children}</>;
  }

  return (
    <motion.div
      key={pathname}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  );
}
