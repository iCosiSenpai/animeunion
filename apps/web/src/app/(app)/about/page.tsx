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
          Applicazione ufficiale affiliata ad AnimeUnion per il download self-hosted degli anime. La
          tua libreria anime, sempre aggiornata: segui una serie e ogni nuovo episodio viene
          scaricato e organizzato automaticamente per Plex/Jellyfin.
        </p>
      </div>

      <Separator />

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Perché AnimeUnion Docker</h2>
        <p className="text-sm text-muted-foreground">
          L&apos;idea è semplice: la tua libreria anime sempre aggiornata, senza pensieri. Segui una
          serie e ogni nuovo episodio viene scaricato (uno alla volta), rinominato e ordinato per
          Jellyfin/Plex. È self-hosted, gira in casa tua su Docker ed è pensata per un singolo
          utente.
        </p>
        <ul className="ml-4 list-disc space-y-1 text-sm text-muted-foreground">
          <li>
            <span className="text-foreground">Integrazione ufficiale</span> con AnimeUnion via API:
            niente scraping, niente scorciatoie.
          </li>
          <li>
            <span className="text-foreground">Organizzazione automatica</span> in cartelle
            stagione/film pronte per il tuo media server.
          </li>
          <li>
            <span className="text-foreground">Tutto in locale</span>: i file restano sul tuo disco,
            sotto il tuo controllo.
          </li>
        </ul>
        <p className="text-sm text-muted-foreground">
          Per saperne di più sul progetto AnimeUnion:{' '}
          <a
            href="https://animeunion.tv/perche-animeunion"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            perché AnimeUnion
          </a>
          .
        </p>
      </section>

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
        <h2 className="text-xl font-semibold">Privacy e cookie</h2>
        <p className="text-sm text-muted-foreground">
          Questa app è self-hosted e <span className="text-foreground">non raccoglie</span> cookie
          di tracciamento, analytics o telemetria: nessun dato d&apos;uso lascia il tuo server. Le
          credenziali restano in locale e il login serve solo a parlare con le API di AnimeUnion.
        </p>
        <p className="text-sm text-muted-foreground">
          Cookie, profilazione e privacy dei contenuti del catalogo sono gestiti da{' '}
          <span className="text-foreground">AnimeUnion</span> quando l&apos;app accede al loro
          servizio. Per i dettagli consulta l&apos;informativa ufficiale:{' '}
          <a
            href="https://animeunion.tv/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            privacy di AnimeUnion
          </a>
          .
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
              rel="noopener noreferrer"
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
              rel="noopener noreferrer"
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
              rel="noopener noreferrer"
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
