import { router } from '../trpc';
import { authRouter } from './auth';
import { backupRouter } from './backup';
import { calendarRouter } from './calendar';
import { catalogRouter } from './catalog';
import { configRouter } from './config';
import { downloadRouter } from './download';
import { episodeRouter } from './episode';
import { filesRouter } from './files';
import { followRouter } from './follow';
import { healthRouter } from './health';
import { homeRouter } from './home';
import { jellyfinRouter } from './jellyfin';
import { libraryRouter } from './library';
import { lockRouter } from './lock';
import { meRouter } from './me';
import { notificationsRouter } from './notifications';
import { profileRouter } from './profile';
import { pushRouter } from './push';
import { requestsRouter } from './requests';
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
  files: filesRouter,
  series: seriesRouter,
  notifications: notificationsRouter,
  health: healthRouter,
  theme: themeRouter,
  lock: lockRouter,
  push: pushRouter,
  requests: requestsRouter,
  stats: statsRouter,
  jellyfin: jellyfinRouter,
  backup: backupRouter,
});

export type AppRouter = typeof appRouter;
