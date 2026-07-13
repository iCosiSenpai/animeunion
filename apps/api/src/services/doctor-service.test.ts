import { describe, expect, it, vi } from 'vitest';
import type { DownloadDirStatus } from './config-service';
import { type DoctorServiceDeps, createDoctorService } from './doctor-service';

type CreatedNotification = { type: string; title: string; body?: string | null };

/** Fabbrica di deps configurabili: ogni test regola solo ciò che gli serve. */
function makeDeps(overrides: {
  dirs?: DownloadDirStatus[];
  roots?: string[];
  free?: number | null;
  authed?: boolean;
  jellyfin?: { url?: string; key?: string; ok?: boolean; error?: string };
  onWritableRestored?: () => void;
}) {
  const created: CreatedNotification[] = [];
  const jfUrl = overrides.jellyfin?.url ?? '';
  const jfKey = overrides.jellyfin?.key ?? '';

  const deps: DoctorServiceDeps = {
    config: {
      downloadDirsStatus: async () => overrides.dirs ?? [],
      distinctDownloadRoots: () => overrides.roots ?? [],
      get: ((key: string) => {
        if (key === 'jellyfinServerUrl') return jfUrl;
        if (key === 'jellyfinApiKey') return jfKey;
        return '';
      }) as DoctorServiceDeps['config']['get'],
    },
    auth: { status: () => ({ authenticated: overrides.authed ?? true }) as never },
    jellyfin: {
      testConnection: async () => ({
        ok: overrides.jellyfin?.ok ?? true,
        error: overrides.jellyfin?.error,
      }),
    },
    notifications: {
      create: ((input: CreatedNotification) => {
        created.push(input);
        return input as never;
      }) as DoctorServiceDeps['notifications']['create'],
    },
    freeDiskBytes: async () => overrides.free ?? null,
    onWritableRestored: overrides.onWritableRestored,
  };
  return { deps, created };
}

function dir(key: string, path: string, writable: boolean): DownloadDirStatus {
  return {
    key: key as DownloadDirStatus['key'],
    label: key,
    path,
    configured: true,
    exists: true,
    writable,
  };
}

