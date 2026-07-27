import { HomeView } from '@/components/home/home-view';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Scopri · AnimeUnion',
};

// Superficie "discovery": hero in evidenza + caroselli (ultimi episodi, continua a guardare, in
// onda oggi, stagione in corso, più votati, ultimi aggiunti, news). Vive su una route dedicata
// perché "/" è il centro di controllo (DashboardView): sono due usi diversi: operare vs esplorare.
// L'ordine e la visibilità delle sezioni arrivano da config.homeLayout (Impostazioni → Scopri).
export default function ScopriPage() {
  return <HomeView />;
}
