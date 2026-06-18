// Libera le porte dev (API e web) terminando eventuali listener rimasti (processi "zombie"
// che causano EADDRINUSE). Dependency-free, cross-platform. Override con API_PORT/WEB_PORT.
import { execSync } from 'node:child_process';

const ports = [Number(process.env.API_PORT) || 3001, Number(process.env.WEB_PORT) || 3000];
const isWin = process.platform === 'win32';

function pidsOnPort(port) {
  try {
    if (isWin) {
      const out = execSync('netstat -ano -p tcp', { encoding: 'utf8' });
      const pids = new Set();
      for (const line of out.split('\n')) {
        const cols = line.trim().split(/\s+/);
        if (
          cols.length >= 5 &&
          cols[0] === 'TCP' &&
          cols[3] === 'LISTENING' &&
          cols[1].endsWith(`:${port}`)
        ) {
          pids.add(cols[4]);
        }
      }
      return [...pids];
    }
    const out = execSync(`lsof -ti tcp:${port} -sTCP:LISTEN`, { encoding: 'utf8' });
    return out
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function kill(pid) {
  try {
    execSync(isWin ? `taskkill /PID ${pid} /F` : `kill -9 ${pid}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

let freed = 0;
for (const port of ports) {
  for (const pid of pidsOnPort(port)) {
    if (kill(pid)) {
      freed += 1;
      console.log(`Porta ${port}: terminato processo ${pid}`);
    }
  }
}
console.log(freed > 0 ? `Liberate ${freed} porta/e.` : 'Nessuna porta da liberare.');
