/**
 * Crea la base de datos si no existe (conexión sin esquema).
 * Uso: node server/ensure-database.js
 */
import mysql from "mysql2/promise";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const dbName = process.env.MYSQL_DATABASE || "logistica_entregas";

async function main() {
  if (!/^[a-zA-Z0-9_]+$/.test(dbName)) {
    throw new Error("MYSQL_DATABASE solo puede contener letras, números y _");
  }
  const conn = await mysql.createConnection({
    host: process.env.MYSQL_HOST || "127.0.0.1",
    port: Number(process.env.MYSQL_PORT) || 3306,
    user: process.env.MYSQL_USER || "root",
    password: process.env.MYSQL_PASSWORD ?? "",
  });
  try {
    await conn.query(
      `CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
    console.log(`Base de datos lista: ${dbName}`);
  } finally {
    await conn.end();
  }
}

main().catch((e) => {
  console.error("No se pudo crear la base de datos:", e.message);
  console.error(
    "\nComprobá que MySQL o MariaDB esté instalado y en ejecución, y que MYSQL_USER / MYSQL_PASSWORD en .env sean correctos."
  );
  process.exit(1);
});
