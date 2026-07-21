import { describe, expect, it } from 'vitest';
import { shouldShowSetup } from './setup-state';

describe('shouldShowSetup', () => {
  it('mostra il wizard su una nuova installazione', () => {
    expect(shouldShowSetup({ seriesPathSub: '', setupCompleted: null })).toBe(true);
  });

  it('mantiene il wizard durante il setup anche dopo il salvataggio della cartella', () => {
    expect(shouldShowSetup({ seriesPathSub: '/media/Anime', setupCompleted: false })).toBe(true);
  });

  it('considera configurata una installazione legacy con cartella base', () => {
    expect(shouldShowSetup({ seriesPathSub: '/media/Anime', setupCompleted: null })).toBe(false);
  });

  it('entra nell’app solo dopo il completamento esplicito', () => {
    expect(shouldShowSetup({ seriesPathSub: '/media/Anime', setupCompleted: true })).toBe(false);
  });

  it('riapre il wizard se la cartella obbligatoria viene rimossa', () => {
    expect(shouldShowSetup({ seriesPathSub: '   ', setupCompleted: true })).toBe(true);
  });
});
