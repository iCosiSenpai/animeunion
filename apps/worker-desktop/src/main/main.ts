import { networkInterfaces } from 'node:os';
import { join } from 'node:path';
import {
  type WorkerLifecycle,
  createWorkerLifecycle,
  evaluateFfmpeg,
  runGpuSelfTest,
} from '@animeunion/worker';
import { BrowserWindow, Menu, Tray, app, ipcMain, nativeImage, shell } from 'electron';
import {
  type ConnectionInfo,
  type EnrollInput,
  type EnrollOutcome,
  type FirewallResult,
  type GpuTestResult,
  IPC,
} from '../shared/ipc';
import { detectLanIp } from '../shared/net';
import { buildWorkerUrl, normalizeBaseUrl } from '../shared/pairing';
import { type DesktopStatus, type GpuReadiness, deriveDesktopStatus } from '../shared/status';
import { buildTrayTemplate } from '../shared/tray-menu';
import { loadConfig, updateConfig } from './app-store';
import { discoverNasUrls } from './discovery';
import { callEnroll } from './enroll-client';
import { resolveAppFfmpeg } from './ffmpeg-path';
import { addFirewallRule } from './firewall';
import { createCapturingLogger } from './logging';
import { initAutoUpdater } from './updater';

/**
 * Processo main dell'app desktop. Incorpora il worker via `createWorkerLifecycle`, esegue il probe
 * ffmpeg/GPU periodico, e riflette lo stato combinato su GUI e tray. Istanza singola; niente
 * chiusura all'ultima finestra (resta nel tray finché non si sceglie "Esci").
 */

// Logger dell'app con cattura in-memory: le stesse righe vanno su stdout, in un ring buffer per la
// sidebar dei log e in un evento push verso il renderer.
const { logger, getLines: getLogLines, onLine: onLogLine } = createCapturingLogger();

const GPU_PROBE_INTERVAL_MS = 30_000;

let lifecycle: WorkerLifecycle | null = null;
let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let gpu: GpuReadiness | null = null;
let ffmpegBin = 'ffmpeg';
let probeTimer: NodeJS.Timeout | null = null;
let isQuitting = false;

function currentStatus(): DesktopStatus {
  const worker = lifecycle?.getStatus() ?? {
    state: 'stopped' as const,
    port: null,
    host: null,
    error: null,
  };
  return deriveDesktopStatus(worker, gpu);
}

function broadcast(): void {
  const status = currentStatus();
  mainWindow?.webContents.send(IPC.statusChanged, status);
  refreshTray(status);
}

async function probeGpu(): Promise<void> {
  try {
    const { readiness } = await evaluateFfmpeg(ffmpegBin);
    gpu = readiness;
  } catch (error) {
    logger.warn({ err: error }, 'Probe GPU fallito');
    gpu = {
      ok: false,
      level: 'error',
      title: 'Impossibile verificare ffmpeg/GPU',
      hint: 'Riprova o reinstalla l’app.',
    };
  }
  broadcast();
}

function trayIcon(): Electron.NativeImage {
  // In produzione la tray icon è imbarcata come extraResource (resources/tray.png); in dev sta in
  // build/. In mancanza si usa un'immagine vuota: il tray resta funzionale.
  const iconPath = app.isPackaged
    ? join(process.resourcesPath, 'tray.png')
    : join(app.getAppPath(), 'assets', 'tray.png');
  const icon = nativeImage.createFromPath(iconPath);
  return icon.isEmpty() ? nativeImage.createEmpty() : icon;
}

function refreshTray(status: DesktopStatus): void {
  if (!tray) {
    return;
  }
  const template = buildTrayTemplate(status).map((item) => {
    if (item.type === 'separator') {
      return { type: 'separator' as const };
    }
    return {
      label: item.label,
      enabled: item.enabled,
      click: () => handleTrayAction(item.id),
    };
  });
  tray.setToolTip(`AnimeUnion Worker — ${status.headline}`);
  tray.setContextMenu(Menu.buildFromTemplate(template));
}

function handleTrayAction(id: string): void {
  if (id === 'open') {
    showWindow();
  } else if (id === 'restart') {
    void restartWorker();
  } else if (id === 'quit') {
    isQuitting = true;
    app.quit();
  }
}

function showWindow(): void {
  if (!mainWindow) {
    createWindow();
    return;
  }
  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.show();
  mainWindow.focus();
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 660,
    minWidth: 720,
    minHeight: 520,
    show: false,
    autoHideMenuBar: true,
    title: 'AnimeUnion Worker',
    backgroundColor: '#0b0f19',
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    void mainWindow.loadURL(devUrl);
  } else {
    void mainWindow.loadFile(join(__dirname, '..', 'renderer', 'index.html'));
  }

  mainWindow.once('ready-to-show', () => mainWindow?.show());
  // Chiudere la finestra la nasconde soltanto: l'app resta viva nel tray.
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

async function restartWorker(): Promise<DesktopStatus> {
  if (!lifecycle) {
    return currentStatus();
  }
  await lifecycle.stop();
  broadcast();
  await lifecycle.start().catch((error) => {
    logger.error({ err: error }, 'Riavvio worker fallito');
  });
  await probeGpu();
  return currentStatus();
}

