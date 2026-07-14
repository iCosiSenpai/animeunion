import { MockAgent, setGlobalDispatcher } from 'undici';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { searchWallpapers } from './wallhaven';

const WALLHAVEN = 'https://wallhaven.cc';

let agent: MockAgent;

beforeEach(() => {
  agent = new MockAgent();
  agent.disableNetConnect();
  setGlobalDispatcher(agent);
});
afterEach(async () => {
  await agent.close();
});

describe('wallhaven.searchWallpapers', () => {
  it('mappa i risultati e usa i filtri Anime+SFW', async () => {
    agent
      .get(WALLHAVEN)
      // Il matcher richiede categorie Anime (010) e purity SFW (100): se mancassero
      // l'intercept non scatterebbe e (net disabilitato) la funzione tornerebbe [].
      .intercept({
        path: (p) => p.includes('categories=010') && p.includes('purity=100'),
        method: 'GET',
      })
      .reply(
        200,
        {
          data: [
            {
              id: 'abc',
              url: 'https://wallhaven.cc/w/abc',
              resolution: '1920x1080',
              path: 'https://w.wallhaven.cc/full/ab/wallhaven-abc.jpg',
              thumbs: { large: 'https://th.wallhaven.cc/lg/ab/abc.jpg' },
            },
          ],
        },
        { headers: { 'content-type': 'application/json' } },
      );

    const res = await searchWallpapers({ query: 'sword art online' });
    expect(res).toHaveLength(1);
    expect(res[0]).toMatchObject({
      id: 'abc',
      fullUrl: 'https://w.wallhaven.cc/full/ab/wallhaven-abc.jpg',
      thumbUrl: 'https://th.wallhaven.cc/lg/ab/abc.jpg',
      resolution: '1920x1080',
      pageUrl: 'https://wallhaven.cc/w/abc',
    });
  });

  it('con sketchy abilitato usa purity 110 (SFW + Sketchy), categoria sempre Anime', async () => {
    agent
      .get(WALLHAVEN)
      // Sketchy ON deve produrre purity=110; categoria resta 010 (Anime).
      .intercept({
        path: (p) => p.includes('categories=010') && p.includes('purity=110'),
        method: 'GET',
      })
      .reply(200, { data: [] }, { headers: { 'content-type': 'application/json' } });

    expect(await searchWallpapers({ query: 'naruto', sketchy: true })).toEqual([]);
  });

  it('senza sketchy resta SFW (purity 100)', async () => {
    agent
      .get(WALLHAVEN)
      // Default e sketchy:false devono restare purity=100; se uscisse 110 l'intercept non scatterebbe.
      .intercept({
        path: (p) => p.includes('purity=100') && !p.includes('purity=110'),
        method: 'GET',
      })
      .reply(200, { data: [] }, { headers: { 'content-type': 'application/json' } });

    expect(await searchWallpapers({ query: 'naruto', sketchy: false })).toEqual([]);
  });

  it('ritorna [] su errore HTTP', async () => {
    agent
      .get(WALLHAVEN)
      .intercept({ path: (p) => p.startsWith('/api/v1/search'), method: 'GET' })
      .reply(429, '');

    expect(await searchWallpapers({ query: 'x' })).toEqual([]);
  });

  it('sorting=toplist esplicito forza toplist anche con query (+ topRange)', async () => {
    agent
      .get(WALLHAVEN)
      .intercept({
        path: (p) => p.includes('sorting=toplist') && p.includes('topRange=1y'),
        method: 'GET',
      })
      .reply(200, { data: [] }, { headers: { 'content-type': 'application/json' } });

    expect(await searchWallpapers({ query: 'naruto', sorting: 'toplist' })).toEqual([]);
  });

  it('sorting=favorites usa sorting=favorites (nessun topRange)', async () => {
    agent
      .get(WALLHAVEN)
      .intercept({
        path: (p) => p.includes('sorting=favorites') && !p.includes('topRange'),
        method: 'GET',
      })
      .reply(200, { data: [] }, { headers: { 'content-type': 'application/json' } });

    expect(await searchWallpapers({ sorting: 'favorites' })).toEqual([]);
  });

  it('senza sorting resta auto: relevance con query', async () => {
    agent
      .get(WALLHAVEN)
      .intercept({ path: (p) => p.includes('sorting=relevance'), method: 'GET' })
      .reply(200, { data: [] }, { headers: { 'content-type': 'application/json' } });

    expect(await searchWallpapers({ query: 'naruto' })).toEqual([]);
  });

  it('mappa il conteggio favorites nel risultato', async () => {
    agent
      .get(WALLHAVEN)
      .intercept({ path: (p) => p.startsWith('/api/v1/search'), method: 'GET' })
      .reply(
        200,
        {
          data: [
            {
              id: 'fav',
              url: 'https://wallhaven.cc/w/fav',
              resolution: '1920x1080',
              path: 'https://w.wallhaven.cc/full/fa/wallhaven-fav.jpg',
              favorites: 2145,
              thumbs: { large: 'https://th.wallhaven.cc/lg/fa/fav.jpg' },
            },
          ],
        },
        { headers: { 'content-type': 'application/json' } },
      );

    const res = await searchWallpapers({ query: 'x' });
    expect(res[0]).toMatchObject({ id: 'fav', favorites: 2145 });
  });
});
