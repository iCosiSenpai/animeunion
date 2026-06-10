import { router } from '../trpc';
import { calendarRouter } from './calendar';
import { catalogRouter } from './catalog';
import { configRouter } from './config';
import { episodeRouter } from './episode';
import { followRouter } from './follow';
import { statsRouter } from './stats';

export const appRouter = router({
  catalog: catalogRouter,
  episode: episodeRouter,
  calendar: calendarRouter,
  follow: followRouter,
  config: configRouter,
  stats: statsRouter,
});

export type AppRouter = typeof appRouter;