function portFromUrl(url: string): number | null {
  try {
    const parsed = new URL(url);
    return parsed.port ? Number(parsed.port) : null;
  } catch {
    return null;
  }
}

function registerIpc(): void {
  ipcMain.handle(IPC.getStatus, () => currentStatus());
  ipcMain.handle(IPC.restartWorker, () => restartWorker());
  ipcMain.handle(IPC.getAutostart, () => app.getLoginItemSettings().openAtLogin);
  ipcMain.handle(IPC.setAutostart, (_event, enabled: boolean) => {
    app.setLoginItemSettings({ openAtLogin: enabled });
    updateConfig({ autostart: enabled });
    return app.getLoginItemSettings().openAtLogin;
  });
  ipcMain.handle(IPC.openLogs, async () => {
    await shell.openPath(app.getPath('logs'));
  });
  ipcMain.handle(IPC.getLogs, () => getLogLines());
  ipcMain.handle(IPC.getConnectionInfo, (): ConnectionInfo => {
    const config = loadConfig();
    const ip = detectLanIp(networkInterfaces());
    return {
      animeunionUrl: config.animeunionUrl,
      workerName: config.workerName,
      lanIp: ip,
      workerUrl: ip ? buildWorkerUrl(ip, config.port) : null,
      port: config.port,
      needsFirewallHint: process.platform === 'win32',
    };
  });
  ipcMain.handle(IPC.discoverNas, async (): Promise<string[]> => {
    const config = loadConfig();
    const ip = detectLanIp(networkInterfaces());
    if (!ip) {
      return [];
    }
    // Sonda la porta di default del NAS (7979) più quella già salvata, se presente.
    const ports = new Set<number>([7979]);
    const savedPort = portFromUrl(config.animeunionUrl);
    if (savedPort) {
      ports.add(savedPort);
    }
    return discoverNasUrls(ip, [...ports]);
  });
  ipcMain.handle(IPC.enroll, async (_event, input: EnrollInput): Promise<EnrollOutcome> => {
    const config = loadConfig();
    const ip = detectLanIp(networkInterfaces());
    if (!ip) {
      return {
        ok: false,
        reachable: false,
        ffmpegCapable: false,
        message: 'Impossibile rilevare l’IP LAN del PC',
      };
    }
    const workerUrl = buildWorkerUrl(ip, config.port);
    const outcome = await callEnroll(
      input.animeunionUrl,
      workerUrl,
      config.workerToken,
      config.workerName,
    );
    if (outcome.ok) {
      const base = normalizeBaseUrl(input.animeunionUrl);
      if (base) {
        updateConfig({ animeunionUrl: base });
      }
    }
    return outcome;
  });
  ipcMain.handle(IPC.gpuTest, (): Promise<GpuTestResult> => runGpuSelfTest(ffmpegBin));
  ipcMain.handle(IPC.allowFirewall, (): Promise<FirewallResult> => {
    const config = loadConfig();
    return addFirewallRule(config.port);
  });
}

async function bootstrap(): Promise<void> {
  const config = loadConfig();
  ffmpegBin = resolveAppFfmpeg();
  app.setLoginItemSettings({ openAtLogin: config.autostart });

  lifecycle = createWorkerLifecycle({
    config: {
      token: config.workerToken,
      ffmpegBin,
      cacheDir: join(app.getPath('userData'), 'shaders'),
      workDir: join(app.getPath('userData'), 'work'),
      port: config.port,
      host: config.host,
      name: config.workerName,
      version: app.getVersion(),
    },
    logger,
  });

  createTray();
  createWindow();
  registerIpc();

  // Inoltra ogni nuova riga di log al renderer (sidebar log in tempo reale).
  onLogLine((line) => {
    mainWindow?.webContents.send(IPC.logLine, line);
  });

  await lifecycle.start().catch((error) => {
    logger.error({ err: error }, 'Avvio worker fallito');
  });
  broadcast();
  await probeGpu();

  probeTimer = setInterval(() => void probeGpu(), GPU_PROBE_INTERVAL_MS);
  probeTimer.unref?.();

  // Auto-update solo nell'app pacchettizzata (in dev non c'è un feed di release).
  if (app.isPackaged) {
    initAutoUpdater();
  }
}

function createTray(): void {
  try {
    tray = new Tray(trayIcon());
    tray.on('click', () => showWindow());
    refreshTray(currentStatus());
  } catch (error) {
    logger.warn({ err: error }, 'Creazione tray fallita (icona mancante?)');
  }
}

// Istanza singola: un secondo avvio riporta in primo piano la finestra esistente.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => showWindow());

  app
    .whenReady()
    .then(bootstrap)
    .catch((error) => {
      logger.error({ err: error }, 'Bootstrap app desktop fallito');
      app.quit();
    });

  app.on('window-all-closed', () => {
    // Tray app: non usciamo alla chiusura delle finestre (solo da "Esci").
  });

  app.on('before-quit', async (event) => {
    if (probeTimer) {
      clearInterval(probeTimer);
      probeTimer = null;
    }
    if (lifecycle && lifecycle.getStatus().state !== 'stopped') {
      event.preventDefault();
      await lifecycle.stop().catch(() => {});
      lifecycle = null;
      app.quit();
    }
  });
}
