'use client';

import { Separator } from '@/components/ui/separator';
import { buildIssueUrl, feedbackIssueUrl } from '@/lib/github';
import { trpc } from '@/lib/trpc';
import { Stethoscope } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';

// Stile coerente per i link testuali del footer (affordance chiara: colore + underline in hover).
const TEXT_LINK =
  'font-medium text-foreground/80 underline-offset-4 transition-colors hover:text-primary hover:underline';

interface Social {
  label: string;
  href: string;
  /** Colore brand applicato in hover/focus. */
  hover: string;
  path: string;
}

// Path SVG dei brand (da simple-icons): lucide non ha icone social.
const SOCIALS: Social[] = [
  {
    label: 'Telegram',
    href: 'https://t.me/aniuniontv',
    hover: 'hover:text-[#229ED9] focus-visible:text-[#229ED9]',
    path: 'M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.464.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z',
  },
  {
    label: 'Instagram',
    href: 'https://www.instagram.com/animeunion.tv/',
    hover: 'hover:text-[#E4405F] focus-visible:text-[#E4405F]',
    path: 'M12 0C8.74 0 8.333.015 7.053.072 5.775.132 4.905.333 4.14.63c-.789.306-1.459.717-2.126 1.384S.935 3.35.63 4.14C.333 4.905.131 5.775.072 7.053.012 8.333 0 8.74 0 12s.015 3.667.072 4.947c.06 1.277.261 2.148.558 2.913.306.788.717 1.459 1.384 2.126.667.666 1.336 1.079 2.126 1.384.766.296 1.636.499 2.913.558C8.333 23.988 8.74 24 12 24s3.667-.015 4.947-.072c1.277-.06 2.148-.262 2.913-.558.788-.306 1.459-.718 2.126-1.384.666-.667 1.079-1.335 1.384-2.126.296-.765.499-1.636.558-2.913.06-1.28.072-1.687.072-4.947s-.015-3.667-.072-4.947c-.06-1.277-.262-2.149-.558-2.913-.306-.789-.718-1.459-1.384-2.126C21.319 1.347 20.651.935 19.86.63c-.765-.297-1.636-.499-2.913-.558C15.667.012 15.26 0 12 0zm0 2.16c3.203 0 3.585.016 4.85.071 1.17.055 1.805.249 2.227.415.562.217.96.477 1.382.896.419.42.679.819.896 1.381.164.422.36 1.057.413 2.227.057 1.266.07 1.646.07 4.85s-.015 3.585-.074 4.85c-.061 1.17-.256 1.805-.421 2.227-.224.562-.479.96-.899 1.382-.419.419-.824.679-1.38.896-.42.164-1.065.36-2.235.413-1.274.057-1.649.07-4.859.07-3.211 0-3.586-.015-4.859-.074-1.171-.061-1.816-.256-2.236-.421-.569-.224-.96-.479-1.379-.899-.421-.419-.69-.824-.9-1.38-.165-.42-.359-1.065-.42-2.235-.045-1.26-.061-1.649-.061-4.844 0-3.196.016-3.586.061-4.861.061-1.17.255-1.814.42-2.234.21-.57.479-.96.9-1.381.419-.419.81-.689 1.379-.898.42-.166 1.051-.361 2.221-.421 1.275-.045 1.65-.06 4.859-.06l.045.03zm0 3.678c-3.405 0-6.162 2.76-6.162 6.162 0 3.405 2.76 6.162 6.162 6.162 3.405 0 6.162-2.76 6.162-6.162 0-3.405-2.76-6.162-6.162-6.162zM12 16c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4zm7.846-10.405c0 .795-.646 1.44-1.44 1.44-.795 0-1.44-.646-1.44-1.44 0-.794.646-1.439 1.44-1.439.793-.001 1.44.645 1.44 1.439z',
  },
  {
    label: 'TikTok',
    href: 'https://www.tiktok.com/@animeuniontv',
    hover: 'hover:text-[#FE2C55] focus-visible:text-[#FE2C55]',
    path: 'M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z',
  },
];

export function Footer() {
  const appInfo = trpc.config.appInfo.useQuery(undefined, { staleTime: Number.POSITIVE_INFINITY });
  const version = appInfo.data?.version;

  // L'URL include pathname/userAgent: deterministico in SSR, arricchito dopo il mount.
  const [feedbackHref, setFeedbackHref] = useState(() =>
    buildIssueUrl({ title: 'Feedback/bug app: ', body: '' }),
  );
  useEffect(() => {
    setFeedbackHref(feedbackIssueUrl());
  }, []);

  return (
    <footer className="mt-8 border-t bg-card/30">
      <div className="container py-10">
        <div className="flex flex-col items-center gap-8 md:flex-row md:items-start md:justify-between">
          <div className="flex flex-col items-center gap-4 md:items-start">
            <Image
              src="/logo.png"
              alt="AnimeUnion"
              width={160}
              height={34}
              className="h-8 w-auto object-contain"
            />
            <div className="flex items-center gap-5">
              {SOCIALS.map((s) => (
                <a
                  key={s.label}
                  href={s.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={s.label}
                  title={s.label}
                  className={`rounded-sm text-muted-foreground outline-none transition-colors ${s.hover}`}
                >
                  <svg
                    role="img"
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    className="h-6 w-6 fill-current"
                  >
                    <path d={s.path} />
                  </svg>
                  <span className="sr-only">{s.label}</span>
                </a>
              ))}
            </div>
          </div>

          <div className="max-w-md space-y-2 text-center text-sm text-muted-foreground md:text-right">
            <p>All files on this site are property of their respective and rightful owners.</p>
            <p>
              Info/Abuse server:{' '}
              <a href="mailto:aniuniontv@gmail.com" className={TEXT_LINK}>
                aniuniontv@gmail.com
              </a>
            </p>
            <p>
              Feedback/bug app:{' '}
              <a
                href={feedbackHref}
                target="_blank"
                rel="noopener noreferrer"
                className={TEXT_LINK}
              >
                apri una segnalazione
              </a>
            </p>
          </div>
        </div>

        <Separator className="my-6" />

        <div className="flex flex-col items-center gap-3 text-center text-xs text-muted-foreground sm:flex-row sm:justify-between sm:text-left">
          <div className="space-y-1">
            <p>
              Powered by{' '}
              <a
                href="https://animeunion.tv"
                target="_blank"
                rel="noopener noreferrer"
                className={TEXT_LINK}
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
                rel="noopener noreferrer"
                className={TEXT_LINK}
              >
                iCosiSenpai
              </a>
            </p>
          </div>

          <div className="flex items-center gap-4">
            <Link
              href="/diagnostica"
              className="inline-flex items-center gap-1.5 underline-offset-4 transition-colors hover:text-foreground hover:underline"
            >
              <Stethoscope className="h-4 w-4" />
              Diagnostica
            </Link>
            {version ? <span className="tabular-nums">v{version}</span> : null}
          </div>
        </div>
      </div>
    </footer>
  );
}
