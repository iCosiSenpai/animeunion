import { z } from 'zod';
import { languageSchema, namingFormatSchema } from './enums';

export const appConfigSchema = z.object({
  downloadPath: z.string().default('/anime'),
  cronSchedule: z.string().default('0 */6 * * *'),
  language: languageSchema.default('SUB_ITA'),
  namingFormat: namingFormatSchema.default('SXXEXX'),
  maxConcurrent: z.number().int().min(1).max(5).default(2),
  rateLimitMs: z.number().int().positive().default(1000),
  catalogSyncHours: z.number().int().positive().default(24),
  autoDownload: z.boolean().default(true),
  favoritesSyncMinutes: z.number().int().positive().default(10),
});
export type AppConfig = z.infer<typeof appConfigSchema>;

export const configKeySchema = appConfigSchema.keyof();
export type ConfigKey = z.infer<typeof configKeySchema>;

export const configSetInputSchema = z.object({
  key: configKeySchema,
  value: z.unknown(),
});
export type ConfigSetInput = z.infer<typeof configSetInputSchema>;
