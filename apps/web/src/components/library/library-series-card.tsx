'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { formatBytes, formatDate, pad2 } from '@/lib/utils';
import type { LibraryItem } from '@animeunion/shared';
import { ChevronDown, ChevronUp, Eye, FileVideo, HardDrive } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

export function LibrarySeriesCard({ item }: { item: LibraryItem }) {
  const [expanded, setExpanded] = useState(false);
  const title = item.anime.titleIta ?? item.anime.title;
  const totalSize = item.episodes.reduce((sum, ep) => sum + (ep.fileSize ?? 0), 0);

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        <div className="flex gap-4 p-4">
          <div className="relative shrink-0 overflow-hidden rounded-md bg-muted">
            <div className="aspect-[2/3] w-24 sm:w-32">
              {item.anime.coverImage ? (
                <img
                  src={item.anime.coverImage}
                  alt={title}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <FileVideo className="h-8 w-8 text-muted-foreground" />
                </div>
              )}
            </div>
          </div>

          <div className="flex min-w-0 flex-1 flex-col justify-between">
            <div className="space-y-1">
              <Link
                href={`/catalog/${item.anime.slug}`}
                className="line-clamp-1 text-base font-semibold hover:text-primary sm:text-lg"
              >
                {title}
              </Link>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="secondary">Stagione {pad2(item.seasonNumber)}</Badge>
                <Badge variant="outline">
                  {item.language === 'SUB_ITA' ? 'Sub ITA' : 'Dub ITA'}
                </Badge>
                <span className="flex items-center gap-1">
                  <Eye className="h-3 w-3" />
                  {item.episodes.length} episod{item.episodes.length === 1 ? 'io' : 'i'}
                </span>
                <span className="flex items-center gap-1">
                  <HardDrive className="h-3 w-3" />
                  {formatBytes(totalSize)}
                </span>
              </div>
            </div>

            <div className="mt-3 flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setExpanded((prev) => !prev)}
                className="gap-1"
              >
                {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                {expanded ? 'Nascondi episodi' : 'Vedi episodi'}
              </Button>
            </div>
          </div>
        </div>

        {expanded ? (
          <div className="border-t bg-muted/30 px-4 py-3">
            <ul className="space-y-2">
              {item.episodes.map((ep) => (
                <li
                  key={ep.episodeId}
                  className="flex items-center justify-between gap-3 rounded-md border bg-background p-2 text-sm"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="shrink-0 font-mono text-xs text-muted-foreground">
                      S{pad2(item.seasonNumber)}E{pad2(ep.episodeNumber)}
                    </span>
                    <span className="truncate">
                      {ep.episodeTitle ?? `Episodio ${ep.episodeNumber}`}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
                    {ep.fileSize != null ? <span>{formatBytes(ep.fileSize)}</span> : null}
                    {ep.downloadedAt ? <span>{formatDate(ep.downloadedAt)}</span> : null}
                    {ep.localPath ? (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <FileVideo className="h-4 w-4" />
                          </TooltipTrigger>
                          <TooltipContent side="left" className="max-w-md break-all">
                            <p>{ep.localPath}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
