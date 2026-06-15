import { router } from '../trpc';
import { authRouter } from './auth';
import { calendarRouter } from './calendar';
import { catalogRouter } from './catalog';
import { configRouter } from './config';
import { episodeRouter } from './episode';
import { followRouter } from './follow';
import { homeRouter } from './home';
import { libraryRouter } from './library';
import { profileRouter } from './profile';
import { statsRouter } from './stats';

export const appRouter = router({
  auth: authRouter,
  catalog: catalogRouter,
  episode: episodeRouter,
  calendar: calendarRouter,
  follow: followRouter,
  home: homeRouter,
  library: libraryRouter,
  profile: profileRouter,
  config: configRouter,
  stats: statsRouter,
});

export type AppRouter = typeof appRouter;
