import type { AppConfig } from '@animeunion/shared';

export type SetupConfig = Pick<AppConfig, 'seriesPathSub' | 'setupCompleted'>;

/**
 * Decide se l'onboarding deve bloccare l'app.
 *
 * `setupCompleted === null` identifica i database precedenti al marker: se hanno già la cartella
 * obbligatoria sono considerati configurati. `false` è invece una scelta esplicita e mantiene il
 * wizard attivo anche dopo che la cartella viene salvata. La cartella base resta sempre necessaria.
 */
export function shouldShowSetup(config: SetupConfig): boolean {
  if (config.seriesPathSub.trim() === '') {
    return true;
  }
  return config.setupCompleted === false;
}
