'use client';

import { AccentPicker } from '@/components/settings/accent-picker';
import { WallpaperPicker } from '@/components/settings/wallpaper-picker';
import { Card } from '@/components/ui/card';
import { ACCENT_THEMES } from '@/lib/themes';
import { cn } from '@/lib/utils';
import type { ThemeAccent } from '@animeunion/shared';
import { Check, type LucideIcon, Monitor, Moon, Sparkles, Sun } from 'lucide-react';

function Group({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('space-y-3 rounded-xl border p-4', className)}>
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      {children}
    </div>
  );
}

type ThemeValue = 'light' | 'dark' | 'system';
type AppearanceVariant = 'settings' | 'setup';

const THEME_OPTIONS: { value: ThemeValue; label: string; icon: LucideIcon }[] = [
  { value: 'light', label: 'Chiaro', icon: Sun },
  { value: 'dark', label: 'Scuro', icon: Moon },
  { value: 'system', label: 'Sistema', icon: Monitor },
];

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
  variant = 'default',
}: {
  value: ThemeValue;
  onChange: (value: ThemeValue) => void;
  variant?: 'default' | 'compact';
}) {
  const compact = variant === 'compact';

  return (
    <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Tema">
      {THEME_OPTIONS.map((option) => {
        const active = option.value === value;
        const Icon = option.icon;
        return (
          <button
            key={option.value}
            type="button"
            // biome-ignore lint/a11y/useSemanticElements: custom styled radio card
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={cn(
              'group relative overflow-hidden rounded-lg border text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              active ? 'ring-2 ring-ring' : 'hover:border-foreground/30',
            )}
          >
            <span className="block aspect-video w-full overflow-hidden border-b">
              <ThemeMockup variant={option.value} />
            </span>
            <span
              className={cn(
                'flex items-center py-1.5 text-xs font-medium',
                compact ? 'justify-center px-1' : 'gap-1.5 px-2',
              )}
            >
              {!compact ? <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> : null}
              {option.label}
              {active && !compact ? (
                <Check className="ml-auto h-3.5 w-3.5 text-primary" aria-hidden="true" />
              ) : null}
            </span>
            {active && compact ? (
              <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-background/90 text-primary shadow-sm">
                <Check className="h-3 w-3" aria-hidden="true" />
              </span>
            ) : null}
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
  variant = 'settings',
}: {
  theme: ThemeValue;
  onThemeChange: (value: string) => void;
  accent: ThemeAccent;
  onAccentChange: (value: ThemeAccent) => void;
  backgroundUrl: string;
  onBackgroundChange: (url: string) => void;
  animationsEnabled: boolean;
  onAnimationsChange: (enabled: boolean) => void;
  variant?: AppearanceVariant;
}) {
  const accentTheme = ACCENT_THEMES[accent] ?? ACCENT_THEMES.green;
  const setup = variant === 'setup';

  return (
    <Card
      className={cn(
        setup
          ? 'grid gap-4 border-0 bg-transparent p-0 shadow-none md:grid-cols-2'
          : 'space-y-4 p-5',
      )}
    >
      <h2 className={cn('text-lg font-semibold', setup && 'sr-only')}>Aspetto</h2>

      <Group
        title="Tema"
        description="Chiaro, scuro o come il sistema. Si applica subito."
        className={cn(setup && 'min-w-0 bg-background/35')}
      >
        <ThemeCards
          value={theme}
          onChange={onThemeChange}
          variant={setup ? 'compact' : 'default'}
        />
      </Group>

      <Group
        title="Colore accent"
        description="Il colore principale dell'app. Si applica dopo il salvataggio."
        className={cn(setup && 'min-w-0 bg-background/35')}
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
        className={cn(setup && 'min-w-0 bg-background/35')}
      >
        <WallpaperPicker value={backgroundUrl} onChange={onBackgroundChange} />
      </Group>

      <Group
        title="Animazioni"
        description="Transizioni di pagina e micro-interazioni. Consumano un po' di GPU/CPU: su dispositivi lenti conviene disattivarle."
        className={cn(setup && 'min-w-0 bg-background/35')}
      >
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Animazioni">
          {[
            { on: true, label: 'Attive' },
            { on: false, label: 'Disattive' },
          ].map((option) => {
            const active = option.on === animationsEnabled;
            return (
              <button
                key={option.label}
                type="button"
                // biome-ignore lint/a11y/useSemanticElements: custom styled radio card
                role="radio"
                aria-checked={active}
                onClick={() => onAnimationsChange(option.on)}
                className={cn(
                  'flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  active ? 'ring-2 ring-ring' : 'hover:border-foreground/30',
                )}
              >
                <Sparkles className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                {option.label}
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
