import { spawn } from 'node:child_process';
import type { FirewallResult } from '../shared/ipc';

/**
 * Aggiunge una regola Windows Firewall in ingresso per la porta TCP del worker, così il NAS lo
 * raggiunge sulla LAN. Richiede privilegi elevati: usa PowerShell `Start-Process -Verb RunAs`, che
 * mostra il prompt UAC all'utente (nessuna elevazione silenziosa). Idempotente: rimuove e ricrea la
 * regola. Se l'utente rifiuta l'UAC, ritorna ok:false con un messaggio esplicativo.
 */
const RULE_NAME = 'AnimeUnion Worker';

export function addFirewallRule(port: number): Promise<FirewallResult> {
  return new Promise((resolvePromise) => {
    if (process.platform !== 'win32') {
      resolvePromise({ ok: false, message: 'Disponibile solo su Windows.' });
      return;
    }
    // Comandi cmd: rimuove un'eventuale regola precedente e ne aggiunge una per la porta TCP in ingresso.
    const inner = `netsh advfirewall firewall delete rule name="${RULE_NAME}" >NUL 2>&1 & netsh advfirewall firewall add rule name="${RULE_NAME}" dir=in action=allow protocol=TCP localport=${port}`;
    // Eleva via PowerShell: Start-Process cmd -Verb RunAs mostra l'UAC. -Wait per attendere l'esito.
    const psCommand = `$p = Start-Process -FilePath cmd.exe -ArgumentList '/c ${inner}' -Verb RunAs -WindowStyle Hidden -PassThru -Wait; exit $p.ExitCode`;

    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(
        'powershell.exe',
        ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psCommand],
        { windowsHide: true },
      );
    } catch {
      resolvePromise({ ok: false, message: 'Impossibile avviare PowerShell.' });
      return;
    }

    let err = '';
    child.stderr?.on('data', (chunk: Buffer) => {
      err += chunk.toString();
    });
    child.on('error', () =>
      resolvePromise({ ok: false, message: 'Impossibile avviare PowerShell.' }),
    );
    child.on('close', (code) => {
      if (code === 0) {
        resolvePromise({ ok: true, message: `Regola firewall creata per la porta TCP ${port}.` });
      } else {
        resolvePromise({
          ok: false,
          message:
            err.trim() ||
            `Regola non creata: consenti l'elevazione (UAC) oppure aggiungila a mano per la porta TCP ${port}.`,
        });
      }
    });
  });
}
