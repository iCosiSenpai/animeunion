import type { DesktopStatus } from './status';

/**
 * Modello dati del menu del tray, puro e testabile. Il processo main lo traduce in `MenuItem`
 * Electron collegando le azioni per `id`. Niente emoji/icone qui: lo stato è nel testo.
 */
export interface TrayMenuItem {
  id: string;
  type: 'normal' | 'separator';
  label: string;
  enabled: boolean;
}

/** Etichetta di stato (usata come voce non cliccabile e come tooltip del tray). */
export function trayStatusLabel(status: DesktopStatus): string {
  return status.headline;
}

export function buildTrayTemplate(status: DesktopStatus): TrayMenuItem[] {
  return [
    { id: 'status', type: 'normal', label: trayStatusLabel(status), enabled: false },
    { id: 'sep-1', type: 'separator', label: '', enabled: true },
    { id: 'open', type: 'normal', label: 'Apri AnimeUnion Worker', enabled: true },
    {
      id: 'restart',
      type: 'normal',
      label: 'Riavvia worker',
      // Evita riavvii sovrapposti mentre un avvio è già in corso.
      enabled: status.worker.state !== 'starting',
    },
    { id: 'sep-2', type: 'separator', label: '', enabled: true },
    { id: 'quit', type: 'normal', label: 'Esci', enabled: true },
  ];
}
