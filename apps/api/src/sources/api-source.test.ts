import { hasNeuralExport, isPremiumActive } from '@animeunion/shared';
import { MockAgent, setGlobalDispatcher } from 'undici';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApiSource } from './api-source';

const BASE = 'https://api.test';
const JSON_HEADERS = { headers: { 'content-type': 'application/json' } };

let agent: MockAgent;

function pool() {
  return agent.get(BASE);
}

function createSource() {
  return createApiSource({ baseUrl: BASE, rateLimitMs: 1 });
}

beforeEach(() => {
  agent = new MockAgent();
  agent.disableNetConnect();
  setGlobalDispatcher(agent);
});

afterEach(async () => {
  await agent.close();
});

describe('ApiSource', () => {
  it('getGenres mappa la lista generi', async () => {
    pool()
      .intercept({ path: '/genres', method: 'GET' })
      .reply(
        200,
        [{ id: 'g1', slug: 'azione', name: 'Azione', nameEng: 'Action', malId: 1 }],
        JSON_HEADERS,
      );

    const genres = await createSource().getGenres();
    expect(genres).toHaveLength(1);
    expect(genres[0]).toMatchObject({ id: 'g1', slug: 'azione', nameEng: 'Action' });
  });

  it('getStats mappa i totali', async () => {
    pool()
      .intercept({ path: '/stats', method: 'GET' })
      .reply(200, { totalAnime: 5829, totalEpisodes: 80309 }, JSON_HEADERS);

    const stats = await createSource().getStats();
    expect(stats).toEqual({ totalAnime: 5829, totalEpisodes: 80309 });
  });

  it('searchAnime mappa data e paginazione (perPage da limit)', async () => {
    pool()
      .intercept({ path: /^\/anime\?/, method: 'GET' })
      .reply(
        200,
        {
          data: [
            {
              id: 'a1',
              slug: 'naruto',
              title: 'Naruto',
              type: 'TV',
              status: 'COMPLETED',
              genres: [{ id: 'g1', slug: 'azione', name: 'Azione' }],
              availableLanguages: ['SUB_ITA'],
            },
          ],
          meta: { page: 1, limit: 24, perPage: 24, total: 100, totalPages: 5, hasMore: true },
        },
        JSON_HEADERS,
      );

    const result = await createSource().searchAnime('naruto', 1);
    expect(result.meta).toEqual({ page: 1, perPage: 24, total: 100, hasMore: true });
    expect(result.data[0]).toMatchObject({
      id: 'a1',
      slug: 'naruto',
      availableLanguages: ['SUB_ITA'],
    });
  });

  it('getEpisodes espande un episodio per ogni lingua con downloadUrl', async () => {
    pool()
      .intercept({ path: '/anime/edens-zero/episodes', method: 'GET' })
      .reply(
        200,
        {
          data: [
            {
              id: 'ep1',
              animeId: 'a1',
              number: 1,
              languages: ['SUB_ITA', 'DUB_ITA'],
              sources: [
                { language: 'SUB_ITA', url: 'https://cdn.test/sub/ep1.mp4', format: 'mp4' },
                { language: 'DUB_ITA', url: 'https://cdn.test/dub/ep1.mp4', format: 'mp4' },
              ],
            },
          ],
        },
        JSON_HEADERS,
      );

    const episodes = await createSource().getEpisodes('edens-zero');
    expect(episodes).toHaveLength(2);
    expect(episodes.map((e) => e.language)).toEqual(['SUB_ITA', 'DUB_ITA']);
    expect(episodes[0]).toMatchObject({
      id: 'ep1_SUB_ITA',
      number: 1,
      language: 'SUB_ITA',
      downloadUrl: 'https://cdn.test/sub/ep1.mp4',
      expiresAt: null,
    });
  });

  it('getAnimeBySlug unisce dettaglio + episodi e mappa relationsFrom', async () => {
    pool()
      .intercept({ path: '/anime/edens-zero', method: 'GET' })
      .reply(
        200,
        {
          id: 'a1',
          slug: 'edens-zero',
          title: 'Edens Zero',
          type: 'TV',
          status: 'COMPLETED',
          episodeCount: 25,
          availableLanguages: ['SUB_ITA'],
          genres: [{ id: 'g1', slug: 'azione', name: 'Azione', nameEng: 'Action', malId: 1 }],
          relationsFrom: [
            {
              relationType: 'SEQUEL',
              toAnime: {
                id: 'a2',
                slug: 'edens-zero-2',
                title: 'Edens Zero 2',
                type: 'TV',
                seasonYear: 2023,
              },
            },
          ],
        },
        JSON_HEADERS,
      );
    pool()
      .intercept({ path: '/anime/edens-zero/episodes', method: 'GET' })
      .reply(
        200,
        {
          data: [
            {
              id: 'ep1',
              animeId: 'a1',
              number: 1,
              languages: ['SUB_ITA'],
              sources: [
                { language: 'SUB_ITA', url: 'https://cdn.test/sub/ep1.mp4', format: 'mp4' },
              ],
            },
          ],
        },
        JSON_HEADERS,
      );

    const detail = await createSource().getAnimeBySlug('edens-zero');
    expect(detail.episodeCount).toBe(25);
    expect(detail.episodes).toHaveLength(1);
    expect(detail.relatedAnime[0]).toMatchObject({ slug: 'edens-zero-2', relationType: 'SEQUEL' });
    expect(detail.recommendations).toEqual([]);
  });

  it('getAnimeBySlug tollera episodeCount null (serie in corso)', async () => {
    pool()
      .intercept({ path: '/anime/koori-no-jouheki', method: 'GET' })
      .reply(
        200,
        {
          id: 'a1',
          slug: 'koori-no-jouheki',
          title: 'Koori no Jouheki',
          type: 'TV',
          status: 'ONGOING',
          episodeCount: null,
          availableLanguages: ['SUB_ITA', 'DUB_ITA'],
          genres: [],
          relationsFrom: [],
        },
        JSON_HEADERS,
      );
    pool()
      .intercept({ path: '/anime/koori-no-jouheki/episodes', method: 'GET' })
      .reply(
        200,
        {
          data: [
            {
              id: 'ep12',
              number: 12,
              languages: ['SUB_ITA', 'DUB_ITA'],
              sources: [
                { language: 'SUB_ITA', url: 'https://cdn.test/sub/ep12.mp4', format: 'mp4' },
                { language: 'DUB_ITA', url: 'https://cdn.test/dub/ep12.mp4', format: 'mp4' },
              ],
            },
          ],
        },
        JSON_HEADERS,
      );

    const detail = await createSource().getAnimeBySlug('koori-no-jouheki');
    expect(detail.episodeCount).toBe(0);
    expect(detail.episodes).toHaveLength(2);
  });

  it('getEpisodes scarta sorgenti/episodi malformati senza perdere i validi', async () => {
    pool()
      .intercept({ path: '/anime/mix/episodes', method: 'GET' })
      .reply(
        200,
        {
          data: [
            {
              id: 'ep1',
              number: 1,
              sources: [
                { language: 'SUB_ITA', url: 'not-a-valid-url', format: 'mp4' },
                { language: 'DUB_ITA', url: 'https://cdn.test/dub/ep1.mp4', format: 'mp4' },
              ],
            },
            { id: 'ep2', number: 'NaN', sources: [] },
            {
              id: 'ep3',
              number: 3,
              sources: [
                { language: 'SUB_ITA', url: 'https://cdn.test/sub/ep3.mp4', format: 'mp4' },
              ],
            },
          ],
        },
        JSON_HEADERS,
      );

    const episodes = await createSource().getEpisodes('mix');
    // ep1: solo la sorgente DUB valida; ep2 scartato (number non valido); ep3: SUB valida.
    expect(episodes).toHaveLength(2);
    expect(episodes.map((e) => `${e.number}_${e.language}`)).toEqual(['1_DUB_ITA', '3_SUB_ITA']);
  });

  it('login restituisce il token e mappa la risposta snake_case', async () => {
    pool()
      .intercept({ path: '/auth/login', method: 'POST' })
      .reply(200, { token: 'jwt-123', expires_in: 5184000, user: { id: 'u1' } }, JSON_HEADERS);

    const source = createSource();
    const result = await source.login?.('a@b.it', 'pw');
    expect(result).toMatchObject({ token: 'jwt-123', refreshToken: '' });
  });

  it('getCalendar raggruppa per giorno (data { "0".."6" } con dayOfWeek)', async () => {
    pool()
      .intercept({ path: '/calendario', method: 'GET' })
      .reply(
        200,
        {
          data: {
            '1': [
              {
                dayOfWeek: 1,
                airTime: '17:30',
                episodeNumber: 12,
                anime: {
                  id: 'a1',
                  slug: 'lunedi-anime',
                  title: 'Lunedi Anime',
                  type: 'TV',
                  status: 'ONGOING',
                },
              },
            ],
            '0': [
              {
                dayOfWeek: 0,
                anime: {
                  id: 'a2',
                  slug: 'domenica-anime',
                  title: 'Domenica Anime',
                  type: 'TV',
                  status: 'ONGOING',
                },
              },
            ],
          },
        },
        JSON_HEADERS,
      );

    const week = await createSource().getCalendar();
    expect(week).toHaveLength(7);
    const lunedi = week.find((entry) => entry.day === 'LUNEDI');
    const domenica = week.find((entry) => entry.day === 'DOMENICA');
    expect(lunedi?.anime[0]?.slug).toBe('lunedi-anime');
    expect(lunedi?.anime[0]?.airTime).toBe('17:30');
    expect(lunedi?.anime[0]?.episodeNumber).toBe(12);
    expect(domenica?.anime[0]?.slug).toBe('domenica-anime');
    expect(domenica?.anime[0]?.airTime).toBeNull();
    expect(week[0]?.day).toBe('LUNEDI');
  });

  it('getMe legge premium attivo + neuralExport (utente premium)', async () => {
    pool()
      .intercept({ path: '/me', method: 'GET' })
      .reply(
        200,
        {
          id: 'u1',
          username: 'cosi',
          email: 'a@b.it',
          avatarUrl: null,
          role: 'USER',
          createdAt: '2026-01-01T00:00:00.000Z',
          premium: { tier: 'MEGA_FAN', active: true, expiresAt: '2026-08-06T00:00:00.000Z' },
          features: { neuralExport: true },
        },
        JSON_HEADERS,
      );

    const me = await createSource().getMe?.();
    expect(me?.premium).toEqual({
      tier: 'MEGA_FAN',
      active: true,
      expiresAt: '2026-08-06T00:00:00.000Z',
    });
    expect(isPremiumActive(me)).toBe(true);
    expect(hasNeuralExport(me)).toBe(true);
  });

  it('getMe tratta premium null come non abbonato', async () => {
    pool().intercept({ path: '/me', method: 'GET' }).reply(
      200,
      {
        id: 'u2',
        username: 'free',
        email: 'c@d.it',
        avatarUrl: null,
        role: 'USER',
        createdAt: '2026-01-01T00:00:00.000Z',
        premium: null,
      },
      JSON_HEADERS,
    );

    const me = await createSource().getMe?.();
    expect(me?.premium).toBeNull();
    expect(isPremiumActive(me)).toBe(false);
    expect(hasNeuralExport(me)).toBe(false);
  });

  it('getMe: premium scaduto (active:false) non da diritti pur mantenendo il tier', async () => {
    pool()
      .intercept({ path: '/me', method: 'GET' })
      .reply(
        200,
        {
          id: 'u3',
          username: 'lapsed',
          email: 'e@f.it',
          avatarUrl: null,
          role: 'USER',
          createdAt: '2026-01-01T00:00:00.000Z',
          premium: { tier: 'FAN', active: false, expiresAt: '2026-06-01T00:00:00.000Z' },
          features: { neuralExport: false },
        },
        JSON_HEADERS,
      );

    const me = await createSource().getMe?.();
    expect(me?.premium?.tier).toBe('FAN');
    expect(isPremiumActive(me)).toBe(false);
    expect(hasNeuralExport(me)).toBe(false);
  });

  it('getMe tollera chiavi ignote in features e flag assente (=> false)', async () => {
    pool()
      .intercept({ path: '/me', method: 'GET' })
      .reply(
        200,
        {
          id: 'u4',
          username: 'future',
          email: 'g@h.it',
          avatarUrl: null,
          role: 'USER',
          createdAt: '2026-01-01T00:00:00.000Z',
          premium: { tier: 'ULTRA_FAN', active: true, expiresAt: '2026-09-01T00:00:00.000Z' },
          features: { someFutureFlag: true },
        },
        JSON_HEADERS,
      );

    const me = await createSource().getMe?.();
    // La chiave ignota passa (passthrough) ma non attiva l'entitlement neurale.
    expect((me?.features as Record<string, unknown>).someFutureFlag).toBe(true);
    expect(hasNeuralExport(me)).toBe(false);
    expect(isPremiumActive(me)).toBe(true);
  });

  it('getNeuralExportProfile legge la ricetta e tollera chiavi extra', async () => {
    pool()
      .intercept({ path: '/neural-export/profile', method: 'GET' })
      .reply(
        200,
        {
          version: 1,
          requiredTiers: ['MEGA_FAN', 'ULTRA_FAN'],
          license: 'MIT',
          reference: 'ffmpeg ...',
          futureField: 'ignored-but-kept',
          shaders: [
            {
              file: 'Anime4K_Restore_CNN_M.glsl',
              url: 'https://api.test/static/anime4k/Anime4K_Restore_CNN_M.glsl',
              sha256: 'a'.repeat(64),
              sizeBytes: 35916,
            },
          ],
          profiles: [
            {
              id: 'xq',
              chain: ['Anime4K_Restore_CNN_M.glsl'],
              targetWidth: 1920,
              targetHeight: 1080,
              videoBitrate: '10M',
              videoCodec: 'libx264',
              audio: 'copy',
              faststart: true,
            },
          ],
        },
        JSON_HEADERS,
      );

    const recipe = await createSource().getNeuralExportProfile?.();
    expect(recipe?.version).toBe(1);
    expect(recipe?.profiles[0]?.id).toBe('xq');
    expect(recipe?.shaders[0]?.sha256).toHaveLength(64);
  });

  it('propaga errore su risposta non ok', async () => {
    pool().intercept({ path: '/stats', method: 'GET' }).reply(500, { error: 'boom' }, JSON_HEADERS);
    await expect(createSource().getStats()).rejects.toThrow(/API fallita/);
  });
});
