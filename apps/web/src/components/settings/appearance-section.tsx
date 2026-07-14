'use client';

import { AccentPicker } from '@/components/settings/accent-picker';
import { WallpaperPicker } from '@/components/settings/wallpaper-picker';
import { Card } from '@/components/ui/card';
import { ACCENT_THEMES } from '@/lib/themes';
import { cn } from '@/lib/utils';
import type { ThemeAccent } from '@animeunion/shared';
import { Check, type LucideIcon, Monitor, Moon, Sparkles, Sun } from 'lucide-react';

// Card di gruppo dentro Aspetto: titolo + descrizione + contenuto. Sostituisce la griglia
// label/hint stretta dei vecchi Field per far respirare le anteprime.
function Group({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3 rounded-xl border p-4">
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      {children}
    </div>
  );
}

type ThemeValue = 'light' | 'dark' | 'system';

const THEME_OPTIONS: { value: ThemeValue; label: string; icon: LucideIcon }[] = [
  { value: 'light', label: 'Chiaro', icon: Sun },
  { value: 'dark', label: 'Scuro', icon: Moon },
  { value: 'system', label: 'Sistema', icon: Monitor },
];

// Mini-mockup di una schermata dell'app nei colori del tema: barra "sidebar" + righe contenuto.
// `variant` sceglie la palette; 'system' e' meta' chiaro / meta' scuro (diagonale).
function ThemeMockup({ variant }: { variant: ThemeValue }) {
  const light = (
    <div className="flex h-full w-full bg-[#f4f4f5]">
      <div className="h-full w-1/4 bg-[#e4e4e7]" />
      <div className="flex-1 space-y-1 p-1.5">
        <div className="h-1.5 w-3/4 rounded bg-[#d4d4d8]" />
        <div className="h-1.5 w-1/2 rounded bg-[#d4d4d8]" />
      </div>
    </div>
  );
  const dark = (
    <div className="flex h-full w-full bg-[#18181b]">
      <div className="h-full w-1/4 bg-[#27272a]" />
      <div className="flex-1 space-y-1 p-1.5">
        <div className="h-1.5 w-3/4 rounded bg-[#3f3f46]" />
        <div className="h-1.5 w-1/2 rounded bg-[#3f3f46]" />
      </div>
    </div>
  );
  if (variant === 'light') return light;
  if (variant === 'dark') return dark;
  return (
    <div className="relative h-full w-full">
      {light}
      <div
        className="absolute inset-0"
        style={{ clipPath: 'polygon(100% 0, 100% 100%, 0 100%)' }}
        aria-hidden="true"
      >
        {dark}
      </div>
    </div>
  );
}

function ThemeCards({
  value,
  onChange,
}: {
  value: ThemeValue;
  onChange: (value: ThemeValue) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Tema">
      {THEME_OPTIONS.map((opt) => {
        const active = opt.value === value;
        const Icon = opt.icon;
        return (
          <button
            key={opt.value}
            type="button"
            // biome-ignore lint/a11y/useSemanticElements: custom styled radio card
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              'group relative overflow-hidden rounded-lg border text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              active ? 'ring-2 ring-ring' : 'hover:border-foreground/30',
            )}
          >
            <span className="block aspect-video w-full overflow-hidden border-b">
              <ThemeMockup variant={opt.value} />
            </span>
            <span className="flex items-center gap-1.5 px-2 py-1.5 text-xs font-medium">
              <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {opt.label}
              {active ? (
                <Check className="ml-auto h-3.5 w-3.5 text-primary" aria-hidden="true" />
              ) : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function AppearanceSection({
  theme,
  onThemeChange,
  accent,
  onAccentChange,
  backgroundUrl,
  onBackgroundChange,
  animationsEnabled,
  onAnimationsChange,
}: {
  theme: ThemeValue;
  onThemeChange: (value: string) => void;
  accent: ThemeAccent;
  onAccentChange: (value: ThemeAccent) => void;
  backgroundUrl: string;
  onBackgroundChange: (url: string) => void;
  animationsEnabled: boolean;
  onAnimationsChange: (enabled: boolean) => void;
}) {
  const accentTheme = ACCENT_THEMES[accent] ?? ACCENT_THEMES.green;
  return (
    <Card className="space-y-4 p-5">
      <h2 className="text-lg font-semibold">Aspetto</h2>

      <Group title="Tema" description="Chiaro, scuro o come il sistema. Si applica subito.">
        <ThemeCards value={theme} onChange={onThemeChange} />
      </Group>

      <Group
        title="Colore accent"
        description="Il colore principale dell'app. Si applica dopo il salvataggio."
      >
        <div className="flex flex-wrap items-center gap-3">
          <AccentPicker value={accent} onChange={onAccentChange} />
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium"
            style={{
              backgroundColor: `hsl(${accentTheme.primary})`,
              color: `hsl(${accentTheme.primaryForeground})`,
            }}
          >
            {accentTheme.label}
          </span>
        </div>
      </Group>

      <Group
        title="Sfondo"
        description="Un wallpaper anime soffuso su tutta l'app (SFW, via wallhaven). Si applica dopo il salvataggio."
      >
        <WallpaperPicker value={backgroundUrl} onChange={onBackgroundChange} />
      </Group>

      <Group
        title="Animazioni"
        description="Transizioni di pagina e micro-interazioni. Consumano un po' di GPU/CPU: su dispositivi lenti conviene disattivarle."
      >
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Animazioni">
          {[
            { on: true, label: 'Attive' },
            { on: false, label: 'Disattive' },
          ].map((opt) => {
            const active = opt.on === animationsEnabled;
            return (
              <button
                key={opt.label}
                type="button"
                // biome-ignore lint/a11y/useSemanticElements: custom styled radio card
                role="radio"
                aria-checked={active}
                onClick={() => onAnimationsChange(opt.on)}
                className={cn(
                  'flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  active ? 'ring-2 ring-ring' : 'hover:border-foreground/30',
                )}
              >
                <Sparkles className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                {opt.label}
                {active ? (
                  <Check className="ml-auto h-4 w-4 text-primary" aria-hidden="true" />
                ) : null}
              </button>
            );
          })}
        </div>
      </Group>
    </Card>
  );
}
