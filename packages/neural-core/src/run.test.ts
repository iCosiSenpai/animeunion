import { describe, expect, it } from 'vitest';
import { parseProgress } from './run';

describe('parseProgress', () => {
  it('estrae la frazione dall ultimo time= data la durata', () => {
    // 00:00:30 su 60s = 0.5
    expect(parseProgress('frame=1 time=00:00:30.00 bitrate=1', 60)).toBeCloseTo(0.5, 3);
  });

  it('usa l ultimo match del chunk', () => {
    const chunk = 'time=00:00:10.00 ... time=00:00:45.00';
    expect(parseProgress(chunk, 90)).toBeCloseTo(0.5, 3);
  });

  it('clampa a 1 se time supera la durata', () => {
    expect(parseProgress('time=00:02:00.00', 60)).toBe(1);
  });

  it('ritorna null senza time=', () => {
    expect(parseProgress('nessun timecode', 60)).toBeNull();
  });

  it('ritorna null con durata non valida', () => {
    expect(parseProgress('time=00:00:30.00', 0)).toBeNull();
  });
});
