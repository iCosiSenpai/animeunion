import { z } from 'zod';

// Colori accent disponibili (palette curata). Le tonalita' HSL vere stanno nel frontend
// (lib/themes.ts); qui solo le chiavi, validate e condivise con la config.
export const themeAccentSchema = z.enum([
  'green',
  'blue',
  'purple',
  'pink',
  'orange',
  'red',
  'teal',
]);
export type ThemeAccent = z.infer<typeof themeAccentSchema>;

// Un wallpaper restituito dal proxy wallhaven (sfondo del tema).
export const wallpaperSchema = z.object({
  id: z.string(),
  thumbUrl: z.string(),
  fullUrl: z.string(),
  resolution: z.string(),
  pageUrl: z.string(),
});
export type Wallpaper = z.infer<typeof wallpaperSchema>;
