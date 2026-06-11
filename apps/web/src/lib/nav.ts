export interface NavLink {
  href: string;
  label: string;
}

export const navLinks: NavLink[] = [
  { href: '/', label: 'Home' },
  { href: '/catalog', label: 'Catalogo' },
  { href: '/follows', label: 'Seguiti' },
  { href: '/library', label: 'Libreria' },
  { href: '/downloads', label: 'Download' },
  { href: '/calendar', label: 'Calendario' },
  { href: '/settings', label: 'Impostazioni' },
  { href: '/about', label: 'About' },
];
