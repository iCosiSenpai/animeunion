import type { ThemeAccent } from '@animeunion/shared';

export interface AccentTheme {
  label: string;
  /** Colore di anteprima per lo swatch nel selettore. */
  swatch: string;
  /** Valori HSL (formato shadcn) applicati a --primary/--ring. */
  primary: string;
  /** Colore del testo su sfondo accent. */
  primaryForeground: string;
}

// Palette curata: tonalita' che funzionano sull'UI scura con il foreground indicato.
// 'green' = valori attuali di globals.css (default storico AnimeUnion).
export const ACCENT_THEMES: Record<ThemeAccent, AccentTheme> = {
  green: {
    label: 'Verde',
    swatch: '#6EC567',
    primary: '110 45% 59%',
    primaryForeground: '0 0% 7%',
  },
  blue: { label: 'Blu', swatch: '#3B9EFF', primary: '210 90% 60%', primaryForeground: '0 0% 100%' },
  purple: {
    label: 'Viola',
    swatch: '#A56BFF',
    primary: '265 85% 66%',
    primaryForeground: '0 0% 100%',
  },
  pink: {
    label: 'Rosa',
    swatch: '#F0529C',
    primary: '330 80% 62%',
    primaryForeground: '0 0% 100%',
  },
  orange: {
    label: 'Arancione',
    swatch: '#F5832B',
    primary: '28 90% 55%',
    primaryForeground: '0 0% 100%',
  },
  red: { label: 'Rosso', swatch: '#EB5757', primary: '0 75% 60%', primaryForeground: '0 0% 100%' },
  teal: {
    label: 'Teal',
    swatch: '#2BC4B6',
    primary: '174 65% 47%',
    primaryForeground: '0 0% 100%',
  },
};

export const ACCENT_KEYS = Object.keys(ACCENT_THEMES) as ThemeAccent[];
