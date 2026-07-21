import { describe, expect, it, vi } from 'vitest';
import { type Scheduler, startSchedulerThenListen } from './scheduler';

describe('scheduler bootstrap readiness', () => {
  it('attende la readiness dello scheduler prima di aprire la porta API', async () => {
    const events: string[] = [];
    let release = () => {};
    const ready = new Promise<void>((resolve) => {
      release = resolve;
    });
    const scheduler: Scheduler = {
      start: async () => {
        events.push('scheduler:start');
        await ready;
        events.push('scheduler:ready');
      },
      stop: vi.fn(),
    };
    const listen = vi.fn(async () => {
      events.push('api:listen');
    });

    const startup = startSchedulerThenListen(scheduler, listen);
    await Promise.resolve();
    expect(events).toEqual(['scheduler:start']);
    expect(listen).not.toHaveBeenCalled();

    release();
    await startup;
    expect(events).toEqual(['scheduler:start', 'scheduler:ready', 'api:listen']);
  });

  it('non apre la porta se la readiness fallisce', async () => {
    const scheduler: Scheduler = {
      start: async () => {
        throw new Error('reconcile fallito');
      },
      stop: vi.fn(),
    };
    const listen = vi.fn(async () => {});

    await expect(startSchedulerThenListen(scheduler, listen)).rejects.toThrow('reconcile fallito');
    expect(listen).not.toHaveBeenCalled();
  });
});
