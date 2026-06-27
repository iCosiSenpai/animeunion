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

// Input di ricerca wallpaper. Semantico: il FE non conosce la codifica wallhaven
// (categorie/purity in bit), che resta confinata in lib/wallhaven.ts.
// `sketchy` aggiunge il purity "sketchy" (artistico) alla ricerca SFW; categoria sempre Anime.
export const wallpaperSearchInputSchema = z.object({
  query: z.string().optional(),
  sketchy: z.boolean().optional(),
});
export type WallpaperSearchInput = z.infer<typeof wallpaperSearchInputSchema>;
