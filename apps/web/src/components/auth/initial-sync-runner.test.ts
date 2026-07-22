import { describe, expect, it, vi } from 'vitest';
import {
  type CatalogSyncStatus,
  createInitialCatalogSyncCoordinator,
  runInitialCatalogSync,
} from './initial-sync-runner';

function status(running: boolean, lastSyncedAt: string | null): CatalogSyncStatus {
  return { running, lastSyncedAt };
}

function statusSequence(values: CatalogSyncStatus[]) {
  let index = 0;
  return vi.fn(async () => values[Math.min(index++, values.length - 1)] as CatalogSyncStatus);
}

describe('runInitialCatalogSync', () => {
  it('invalida anche un catalogo già sincronizzato per ripulire cache stale dopo un remount', async () => {
    const invalidateCatalog = vi.fn(async () => undefined);
    const startSync = vi.fn(async () => ({ started: true }));

    await expect(
      runInitialCatalogSync({
        fetchStatus: statusSequence([status(false, '2026-07-21T10:00:00.000Z')]),
        startSync,
        invalidateCatalog,
      }),
    ).resolves.toEqual({ started: false });

    expect(startSync).not.toHaveBeenCalled();
    expect(invalidateCatalog).toHaveBeenCalledOnce();
  });

  it('avvia la sync, ne osserva il completamento e invalida il catalogo', async () => {
    const fetchStatus = statusSequence([
      status(false, null),
      status(true, null),
      status(false, '2026-07-21T10:00:00.000Z'),
    ]);
    const startSync = vi.fn(async () => ({ started: true }));
    const invalidateCatalog = vi.fn(async () => undefined);

    await expect(
      runInitialCatalogSync({
        fetchStatus,
        startSync,
        invalidateCatalog,
        waitForPoll: async () => undefined,
      }),
    ).resolves.toEqual({ started: true });

    expect(startSync).toHaveBeenCalledOnce();
    expect(fetchStatus).toHaveBeenCalledTimes(3);
    expect(invalidateCatalog).toHaveBeenCalledOnce();
  });

  it('osserva una sync già in corso senza avviarne una seconda', async () => {
    const startSync = vi.fn(async () => ({ started: true }));
    const invalidateCatalog = vi.fn(async () => undefined);

    await expect(
      runInitialCatalogSync({
        fetchStatus: statusSequence([
          status(true, '2026-07-20T10:00:00.000Z'),
          status(false, '2026-07-21T10:00:00.000Z'),
        ]),
        startSync,
        invalidateCatalog,
      }),
    ).resolves.toEqual({ started: false });

    expect(startSync).not.toHaveBeenCalled();
    expect(invalidateCatalog).toHaveBeenCalledOnce();
  });

  it('non scambia per successo una sync concorrente fallita con timestamp precedente', async () => {
    const previous = '2026-07-20T10:00:00.000Z';
    const invalidateCatalog = vi.fn(async () => undefined);

    await expect(
      runInitialCatalogSync({
        fetchStatus: statusSequence([status(true, previous), status(false, previous)]),
        startSync: vi.fn(async () => ({ started: true })),
        invalidateCatalog,
      }),
    ).rejects.toThrow('non ha importato alcun anime');

    expect(invalidateCatalog).not.toHaveBeenCalled();
  });
});

describe('createInitialCatalogSyncCoordinator', () => {
  it('mantiene una sola operazione tra cleanup e remount di React Strict Mode', async () => {
    const coordinate = createInitialCatalogSyncCoordinator();
    let resolveOperation: ((value: { started: boolean }) => void) | undefined;
    const operation = new Promise<{ started: boolean }>((resolve) => {
      resolveOperation = resolve;
    });
    const run = vi.fn(() => operation);

    const firstObserver = coordinate(run);
    const remountedObserver = coordinate(run);

    expect(remountedObserver).toBe(firstObserver);
    expect(run).toHaveBeenCalledOnce();

    resolveOperation?.({ started: true });
    await expect(firstObserver).resolves.toEqual({ started: true });
  });

  it('dopo il completamento permette a un remount di invalidare nuovamente la cache', async () => {
    const coordinate = createInitialCatalogSyncCoordinator();
    const run = vi.fn(async () => ({ started: false }));

    await coordinate(run);
    await coordinate(run);

    expect(run).toHaveBeenCalledTimes(2);
  });
});
