import { describe, expect, it } from 'vitest';
import { NotFoundError } from '../lib/errors';
import { createMockSource } from '../sources/mock-source';
import { createTestDb, testLogger } from '../test/helpers';
import { createCatalogService } from './catalog-service';
import { createConfigService } from './config-service';
import { createFollowService } from './follow-service';

async function setup() {
  const db = createTestDb();
  const catalog = createCatalogService({
    db,
    source: createMockSource(),
    config: createConfigService({ db }),
    logger: testLogger,
  });
  const result = await catalog.search({ query: '', page: 1 });
  const animeId = result.data[0]?.id;
  if (!animeId) {
    throw new Error('catalogo mock vuoto');
  }
  return { db, service: createFollowService({ db }), animeId };
}

describe('FollowService', () => {
  it('add inserisce un follow e list lo ritorna con anime inline', async () => {
    const { service, animeId } = await setup();

    const follow = service.add({ animeId, status: 'watching' });

    expect(follow.animeId).toBe(animeId);
    expect(follow.status).toBe('watching');
    const list = service.list();
    expect(list).toHaveLength(1);
    expect(list[0]?.anime.id).toBe(animeId);
  });

  it('add su anime gia seguito aggiorna lo status (idempotente)', async () => {
    const { service, animeId } = await setup();
    const first = service.add({ animeId, status: 'plan_to_watch' });

    const second = service.add({ animeId, status: 'watching' });

    expect(second.id).toBe(first.id);
    expect(service.list()).toHaveLength(1);
    expect(service.list()[0]?.status).toBe('watching');
  });

  it('add con anime inesistente lancia NotFoundError', async () => {
    const { service } = await setup();
    expect(() => service.add({ animeId: 'non-esiste', status: 'watching' })).toThrow(NotFoundError);
  });

  it('updateStatus cambia lo status di un follow esistente', async () => {
    const { service, animeId } = await setup();
    service.add({ animeId, status: 'watching' });

    const updated = service.updateStatus({ animeId, status: 'completed' });

    expect(updated.status).toBe('completed');
    expect(service.list()[0]?.status).toBe('completed');
  });

  it('updateStatus senza follow lancia NotFoundError', async () => {
    const { service, animeId } = await setup();
    expect(() => service.updateStatus({ animeId, status: 'completed' })).toThrow(NotFoundError);
  });

  it('remove elimina il follow', async () => {
    const { service, animeId } = await setup();
    service.add({ animeId, status: 'watching' });

    service.remove(animeId);

    expect(service.list()).toHaveLength(0);
  });

  it('remove senza follow lancia NotFoundError', async () => {
    const { service, animeId } = await setup();
    expect(() => service.remove(animeId)).toThrow(NotFoundError);
  });
});
