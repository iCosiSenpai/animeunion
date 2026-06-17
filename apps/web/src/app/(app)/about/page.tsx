import { Separator } from '@/components/ui/separator';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'About — AnimeUnion Docker',
};

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">AnimeUnion Docker</h1>
        <p className="text-muted-foreground">
          Applicazione ufficiale affiliata ad AnimeUnion per il download self-hosted degli anime. Un
          &quot;Radarr/Sonarr italiano per gli anime&quot;: segui una serie e ogni nuovo episodio
          viene scaricato e organizzato automaticamente per Plex/Jellyfin.
        </p>
      </div>

      <Separator />

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Disclaimer legale</h2>
        <p className="text-sm text-muted-foreground">
          Questa applicazione e uno strumento di automazione personale. Non ospita ne distribuisce
          alcun contenuto: tutti i contenuti, i marchi e i diritti appartengono ai rispettivi
          proprietari. L&apos;utente e responsabile dell&apos;uso che ne fa, nel rispetto delle
          leggi vigenti e dei termini di servizio di AnimeUnion.
        </p>
      </section>

      <Separator />

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Crediti</h2>
        <ul className="space-y-1 text-sm text-muted-foreground">
          <li>
            Sviluppata da{' '}
            <a
              href="https://github.com/iCosiSenpai"
              target="_blank"
              rel="noreferrer"
              className="font-medium text-foreground underline-offset-4 hover:underline"
            >
              iCosiSenpai
            </a>
          </li>
          <li>
            API e catalogo forniti da{' '}
            <a
              href="https://animeunion.tv"
              target="_blank"
              rel="noreferrer"
              className="font-medium text-foreground underline-offset-4 hover:underline"
            >
              AnimeUnion
            </a>
          </li>
        </ul>
      </section>

      <Separator />

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Progetto</h2>
        <ul className="space-y-1 text-sm text-muted-foreground">
          <li>
            Codice sorgente:{' '}
            <a
              href="https://github.com/iCosiSenpai/animeunion"
              target="_blank"
              rel="noreferrer"
              className="font-medium text-foreground underline-offset-4 hover:underline"
            >
              github.com/iCosiSenpai/animeunion
            </a>
          </li>
          <li>Licenza: AGPL-3.0</li>
        </ul>
      </section>
    </div>
  );
}
