// Libère le port TCP passé en argument (défaut 3001) avant le démarrage du serveur.
// Évite l'erreur "EADDRINUSE: address already in use" causée par un processus résiduel.
const { execSync } = require('child_process');

const port = Number(process.argv[2] || 3001);
let command = '';

if (process.platform === 'win32') {
  command = `netstat -ano -p tcp | findstr :${port} | findstr LISTENING`;
} else if (process.platform === 'darwin' || process.platform === 'linux') {
  command = `lsof -ti tcp:${port}`;
} else {
  console.log(`free-port : plateforme ${process.platform} non gérée, port ${port} non vérifié.`);
  process.exit(0);
}

let pids = [];

try {
  const out = execSync(command, { encoding: 'utf8' });
  const lines = out.trim().split(/\r?\n/);
  const set = new Set();

  for (const line of lines) {
    const parts = line.trim().split(/\s+/);
    const last = parts[parts.length - 1];
    if (/^\d+$/.test(last)) {
      set.add(Number(last));
    }
  }

  if (process.platform === 'win32' && set.size === 0) {
    // netstat : le PID peut être absent si la ligne est mal découpée, re-tente
    for (const line of lines) {
      const m = line.match(/(\d+)\s*$/);
      if (m) set.add(Number(m[1]));
    }
  }

  pids = [...set];
} catch {
  // Aucun processus n'écoute sur ce port
}

if (pids.length === 0) {
  console.log(`free-port : port ${port} libre, aucun processus à arrêter.`);
  process.exit(0);
}

for (const pid of pids) {
  try {
    process.kill(pid);
    console.log(`free-port : port ${port} libéré (PID ${pid} arrêté).`);
  } catch (error) {
    if (error && error.code === 'ESRCH') {
      console.log(`free-port : PID ${pid} déjà terminé.`);
    } else if (error && error.code === 'EPERM') {
      console.log(`free-port : impossible d'arrêter le PID ${pid} (droits insuffisants).`);
    } else {
      console.log(`free-port : erreur en arrêtant le PID ${pid} : ${error.message}`);
    }
  }
}

process.exit(0);