import { describe, expect, it, vi } from 'vitest';
import type { Logger } from './logger';
import {
  type WorkerRuntimeConfig,
  type WorkerServer,
  createWorkerLifecycle,
} from './worker-lifecycle';

const silentLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
} as unknown as Logger;

const baseConfig: WorkerRuntimeConfig = {
  token: 'shared-token',
  ffmpegBin: 'ffmpeg',
  cacheDir: '/tmp/cache',
  workDir: '/tmp/work',
  port: 8787,
  host: '127.0.0.1',
};

function makeFakeServer(address = 'http://127.0.0.1:8787'): WorkerServer & {
  listen: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
} {
  return {
    listen: vi.fn(async () => address),
    close: vi.fn(async () => {}),
  };
}

describe('createWorkerLifecycle', () => {
  it('parte da stopped e passa a running con porta e host', async () => {
    const fake = makeFakeServer();
    const lc = createWorkerLifecycle({
      config: baseConfig,
      logger: silentLogger,
      createServerImpl: async () => fake,
    });

    expect(lc.getStatus().state).toBe('stopped');
    const status = await lc.start();
    expect(status).toEqual({ state: 'running', port: 8787, host: '127.0.0.1', error: null });
    expect(fake.listen).toHaveBeenCalledWith({ port: 8787, host: '127.0.0.1' });
  });

  it('e idempotente: start ripetuto non riapre un secondo listener', async () => {
    const fake = makeFakeServer();
    const createServerImpl = vi.fn(async () => fake);
    const lc = createWorkerLifecycle({
      config: baseConfig,
      logger: silentLogger,
      createServerImpl,
    });

    await lc.start();
    await lc.start();

    expect(createServerImpl).toHaveBeenCalledOnce();
    expect(fake.listen).toHaveBeenCalledOnce();
    expect(lc.getStatus().state).toBe('running');
  });

  it('start concorrenti condividono lo stesso avvio', async () => {
    const fake = makeFakeServer();
    const createServerImpl = vi.fn(async () => fake);
    const lc = createWorkerLifecycle({
      config: baseConfig,
      logger: silentLogger,
      createServerImpl,
    });

    await Promise.all([lc.start(), lc.start(), lc.start()]);

    expect(createServerImpl).toHaveBeenCalledOnce();
    expect(fake.listen).toHaveBeenCalledOnce();
  });

  it('ricava la porta effettiva dall indirizzo (porta effimera)', async () => {
    const fake = makeFakeServer('http://0.0.0.0:54321');
    const lc = createWorkerLifecycle({
      config: { ...baseConfig, port: 0, host: '0.0.0.0' },
      logger: silentLogger,
      createServerImpl: async () => fake,
    });

    const status = await lc.start();
    expect(status.port).toBe(54321);
  });

  it('in errore di avvio rilancia e registra lo stato error', async () => {
    const lc = createWorkerLifecycle({
      config: baseConfig,
      logger: silentLogger,
      createServerImpl: async () => {
        throw new Error('EADDRINUSE 8787');
      },
    });

    await expect(lc.start()).rejects.toThrow('EADDRINUSE 8787');
    const status = lc.getStatus();
    expect(status.state).toBe('error');
    expect(status.error).toContain('EADDRINUSE');
    expect(status.port).toBeNull();
  });

  it('stop chiude il server e torna a stopped (idempotente)', async () => {
    const fake = makeFakeServer();
    const lc = createWorkerLifecycle({
      config: baseConfig,
      logger: silentLogger,
      createServerImpl: async () => fake,
    });

    await lc.start();
    const stopped = await lc.stop();
    expect(stopped.state).toBe('stopped');
    expect(stopped.port).toBeNull();
    expect(fake.close).toHaveBeenCalledOnce();

    // Secondo stop: nessuna nuova chiusura.
    await lc.stop();
    expect(fake.close).toHaveBeenCalledOnce();
  });

  it('espone una copia della config', async () => {
    const lc = createWorkerLifecycle({ config: baseConfig, logger: silentLogger });
    const cfg = lc.getConfig();
    expect(cfg).toEqual(baseConfig);
    expect(cfg).not.toBe(baseConfig);
  });
});
