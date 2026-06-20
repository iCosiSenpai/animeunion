import { appConfigSchema } from '@animeunion/shared';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import { schema } from '../db';
import { createTestDb } from '../test/helpers';
import { createConfigService } from './config-service';

describe('ConfigService', () => {
  it('getAll con DB vuoto ritorna i default del contratto', () => {
    const service = createConfigService({ db: createTestDb() });
    expect(service.getAll()).toEqual(appConfigSchema.parse({}));
  });

  it('set valida, persiste JSON e get rilegge il valore', () => {
    const db = createTestDb();
    const service = createConfigService({ db });

    const saved = service.set('maxConcurrent', 3);

    expect(saved).toBe(3);
    expect(service.get('maxConcurrent')).toBe(3);
    const row = db.select().from(schema.config).where(eq(schema.config.key, 'maxConcurrent')).get();
    expect(row?.value).toBe('3');
  });

  it('set sovrascrive un valore esistente (upsert)', () => {
    const service = createConfigService({ db: createTestDb() });
    service.set('language', 'SUB_ITA');
    service.set('language', 'DUB_ITA');
    expect(service.get('language')).toBe('DUB_ITA');
  });

  it('set con valore invalido lancia ZodError e non persiste', () => {
    const service = createConfigService({ db: createTestDb() });
    expect(() => service.set('maxConcurrent', 99)).toThrow(ZodError);
    expect(service.get('maxConcurrent')).toBe(1);
  });

  it('getAll ignora chiavi sconosciute e valori corrotti', () => {
    const db = createTestDb();
    const timestamp = new Date().toISOString();
    db.insert(schema.config)
      .values({ key: 'chiave_legacy', value: '"x"', updatedAt: timestamp })
      .run();
    db.insert(schema.config)
      .values({ key: 'seriesPathSub', value: 'non-json{', updatedAt: timestamp })
      .run();

    const service = createConfigService({ db });
    const all = service.getAll();

    expect(all.seriesPathSub).toBe('');
    expect('chiave_legacy' in all).toBe(false);
  });

  it('isConfigured riflette la presenza della cartella base', () => {
    const service = createConfigService({ db: createTestDb() });
    expect(service.isConfigured()).toBe(false);
    service.set('seriesPathSub', '/media/Anime');
    expect(service.isConfigured()).toBe(true);
  });

  it('resolveDownloadRoot ritorna stringa vuota finché non configurato', () => {
    const service = createConfigService({ db: createTestDb() });
    expect(service.resolveDownloadRoot(false, 'SUB_ITA')).toBe('');
    expect(service.distinctDownloadRoots()).toEqual([]);
    service.set('seriesPathSub', '/media/Anime');
    expect(service.resolveDownloadRoot(false, 'SUB_ITA')).toBe('/media/Anime');
    // DUB e film ereditano dalla base finché non hanno una cartella propria.
    expect(service.resolveDownloadRoot(false, 'DUB_ITA')).toBe('/media/Anime');
    expect(service.resolveDownloadRoot(true, 'SUB_ITA')).toBe('/media/Anime');
  });
});
