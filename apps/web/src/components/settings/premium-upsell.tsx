'use client';

import { Button } from '@/components/ui/button';
import {
  ArrowUpRight,
  CalendarDays,
  Crown,
  MessageCircle,
  Palette,
  ScanSearch,
  Sparkles,
  Users,
} from 'lucide-react';

export const PREMIUM_URL = 'https://animeunion.tv/premium';

// Vetrina aderente ai vantaggi pubblicati da AnimeUnion. Alcuni vivono sul sito, altri sono
// integrati nell'app: la descrizione lo dichiara senza promettere feature prive di contratto API.
const PERKS = [
  {
    icon: Sparkles,
    title: 'Download neurale XQ/XQ+',
    desc: 'Nell’app Docker, per i piani autorizzati dal flag neuralExport.',
  },
  {
    icon: MessageCircle,
    title: 'Assistenza prioritaria su Telegram',
    desc: 'Vantaggio Premium ufficiale; il contatto dedicato sarà mostrato quando AnimeUnion lo esporrà.',
  },
  {
    icon: CalendarDays,
    title: 'Calendario sincronizzato',
    desc: 'Link ICS personale disponibile sul sito AnimeUnion.',
  },
  {
    icon: Users,
    title: 'Watch Together',
    desc: 'Stanze con capienza e funzioni che dipendono dal piano.',
  },
  {
    icon: ScanSearch,
    title: 'Ricerca per immagine',
    desc: 'Quote maggiori sul sito in base al piano Premium.',
  },
  {
    icon: Palette,
    title: 'Temi esclusivi',
    desc: 'Personalizzazioni Premium disponibili sul sito.',
  },
];

export function PremiumUpsell() {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-primary/30 bg-primary/5 p-5">
        <div className="flex items-center gap-2">
          <Crown className="h-5 w-5 text-primary" aria-hidden="true" />
          <h2 className="text-lg font-semibold">AnimeUnion Premium</h2>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Sostieni AnimeUnion e sblocca funzioni extra nell’app. Tutto quello che usi ora resta
          gratuito.
        </p>
        <Button asChild className="mt-4 gap-1.5">
          <a href={PREMIUM_URL} target="_blank" rel="noopener noreferrer">
            Scopri Premium <ArrowUpRight className="h-4 w-4" />
          </a>
        </Button>
      </div>

      <ul className="grid gap-3 sm:grid-cols-2">
        {PERKS.map((perk) => {
          const Icon = perk.icon;
          return (
            <li key={perk.title} className="flex gap-3 rounded-lg border p-3">
              <Icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
              <div className="min-w-0">
                <p className="text-sm font-medium">{perk.title}</p>
                <p className="text-xs text-muted-foreground">{perk.desc}</p>
              </div>
            </li>
          );
        })}
      </ul>

      <p className="text-xs text-muted-foreground">
        Lo stato Premium viene letto dal tuo account AnimeUnion. La disponibilità varia per piano; i
        vantaggi indicati come funzioni del sito non sono ancora integrati nell’app Docker.
      </p>
    </div>
  );
}
