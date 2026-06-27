import type { HomeSectionId, HomeSectionPref } from '@animeunion/shared';
import {
  Calendar,
  Clock,
  type LucideIcon,
  Newspaper,
  Play,
  Sparkles,
  TrendingUp,
} from 'lucide-react';

// Registro canonico delle sezioni della home, nell'ordine di default. Gli id sono vincolati dal
// contratto shared (`homeSectionIdSchema`); label e icona vivono qui (UI). Aggiungere una sezione =
// aggiungere l'id all'enum shared + una voce qui + il nodo render in `home-view.tsx`.
export const HOME_SECTIONS: { id: HomeSectionId; label: string; icon: LucideIcon }[] = [
  { id: 'hero', label: 'Hero in evidenza', icon: Sparkles },
  { id: 'latestEpisodes', label: 'Ultimi episodi', icon: Play },
  { id: 'continueWatching', label: 'Continua a guardare', icon: Clock },
  { id: 'onAirToday', label: 'In onda oggi', icon: Calendar },
  { id: 'currentSeason', label: 'Stagione in corso', icon: Calendar },
  { id: 'topRated', label: 'Più votati', icon: TrendingUp },
  { id: 'recentlyAdded', label: 'Ultimi aggiunti', icon: Clock },
  { id: 'news', label: 'News', icon: Newspaper },
];

const REGISTRY_IDS = new Set<HomeSectionId>(HOME_SECTIONS.map((s) => s.id));

// Fonde le preferenze salvate col registro (forward-compat): prima le voci salvate ancora esistenti
// nell'ordine scelto dall'utente, poi appende le sezioni nuove (non ancora salvate) come visibili.
// Una saved `[]` produce così l'ordine di default con tutte le sezioni visibili.
export function resolveHomeOrder(saved: HomeSectionPref[]): HomeSectionPref[] {
  const seen = new Set<HomeSectionId>();
  const result: HomeSectionPref[] = [];
  for (const pref of saved) {
    if (REGISTRY_IDS.has(pref.id) && !seen.has(pref.id)) {
      result.push({ id: pref.id, visible: pref.visible });
      seen.add(pref.id);
    }
  }
  for (const section of HOME_SECTIONS) {
    if (!seen.has(section.id)) {
      result.push({ id: section.id, visible: true });
    }
  }
  return result;
}
