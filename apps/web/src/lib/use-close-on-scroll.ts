import { useEffect, useRef } from 'react';

/**
 * Su mobile chiude un overlay (popover/menu) quando la pagina scorre: aprire un popup e poi
 * scrollare la pagina deve chiuderlo, come ci si aspetta su telefono.
 *
 * Ascolta lo scroll del documento su `window` in fase di bubbling: lo scroll interno di eventuali
 * ScrollArea dentro il popover NON raggiunge `window` (gli eventi scroll non fanno bubbling),
 * quindi scorrere DENTRO il popup non lo chiude — solo lo scroll della pagina sottostante.
 *
 * Nessun effetto su desktop (>= md): li' il popover si riposiziona con lo scroll, comportamento
 * atteso. Il controllo del media query e' fatto allo scatto dell'evento (non all'aggancio) cosi'
 * resta corretto anche ruotando lo schermo.
 */
export function useCloseOnScroll(open: boolean, onClose: () => void): void {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) {
      return;
    }
    const handler = () => {
      if (window.matchMedia('(max-width: 767px)').matches) {
        onCloseRef.current();
      }
    };
    window.addEventListener('scroll', handler, { passive: true });
    return () => window.removeEventListener('scroll', handler);
  }, [open]);
}
