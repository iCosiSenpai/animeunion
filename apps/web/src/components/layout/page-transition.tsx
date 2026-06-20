'use client';

import { useAnimationsOn } from '@/components/layout/animation-provider';
import { AnimatePresence, motion } from 'framer-motion';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

// Transizione morbida (fade + slide) sul cambio di route. Off ⇒ passthrough.
export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const on = useAnimationsOn();

  if (!on) {
    return <>{children}</>;
  }

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={pathname}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
