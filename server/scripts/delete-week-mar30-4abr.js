/**
 * Borra todos los viajes de lun 30 mar – sáb 4 abr 2026.
 * Uso: desde logistica → node server/scripts/delete-week-mar30-4abr.js
 */
import dotenv from "dotenv";
import mysql from "mysql2/promise";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../../.env") });

const DESDE = "2026-03-30";
const HASTA = "2026-04-04";

async function main() {
  const pool = mysql.createPool({
    host: process.env.MYSQL_HOST || "127.0.0.1",
    port: Number(process.env.MYSQL_PORT) || 3306,
    user: process.env.MYSQL_USER || "root",
    password: process.env.MYSQL_PASSWORD || "",
    database: process.env.MYSQL_DATABASE || "logistica_entregas",
    dateStrings: true,
  });

  const [r] = await pool.query(
    "DELETE FROM viajes WHERE fecha >= ? AND fecha <= ?",
    [DESDE, HASTA]
  );
  const n = r.affectedRows ?? 0;
  console.log(`Listo: ${n} viaje(s) eliminado(s) (${DESDE} – ${HASTA}).`);
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
