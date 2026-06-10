export function Footer() {
  return (
    <footer className="border-t py-6">
      <div className="container flex flex-col items-center gap-1 text-center text-sm text-muted-foreground">
        <p>
          Powered by{' '}
          <a
            href="https://animeunion.tv"
            target="_blank"
            rel="noreferrer"
            className="font-medium underline-offset-4 hover:underline"
          >
            AnimeUnion
          </a>{' '}
          &mdash; Applicazione ufficiale affiliata.
        </p>
        <p>
          Sviluppata con &hearts; da{' '}
          <a
            href="https://github.com/iCosiSenpai/animeunion"
            target="_blank"
            rel="noreferrer"
            className="font-medium underline-offset-4 hover:underline"
          >
            iCosiSenpai
          </a>
        </p>
      </div>
    </footer>
  );
}
