/**
 * Inicializa .mysql-data si hace falta y arranca mysqld (Windows).
 * Usa rutas cortas 8.3 para datadir y basedir (evita fallo InnoDB undo en MySQL 8.4).
 */
import { spawn, spawnSync, execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import net from "net";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const dataDirLong = path.join(root, ".mysql-data");
const basedirLong = "C:\\Program Files\\MySQL\\MySQL Server 8.4";
const mysqld = path.join(basedirLong, "bin", "mysqld.exe");

function winShortPath(longPath) {
  const escaped = longPath.replace(/'/g, "''");
  const cmd = `(New-Object -ComObject Scripting.FileSystemObject).GetFolder('${escaped}').ShortPath`;
  return execFileSync("powershell.exe", ["-NoProfile", "-STA", "-Command", cmd], {
    encoding: "utf8",
  }).trim();
}

function portOpen(port, host = "127.0.0.1", timeout = 1000) {
  return new Promise((resolve) => {
    const s = net.createConnection({ port, host }, () => {
      s.end();
      resolve(true);
    });
    s.on("error", () => resolve(false));
    s.setTimeout(timeout, () => {
      s.destroy();
      resolve(false);
    });
  });
}

async function main() {
  if (!fs.existsSync(mysqld)) {
    console.error("No se encontró:", mysqld);
    console.error("Instalá MySQL Server 8.4 o editá basedirLong en scripts/start-mysql.js");
    process.exit(1);
  }

  if (await portOpen(3306)) {
    console.log("127.0.0.1:3306 ya está en uso.");
    process.exit(0);
  }

  fs.mkdirSync(dataDirLong, { recursive: true });
  const dataDir = winShortPath(path.resolve(dataDirLong));
  const basedir = winShortPath(basedirLong);

  const marker = path.join(dataDirLong, "mysql");
  if (!fs.existsSync(marker)) {
    console.log("Inicializando MySQL en", dataDirLong);
    const init = spawnSync(
      mysqld,
      ["--initialize-insecure", `--datadir=${dataDir}`, `--basedir=${basedir}`],
      { stdio: "inherit", cwd: dataDirLong }
    );
    if (init.status !== 0) {
      process.exit(init.status ?? 1);
    }
  }

  const args = [
    `--datadir=${dataDir}`,
    `--basedir=${basedir}`,
    "--port=3306",
    "--bind-address=127.0.0.1",
  ];

  console.log("Arrancando mysqld…");
  const child = spawn(mysqld, args, {
    cwd: dataDirLong,
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.unref();

  for (let i = 0; i < 50; i++) {
    await new Promise((r) => setTimeout(r, 400));
    if (await portOpen(3306, "127.0.0.1", 800)) {
      console.log("MySQL listo en 127.0.0.1:3306");
      process.exit(0);
    }
  }

  console.error("Timeout esperando el puerto 3306. Revisá .mysql-data\\*.err");
  process.exit(1);
}

main();
