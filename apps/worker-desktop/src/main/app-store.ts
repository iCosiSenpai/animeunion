import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { app } from 'electron';
import { type AppConfig, createDefaultConfig } from '../shared/app-config';

/**
 * Persistenza della config dell'app in `userData/config.json`. Al primo avvio genera un token fresco
 * e lo salva; i valori mancanti/corrotti ricadono sui default. Il token non viene mai loggato.
 */
function configPath(): string {
  return join(app.getPath('userData'), 'config.json');
}

export function loadConfig(): AppConfig {
  const path = configPath();
  if (existsSync(path)) {
    try {
      const raw = JSON.parse(readFileSync(path, 'utf8')) as Partial<AppConfig>;
      return createDefaultConfig(raw);
    } catch {
      // File corrotto: rigenera dai default senza crashare.
    }
  }
  const fresh = createDefaultConfig();
  saveConfig(fresh);
  return fresh;
}

export function saveConfig(config: AppConfig): void {
  writeFileSync(configPath(), JSON.stringify(config, null, 2), 'utf8');
}

export function updateConfig(patch: Partial<AppConfig>): AppConfig {
  const next = { ...loadConfig(), ...patch };
  saveConfig(next);
  return next;
}
