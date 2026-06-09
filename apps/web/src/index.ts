import type { AnimeSummary } from '@animeunion/shared';

export const WEB_NAME = 'animeunion-web';

export type AnimeCardModel = Pick<AnimeSummary, 'id' | 'slug' | 'title' | 'coverImage'>;