describe('DoctorService', () => {
  it('dir non scrivibile → check critico + notifica di allerta', async () => {
    const { deps, created } = makeDeps({ dirs: [dir('seriesPathSub', '/media/Anime', false)] });
    const doctor = createDoctorService(deps);

    const state = await doctor.runChecks();

    expect(state.healthy).toBe(false);
    expect(state.criticalCount).toBe(1);
    const check = state.checks.find((c) => c.category === 'writable');
    expect(check?.status).toBe('critical');
    expect(created.filter((n) => n.type === 'doctor_alert')).toHaveLength(1);
    expect(created.filter((n) => n.type === 'doctor_resolved')).toHaveLength(0);
  });

  it('dir tornata scrivibile → clear + notifica di ripristino', async () => {
    // Primo tick: critico.
    const broken = makeDeps({ dirs: [dir('seriesPathSub', '/media/Anime', false)] });
    const doctor = createDoctorService(broken.deps);
    await doctor.runChecks();
    expect(broken.created.filter((n) => n.type === 'doctor_alert')).toHaveLength(1);

    // Secondo tick sullo STESSO service ma con la dir tornata scrivibile: riuso le deps mutando
    // il comportamento di downloadDirsStatus.
    let writable = false;
    broken.deps.config.downloadDirsStatus = async () => [
      dir('seriesPathSub', '/media/Anime', writable),
    ];
    writable = true;
    const state = await doctor.runChecks();

    expect(state.healthy).toBe(true);
    expect(state.criticalCount).toBe(0);
    expect(broken.created.filter((n) => n.type === 'doctor_resolved')).toHaveLength(1);
  });

  it('critico ripetuto non genera notifiche duplicate', async () => {
    const { deps, created } = makeDeps({ dirs: [dir('seriesPathSub', '/media/Anime', false)] });
    const doctor = createDoctorService(deps);

    await doctor.runChecks();
    await doctor.runChecks();
    await doctor.runChecks();

    expect(created.filter((n) => n.type === 'doctor_alert')).toHaveLength(1);
  });

  it('spazio disco sotto soglia → critico; API non autenticata → critico', async () => {
    const { deps, created } = makeDeps({
      roots: ['/media/Anime'],
      free: 500 * 1024 * 1024, // < 1 GiB
      authed: false,
    });
    const doctor = createDoctorService(deps);

    const state = await doctor.runChecks();

    expect(state.checks.find((c) => c.category === 'disk')?.status).toBe('critical');
    expect(state.checks.find((c) => c.category === 'api')?.status).toBe('critical');
    expect(created.filter((n) => n.type === 'doctor_alert')).toHaveLength(2);
  });

  it('Jellyfin monitorato solo se configurato', async () => {
    const off = makeDeps({});
    const doctorOff = createDoctorService(off.deps);
    const stateOff = await doctorOff.runChecks();
    expect(stateOff.checks.find((c) => c.category === 'jellyfin')).toBeUndefined();

    const on = makeDeps({
      jellyfin: { url: 'http://jf', key: 'abc', ok: false, error: 'Server non raggiungibile.' },
    });
    const doctorOn = createDoctorService(on.deps);
    const stateOn = await doctorOn.runChecks();
    expect(stateOn.checks.find((c) => c.category === 'jellyfin')?.status).toBe('critical');
  });

  it('getState ritorna lo snapshot senza rieseguire i controlli', async () => {
    const probe = vi.fn(async () => [] as DownloadDirStatus[]);
    const { deps } = makeDeps({});
    deps.config.downloadDirsStatus = probe;
    const doctor = createDoctorService(deps);

    await doctor.runChecks();
    const calls = probe.mock.calls.length;
    doctor.getState();
    expect(probe.mock.calls.length).toBe(calls); // getState non richiama i controlli
  });

  it('cartella tornata scrivibile → onWritableRestored invocato una sola volta', async () => {
    const onWritableRestored = vi.fn();
    const deps = makeDeps({
      dirs: [dir('seriesPathSub', '/media/Anime', false)],
      onWritableRestored,
    }).deps;
    const doctor = createDoctorService(deps);

    await doctor.runChecks(); // critico: nessun ripristino
    expect(onWritableRestored).not.toHaveBeenCalled();

    let writable = false;
    deps.config.downloadDirsStatus = async () => [dir('seriesPathSub', '/media/Anime', writable)];
    writable = true;
    await doctor.runChecks(); // ok: transizione → callback

    expect(onWritableRestored).toHaveBeenCalledTimes(1);

    await doctor.runChecks(); // resta ok: nessun nuovo invito
    expect(onWritableRestored).toHaveBeenCalledTimes(1);
  });

  it('nessun ripristino ambientale → onWritableRestored non invocato', async () => {
    // Solo l'API transita da critica a ok: non deve triggerare la ripresa download (categoria api).
    const onWritableRestored = vi.fn();
    const deps = makeDeps({ authed: false, onWritableRestored }).deps;
    const doctor = createDoctorService(deps);

    await doctor.runChecks(); // api critica
    deps.auth.status = () => ({ authenticated: true }) as never;
    await doctor.runChecks(); // api ok

    expect(onWritableRestored).not.toHaveBeenCalled();
  });

  it('un errore in onWritableRestored non fa cadere il tick', async () => {
    const deps = makeDeps({
      dirs: [dir('seriesPathSub', '/media/Anime', false)],
      onWritableRestored: () => {
        throw new Error('boom');
      },
    }).deps;
    const doctor = createDoctorService(deps);

    await doctor.runChecks();
    let writable = false;
    deps.config.downloadDirsStatus = async () => [dir('seriesPathSub', '/media/Anime', writable)];
    writable = true;

    const state = await doctor.runChecks();
    expect(state.healthy).toBe(true); // il tick completa nonostante il callback lanci
  });
});
