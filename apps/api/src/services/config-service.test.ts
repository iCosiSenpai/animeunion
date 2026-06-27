import { resolve } from 'node:path';
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

  it('countDownloadsUnder conta solo i file con localPath sotto la root', () => {
    const db = createTestDb();
    const service = createConfigService({ db });
    const ts = new Date().toISOString();
    db.insert(schema.anime)
      .values({
        id: 'a',
        slug: 'a',
        title: 'A',
        type: 'TV',
        status: 'ONGOING',
        episodeCount: 2,
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
    db.insert(schema.episode)
      .values([
        { id: 'e1', animeId: 'a', number: 1, createdAt: ts, updatedAt: ts },
        { id: 'e2', animeId: 'a', number: 2, createdAt: ts, updatedAt: ts },
      ])
      .run();
    db.insert(schema.episodeFile)
      .values([
        {
          id: 'f1',
          episodeId: 'e1',
          language: 'SUB_ITA',
          downloadStatus: 'downloaded',
          localPath: resolve('/media/anime/A/Season 01/A - S01E01.mp4'),
          createdAt: ts,
          updatedAt: ts,
        },
        {
          id: 'f2',
          episodeId: 'e2',
          language: 'SUB_ITA',
          downloadStatus: 'downloaded',
          localPath: resolve('/other/B - S01E01.mp4'),
          createdAt: ts,
          updatedAt: ts,
        },
      ])
      .run();

    expect(service.countDownloadsUnder('/media/anime')).toBe(1);
    expect(service.countDownloadsUnder('/media/anime/A')).toBe(1);
    expect(service.countDownloadsUnder('/nowhere')).toBe(0);
    expect(service.countDownloadsUnder('')).toBe(0);
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

  it('credenziali Telegram: default vuote e settabili', () => {
    const service = createConfigService({ db: createTestDb() });
    expect(service.get('telegramBotToken')).toBe('');
    expect(service.get('telegramChatId')).toBe('');
    service.set('telegramBotToken', '123456:ABC');
    service.set('telegramChatId', '42');
    expect(service.get('telegramBotToken')).toBe('123456:ABC');
    expect(service.get('telegramChatId')).toBe('42');
  });

  it('tema: default e set di accent/sfondo', () => {
    const service = createConfigService({ db: createTestDb() });
    expect(service.get('themeAccent')).toBe('green');
    expect(service.get('themeBackgroundUrl')).toBe('');
    service.set('themeAccent', 'blue');
    service.set('themeBackgroundUrl', 'https://example.test/x.jpg');
    expect(service.get('themeAccent')).toBe('blue');
    expect(service.get('themeBackgroundUrl')).toBe('https://example.test/x.jpg');
  });

  it('animazioni: default true e set', () => {
    const service = createConfigService({ db: createTestDb() });
    expect(service.get('animationsEnabled')).toBe(true);
    service.set('animationsEnabled', false);
    expect(service.get('animationsEnabled')).toBe(false);
  });

  it('homeLayout: default vuoto, set di un layout (array) e round-trip', () => {
    const service = createConfigService({ db: createTestDb() });
    expect(service.get('homeLayout')).toEqual([]);
    const layout = [
      { id: 'hero', visible: false },
      { id: 'latestEpisodes', visible: true },
    ];
    service.set('homeLayout', layout);
    expect(service.get('homeLayout')).toEqual(layout);
    expect(service.getAll().homeLayout).toEqual(layout);
  });

  it('homeLayout: valore corrotto in DB ricade su [] senza far fallire getAll', () => {
    const db = createTestDb();
    const timestamp = new Date().toISOString();
    // id non più nell'enum: l'array fallirebbe il parse → il .catch([]) lo neutralizza e l'intero
    // getAll non deve lanciare (un layout corrotto non deve bloccare tutta la config).
    db.insert(schema.config)
      .values({
        key: 'homeLayout',
        value: '[{"id":"sezione-rimossa","visible":true}]',
        updatedAt: timestamp,
      })
      .run();

    const service = createConfigService({ db });
    expect(() => service.getAll()).not.toThrow();
    expect(service.getAll().homeLayout).toEqual([]);
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
