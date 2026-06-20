import { router } from '../trpc';
import { authRouter } from './auth';
import { calendarRouter } from './calendar';
import { catalogRouter } from './catalog';
import { configRouter } from './config';
import { downloadRouter } from './download';
import { episodeRouter } from './episode';
import { followRouter } from './follow';
import { healthRouter } from './health';
import { homeRouter } from './home';
import { libraryRouter } from './library';
import { meRouter } from './me';
import { notificationsRouter } from './notifications';
import { profileRouter } from './profile';
import { seriesRouter } from './series';
import { statsRouter } from './stats';
import { themeRouter } from './theme';

export const appRouter = router({
  auth: authRouter,
  catalog: catalogRouter,
  episode: episodeRouter,
  calendar: calendarRouter,
  follow: followRouter,
  home: homeRouter,
  library: libraryRouter,
  me: meRouter,
  profile: profileRouter,
  config: configRouter,
  download: downloadRouter,
  series: seriesRouter,
  notifications: notificationsRouter,
  health: healthRouter,
  theme: themeRouter,
  stats: statsRouter,
});

export type AppRouter = typeof appRouter;
