import { cn } from '@/lib/utils';
import type { Language } from '@animeunion/shared';
import { Captions, Volume2 } from 'lucide-react';

// Bandiere come SVG inline: le emoji bandiera non si rendono come bandiere su Windows.
function ItalyFlag() {
  return (
    <svg viewBox="0 0 3 2" className="h-3 w-[1.125rem] rounded-[1px]" aria-hidden="true">
      <rect width="1" height="2" x="0" fill="#009246" />
      <rect width="1" height="2" x="1" fill="#ffffff" />
      <rect width="1" height="2" x="2" fill="#ce2b37" />
    </svg>
  );
}

function JapanFlag() {
  return (
    <svg viewBox="0 0 3 2" className="h-3 w-[1.125rem] rounded-[1px]" aria-hidden="true">
      <rect width="3" height="2" fill="#ffffff" />
      <circle cx="1.5" cy="1" r="0.6" fill="#bc002d" />
    </svg>
  );
}

const PILL =
  'inline-flex items-center gap-1 rounded-md bg-black/70 px-1.5 py-0.5 text-white shadow-sm';

/**
 * Indicatore lingua come sul sito ufficiale:
 * - DUB ITA: bandiera italiana + altoparlante (audio italiano).
 * - SUB ITA: bandiera giapponese + altoparlante e bandiera italiana + sottotitoli
 *   (audio giapponese, sottotitoli italiani).
 */
export function LanguageBadge({
  language,
  className,
}: {
  language: Language;
  className?: string;
}) {
  if (language === 'DUB_ITA') {
    return (
      <span
        className={cn(PILL, className)}
        title="Audio italiano (DUB ITA)"
        aria-label="Doppiaggio italiano"
      >
        <ItalyFlag />
        <Volume2 className="h-3 w-3" />
      </span>
    );
  }
  return (
    <span
      className={cn(PILL, 'gap-1.5', className)}
      title="Audio giapponese, sottotitoli italiani (SUB ITA)"
      aria-label="Sottotitoli italiani"
    >
      <span className="inline-flex items-center gap-0.5">
        <JapanFlag />
        <Volume2 className="h-3 w-3" />
      </span>
      <span className="inline-flex items-center gap-0.5">
        <ItalyFlag />
        <Captions className="h-3 w-3" />
      </span>
    </span>
  );
}
