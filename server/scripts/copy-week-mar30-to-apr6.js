/**
 * Copia todos los viajes de lun 30 mar – sáb 4 abr 2026 a lun 6 – sáb 11 abr 2026
 * (misma hora/slot y mismos datos; entregado = 0 en la copia).
 * No inserta si ya hay un viaje en la casilla destino.
 *
 * Uso: desde la carpeta logistica → node server/scripts/copy-week-mar30-to-apr6.js
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

  const conn = await pool.getConnection();
  try {
    const [r] = await conn.query(
      `INSERT INTO viajes (fecha, slot, cliente_id, chofer_id, patente, producto_id, precio, tipo_venta, observaciones, entregado)
       SELECT DATE_ADD(v.fecha, INTERVAL 7 DAY),
              v.slot,
              v.cliente_id,
              v.chofer_id,
              v.patente,
              v.producto_id,
              v.precio,
              v.tipo_venta,
              v.observaciones,
              0
       FROM viajes v
       LEFT JOIN viajes ex ON ex.fecha = DATE_ADD(v.fecha, INTERVAL 7 DAY) AND ex.slot = v.slot
       WHERE v.fecha >= ? AND v.fecha <= ?
         AND ex.id IS NULL`,
      [DESDE, HASTA]
    );
    const n = r.affectedRows ?? 0;
    console.log(`Listo: ${n} viaje(s) copiado(s) a la semana 6–11 abr (casillas libres).`);
  } finally {
    conn.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
