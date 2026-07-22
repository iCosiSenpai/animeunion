import { contextBridge, ipcRenderer } from 'electron';
import { IPC, type WorkerApi } from '../shared/ipc';
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
  getPairingInfo: () => ipcRenderer.invoke(IPC.getPairingInfo),
  pair: (input) => ipcRenderer.invoke(IPC.pair, input),
};

contextBridge.exposeInMainWorld('workerApi', api);
