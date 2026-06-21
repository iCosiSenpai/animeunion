export interface NavLink {
  href: string;
  label: string;
  /** Voce principale: mostrata nel dock mobile. Le altre finiscono nel drawer "Altro". */
  primary?: boolean;
}

export const navLinks: NavLink[] = [
  { href: '/', label: 'Home', primary: true },
  { href: '/catalog', label: 'Catalogo', primary: true },
  { href: '/follows', label: 'Seguiti', primary: true },
  { href: '/library', label: 'Libreria', primary: true },
  { href: '/calendar', label: 'Calendario' },
  { href: '/settings', label: 'Impostazioni' },
  { href: '/statistiche', label: 'Statistiche' },
  { href: '/about', label: 'About' },
];

export const primaryNavLinks: NavLink[] = navLinks.filter((l) => l.primary);
export const secondaryNavLinks: NavLink[] = navLinks.filter((l) => !l.primary);
