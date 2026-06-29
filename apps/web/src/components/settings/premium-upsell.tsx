'use client';

import { Button } from '@/components/ui/button';
import {
  ArrowUpRight,
  BarChart3,
  Cloud,
  Crown,
  Heart,
  Layers,
  Palette,
  Sparkles,
  Zap,
} from 'lucide-react';

export const PREMIUM_URL = 'https://animeunion.tv/premium';

// Vetrina (upsell): le funzioni Premium proposte. Nessun gating reale qui — tutto ciò che l'app
// fa oggi resta gratuito; il collegamento all'account del sito è futuro (con l'admin).
const PERKS = [
  {
    icon: Layers,
    title: 'Download simultanei',
    desc: 'Scarica 2–3 episodi in parallelo invece di uno alla volta.',
  },
  { icon: Zap, title: 'Priorità di coda', desc: 'I tuoi download passano avanti agli altri.' },
  {
    icon: Cloud,
    title: 'Backup su cloud',
    desc: 'Le tue copie al sicuro anche fuori dal NAS.',
  },
  {
    icon: Heart,
    title: 'Seguiti illimitati',
    desc: 'Nessun limite alle serie che puoi seguire.',
  },
  {
    icon: Sparkles,
    title: 'SUB+DUB e qualità massima',
    desc: 'Entrambe le lingue e la migliore qualità, in automatico.',
  },
  {
    icon: Palette,
    title: 'Temi e wallpaper esclusivi',
    desc: 'Personalizzazioni riservate ai sostenitori.',
  },
  {
    icon: BarChart3,
    title: 'Statistiche avanzate',
    desc: 'Più dettagli sulla tua libreria e cronologia.',
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
        Le funzioni Premium arriveranno nell’app. Il collegamento con il tuo account del sito è in
        arrivo.
      </p>
    </div>
  );
}
