import { and, eq, sql } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { createTestDb } from '../test/helpers';
import { schema } from './index';

// Verifica lo schema quality introdotto dalla migrazione 0018: l'unique di episode_file passa da
// (episode_id, language) a (episode_id, language, quality), cosi' la sorgente SD e le upscalate
// XQ/XQPLUS coesistono per lo stesso (episodio, lingua) senza collidere.
describe('episode_file quality (migrazione 0018)', () => {
  let db: ReturnType<typeof createTestDb>;
  const ts = '2026-07-07T00:00:00.000Z';

  beforeEach(() => {
    db = createTestDb();
    db.insert(schema.anime)
      .values({
        id: 'a-1',
        slug: 'naruto',
        title: 'Naruto',
        type: 'TV',
        status: 'ONGOING',
        episodeCount: 12,
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
    db.insert(schema.episode)
      .values({ id: 'e-1', animeId: 'a-1', number: 1, createdAt: ts, updatedAt: ts })
      .run();
  });

  function insertFile(
    id: string,
    language: 'SUB_ITA' | 'DUB_ITA',
    quality?: 'SD' | 'XQ' | 'XQPLUS',
  ) {
    db.insert(schema.episodeFile)
      .values({ id, episodeId: 'e-1', language, quality, createdAt: ts, updatedAt: ts })
      .run();
  }

  it('SUB/DUB × SD/XQ/XQPLUS coesistono per lo stesso episodio', () => {
    insertFile('f-sub-sd', 'SUB_ITA'); // quality omessa → default SD
    insertFile('f-dub-sd', 'DUB_ITA');
    insertFile('f-sub-xq', 'SUB_ITA', 'XQ');
    insertFile('f-sub-xqplus', 'SUB_ITA', 'XQPLUS');

    const rows = db
      .select()
      .from(schema.episodeFile)
      .where(eq(schema.episodeFile.episodeId, 'e-1'))
      .all();
    expect(rows).toHaveLength(4);

    // La quality omessa cade sul default 'SD'.
    const subSd = rows.find((r) => r.id === 'f-sub-sd');
    expect(subSd?.quality).toBe('SD');
  });

  it('duplicato esatto (episode, language, quality) viola lo unique', () => {
    insertFile('f-sub-sd', 'SUB_ITA', 'SD');
    expect(() => insertFile('f-sub-sd-bis', 'SUB_ITA', 'SD')).toThrow();
    // Stessa (episode, language) ma quality diversa: consentito.
    expect(() => insertFile('f-sub-xq', 'SUB_ITA', 'XQ')).not.toThrow();
  });

  it('lo unique legacy su (episode_id, language) e stato sostituito', () => {
    const indexes = db
      .all<{ name: string }>(sql`PRAGMA index_list('episode_file')`)
      .map((r) => r.name);
    expect(indexes).toContain('episode_file_episode_id_language_quality_unique');
    expect(indexes).not.toContain('episode_file_episode_id_language_unique');
  });

  it('lo unique combinato distingue le lingue (regressione: SUB e DUB SD non collidono)', () => {
    insertFile('f-sub-sd', 'SUB_ITA', 'SD');
    insertFile('f-dub-sd', 'DUB_ITA', 'SD');
    const sub = db
      .select()
      .from(schema.episodeFile)
      .where(and(eq(schema.episodeFile.language, 'SUB_ITA'), eq(schema.episodeFile.quality, 'SD')))
      .all();
    expect(sub).toHaveLength(1);
  });
});
