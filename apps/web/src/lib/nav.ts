export type NavGroup = 'operazioni' | 'scoperta' | 'sistema';

export interface NavLink {
  href: string;
  label: string;
  /** Gruppo nella sidebar console (Operazioni / Scoperta / Sistema). */
  group: NavGroup;
  /** Voce principale: mostrata nel dock mobile. Le altre finiscono nel drawer "Altro". */
  primary?: boolean;
}

export const navLinks: NavLink[] = [
  { href: '/', label: 'Dashboard', group: 'operazioni', primary: true },
  { href: '/downloads', label: 'Download', group: 'operazioni', primary: true },
  { href: '/library', label: 'Libreria', group: 'operazioni', primary: true },
  { href: '/scopri', label: 'Scopri', group: 'scoperta' },
  { href: '/catalog', label: 'Catalogo', group: 'scoperta', primary: true },
  { href: '/follows', label: 'Seguiti', group: 'scoperta' },
  { href: '/calendar', label: 'Calendario', group: 'scoperta' },
  { href: '/premium', label: 'Premium', group: 'sistema' },
  { href: '/settings', label: 'Impostazioni', group: 'sistema' },
  { href: '/statistiche', label: 'Statistiche', group: 'sistema' },
  { href: '/diagnostica', label: 'Diagnostica', group: 'sistema' },
  { href: '/about', label: 'About', group: 'sistema' },
];

/** Gruppi ordinati con etichetta, per la sidebar console. */
export const NAV_GROUPS: { id: NavGroup; label: string }[] = [
  { id: 'operazioni', label: 'Operazioni' },
  { id: 'scoperta', label: 'Scoperta' },
  { id: 'sistema', label: 'Sistema' },
];

export const primaryNavLinks: NavLink[] = navLinks.filter((l) => l.primary);
export const secondaryNavLinks: NavLink[] = navLinks.filter((l) => !l.primary);
