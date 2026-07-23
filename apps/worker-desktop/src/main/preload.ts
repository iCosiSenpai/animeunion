import { contextBridge, ipcRenderer } from 'electron';
import { IPC, type LogLine, type WorkerApi } from '../shared/ipc';
import type { DesktopStatus } from '../shared/status';

/**
 * Bridge sicuro main↔renderer: espone `window.workerApi` con contextIsolation attivo. Nessun accesso
 * diretto a Node dal renderer.
 */
const api: WorkerApi = {
  getStatus: () => ipcRenderer.invoke(IPC.getStatus),
  restartWorker: () => ipcRenderer.invoke(IPC.restartWorker),
  onStatusChanged: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, status: DesktopStatus): void =>
      listener(status);
    ipcRenderer.on(IPC.statusChanged, handler);
    return () => {
      ipcRenderer.removeListener(IPC.statusChanged, handler);
    };
  },
  getAutostart: () => ipcRenderer.invoke(IPC.getAutostart),
  setAutostart: (enabled) => ipcRenderer.invoke(IPC.setAutostart, enabled),
  openLogs: () => ipcRenderer.invoke(IPC.openLogs),
  getLogs: () => ipcRenderer.invoke(IPC.getLogs),
  onLog: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, line: LogLine): void => listener(line);
    ipcRenderer.on(IPC.logLine, handler);
    return () => {
      ipcRenderer.removeListener(IPC.logLine, handler);
    };
  },
  getConnectionInfo: () => ipcRenderer.invoke(IPC.getConnectionInfo),
  discoverNas: () => ipcRenderer.invoke(IPC.discoverNas),
  enroll: (input) => ipcRenderer.invoke(IPC.enroll, input),
  gpuTest: () => ipcRenderer.invoke(IPC.gpuTest),
  allowFirewall: () => ipcRenderer.invoke(IPC.allowFirewall),
};

contextBridge.exposeInMainWorld('workerApi', api);
