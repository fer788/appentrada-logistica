import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

const pool = mysql.createPool({
  host: process.env.MYSQL_HOST || "127.0.0.1",
  port: Number(process.env.MYSQL_PORT) || 3306,
  user: process.env.MYSQL_USER || "root",
  password: process.env.MYSQL_PASSWORD || "",
  database: process.env.MYSQL_DATABASE || "logistica_entregas",
  waitForConnections: true,
  connectionLimit: 10,
  dateStrings: true,
});

export async function initSchema() {
  const conn = await pool.getConnection();
  try {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS clientes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nombre VARCHAR(200) NOT NULL,
        notas TEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    await conn.query(`
      CREATE TABLE IF NOT EXISTS choferes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nombre VARCHAR(200) NOT NULL,
        telefono VARCHAR(40) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    await conn.query(`
      CREATE TABLE IF NOT EXISTS productos (
        id INT AUTO_INCREMENT PRIMARY KEY,
        codigo VARCHAR(32) NOT NULL UNIQUE,
        nombre VARCHAR(120) NOT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    await conn.query(`
      CREATE TABLE IF NOT EXISTS viajes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        fecha DATE NOT NULL,
        slot TINYINT NOT NULL,
        cliente_id INT NOT NULL,
        chofer_id INT NULL,
        patente VARCHAR(20) NULL,
        producto_id INT NOT NULL,
        precio DECIMAL(14,2) NOT NULL DEFAULT 0,
        tipo_venta VARCHAR(80) NOT NULL DEFAULT '',
        observaciones TEXT NULL,
        entregado TINYINT(1) NOT NULL DEFAULT 0,
        anulado TINYINT(1) NOT NULL DEFAULT 0,
        motivo_anulacion VARCHAR(40) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_viaje_cliente FOREIGN KEY (cliente_id) REFERENCES clientes(id),
        CONSTRAINT fk_viaje_chofer FOREIGN KEY (chofer_id) REFERENCES choferes(id),
        CONSTRAINT fk_viaje_producto FOREIGN KEY (producto_id) REFERENCES productos(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await migrateViajesChoferPatenteNullable(conn);
    await migrateViajesEntregado(conn);
    await migrateViajesAnulacion(conn);

    const [rows] = await conn.query(
      "SELECT COUNT(*) AS c FROM productos"
    );
    if (rows[0].c === 0) {
      await conn.query(`
        INSERT INTO productos (codigo, nombre) VALUES
        ('G1', 'Granel 1'),
        ('G2', 'Granel 2'),
        ('G3', 'Granel 3')
      `);
    }
  } finally {
    conn.release();
  }
}

/** Bases creadas antes: chofer_id y patente eran NOT NULL. */
async function migrateViajesChoferPatenteNullable(conn) {
  const [[col]] = await conn.query(
    `SELECT IS_NULLABLE AS n FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'viajes' AND COLUMN_NAME = 'patente'`
  );
  if (!col || col.n === "YES") return;

  const [fks] = await conn.query(
    `SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'viajes'
     AND REFERENCED_TABLE_NAME = 'choferes' AND COLUMN_NAME = 'chofer_id'
     LIMIT 1`
  );
  if (fks.length > 0) {
    await conn.query(
      `ALTER TABLE viajes DROP FOREIGN KEY \`${fks[0].CONSTRAINT_NAME}\``
    );
  }
  await conn.query(
    `ALTER TABLE viajes MODIFY COLUMN chofer_id INT NULL,
     MODIFY COLUMN patente VARCHAR(20) NULL`
  );
  await conn.query(
    `ALTER TABLE viajes ADD CONSTRAINT fk_viaje_chofer FOREIGN KEY (chofer_id) REFERENCES choferes(id)`
  );
}

async function migrateViajesEntregado(conn) {
  const [[row]] = await conn.query(
    `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'viajes' AND COLUMN_NAME = 'entregado'`
  );
  if (row.c > 0) return;
  await conn.query(
    `ALTER TABLE viajes ADD COLUMN entregado TINYINT(1) NOT NULL DEFAULT 0`
  );
}

async function migrateViajesAnulacion(conn) {
  const [[anuladoCol]] = await conn.query(
    `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'viajes' AND COLUMN_NAME = 'anulado'`
  );
  if (anuladoCol.c === 0) {
    await conn.query(
      `ALTER TABLE viajes ADD COLUMN anulado TINYINT(1) NOT NULL DEFAULT 0`
    );
  }

  const [[motivoCol]] = await conn.query(
    `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'viajes' AND COLUMN_NAME = 'motivo_anulacion'`
  );
  if (motivoCol.c === 0) {
    await conn.query(
      `ALTER TABLE viajes ADD COLUMN motivo_anulacion VARCHAR(40) NULL`
    );
  }
}

export { pool };
