'use client';

import { ACCENT_KEYS, ACCENT_THEMES } from '@/lib/themes';
import { cn } from '@/lib/utils';
import type { ThemeAccent } from '@animeunion/shared';
import { Check } from 'lucide-react';

export function AccentPicker({
  value,
  onChange,
}: {
  value: ThemeAccent;
  onChange: (value: ThemeAccent) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Colore accento">
      {ACCENT_KEYS.map((key) => {
        const theme = ACCENT_THEMES[key];
        const active = key === value;
        return (
          <button
            key={key}
            type="button"
            // biome-ignore lint/a11y/useSemanticElements: custom styled radio button
            role="radio"
            onClick={() => onChange(key)}
            title={theme.label}
            aria-label={theme.label}
            aria-checked={active}
            className={cn(
              'flex h-9 w-9 items-center justify-center rounded-full ring-offset-2 ring-offset-background transition-transform',
              active ? 'ring-2 ring-ring' : 'hover:scale-110',
            )}
            style={{ backgroundColor: theme.swatch }}
          >
            {active ? <Check className="h-4 w-4 text-white drop-shadow" /> : null}
          </button>
        );
      })}
    </div>
  );
}
