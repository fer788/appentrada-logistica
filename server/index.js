import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { pool, initSchema } from "./db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT) || 4000;

app.use(cors());
app.use(express.json());

/** Primer slot 1..8 libre en esa fecha (cuenta todos los viajes del día). */
async function nextFreeSlot(conn, fecha) {
  const [used] = await conn.query(
    "SELECT slot FROM viajes WHERE fecha = ?",
    [fecha]
  );
  const taken = new Set(used.map((r) => r.slot));
  for (let s = 1; s <= 8; s++) {
    if (!taken.has(s)) return s;
  }
  return null;
}

async function countTripsOnDate(conn, fecha) {
  const [[row]] = await conn.query(
    "SELECT COUNT(*) AS c FROM viajes WHERE fecha = ?",
    [fecha]
  );
  return row.c;
}

const TIPOS_VENTA_OK = new Set(["Mas", "Dos"]);
const MOTIVOS_ANULACION_OK = new Set([
  "Anulo Cliente",
  "Anulo Molino",
  "Otros",
]);

function normPrecio3(v) {
  const n = Math.trunc(Number(v));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(999, n);
}

function normTipoVentaMasDos(v) {
  const t = String(v ?? "").trim();
  return TIPOS_VENTA_OK.has(t) ? t : "Mas";
}

function normEntregado(v) {
  if (v === true || v === 1 || v === "1") return 1;
  if (v === false || v === 0 || v === "0") return 0;
  return Number(v) ? 1 : 0;
}

function normAnulado(v) {
  if (v === true || v === 1 || v === "1") return 1;
  if (v === false || v === 0 || v === "0") return 0;
  return Number(v) ? 1 : 0;
}

function normMotivoAnulacion(v) {
  const m = String(v ?? "").trim();
  return MOTIVOS_ANULACION_OK.has(m) ? m : null;
}

app.get("/api/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message) });
  }
});

app.get("/api/clientes", async (_req, res) => {
  const [rows] = await pool.query(
    "SELECT id, nombre, notas FROM clientes ORDER BY nombre"
  );
  res.json(rows);
});

app.post("/api/clientes", async (req, res) => {
  const { nombre, notas } = req.body || {};
  if (!nombre || String(nombre).trim() === "") {
    return res.status(400).json({ error: "nombre requerido" });
  }
  const [r] = await pool.query(
    "INSERT INTO clientes (nombre, notas) VALUES (?, ?)",
    [String(nombre).trim(), notas ? String(notas) : null]
  );
  res.status(201).json({ id: r.insertId });
});

app.patch("/api/clientes/:id", async (req, res) => {
  const id = Number(req.params.id);
  const { nombre } = req.body || {};
  if (nombre === undefined) {
    return res.status(400).json({ error: "nombre requerido" });
  }
  const n = String(nombre).trim();
  if (!n) {
    return res.status(400).json({ error: "nombre no puede estar vacío" });
  }
  const [r] = await pool.query(
    "UPDATE clientes SET nombre = ? WHERE id = ?",
    [n, id]
  );
  if (r.affectedRows === 0) {
    return res.status(404).json({ error: "Cliente no encontrado" });
  }
  res.json({ ok: true });
});

app.delete("/api/clientes/:id", async (req, res) => {
  const id = Number(req.params.id);
  const [[row]] = await pool.query(
    "SELECT COUNT(*) AS c FROM viajes WHERE cliente_id = ?",
    [id]
  );
  if (row.c > 0) {
    return res.status(409).json({
      error:
        "No se puede eliminar: hay viajes que usan este cliente. Cambiá el cliente en esos viajes primero.",
    });
  }
  const [r] = await pool.query("DELETE FROM clientes WHERE id = ?", [id]);
  if (r.affectedRows === 0) {
    return res.status(404).json({ error: "Cliente no encontrado" });
  }
  res.json({ ok: true });
});

app.get("/api/choferes", async (_req, res) => {
  const [rows] = await pool.query(
    "SELECT id, nombre, telefono FROM choferes ORDER BY nombre"
  );
  res.json(rows);
});

app.post("/api/choferes", async (req, res) => {
  const { nombre, telefono } = req.body || {};
  if (!nombre || String(nombre).trim() === "") {
    return res.status(400).json({ error: "nombre requerido" });
  }
  const [r] = await pool.query(
    "INSERT INTO choferes (nombre, telefono) VALUES (?, ?)",
    [String(nombre).trim(), telefono ? String(telefono) : null]
  );
  res.status(201).json({ id: r.insertId });
});

app.get("/api/productos", async (_req, res) => {
  const [rows] = await pool.query(
    "SELECT id, codigo, nombre FROM productos ORDER BY nombre"
  );
  res.json(rows);
});

app.post("/api/productos", async (req, res) => {
  const { codigo, nombre } = req.body || {};
  const c = codigo != null ? String(codigo).trim().toUpperCase() : "";
  const n = nombre != null ? String(nombre).trim() : "";
  if (!c || !n) {
    return res.status(400).json({ error: "codigo y nombre requeridos" });
  }
  try {
    const [r] = await pool.query(
      "INSERT INTO productos (codigo, nombre) VALUES (?, ?)",
      [c, n]
    );
    res.status(201).json({ id: r.insertId });
  } catch (e) {
    if (String(e.message).includes("Duplicate")) {
      return res.status(409).json({ error: "Ya existe un producto con ese código" });
    }
    res.status(500).json({ error: String(e.message) });
  }
});

app.patch("/api/productos/:id", async (req, res) => {
  const id = Number(req.params.id);
  const { codigo, nombre } = req.body || {};
  if (codigo === undefined && nombre === undefined) {
    return res.status(400).json({ error: "codigo o nombre requerido" });
  }
  const [[row]] = await pool.query(
    "SELECT id, codigo, nombre FROM productos WHERE id = ?",
    [id]
  );
  if (!row) {
    return res.status(404).json({ error: "Producto no encontrado" });
  }
  const nextCodigo =
    codigo !== undefined ? String(codigo).trim().toUpperCase() : row.codigo;
  const nextNombre =
    nombre !== undefined ? String(nombre).trim() : row.nombre;
  if (!nextCodigo || !nextNombre) {
    return res.status(400).json({ error: "codigo y nombre no pueden quedar vacíos" });
  }
  try {
    await pool.query(
      "UPDATE productos SET codigo = ?, nombre = ? WHERE id = ?",
      [nextCodigo, nextNombre, id]
    );
    res.json({ ok: true });
  } catch (e) {
    if (String(e.message).includes("Duplicate")) {
      return res.status(409).json({ error: "Ya existe otro producto con ese código" });
    }
    res.status(500).json({ error: String(e.message) });
  }
});

app.delete("/api/productos/:id", async (req, res) => {
  const id = Number(req.params.id);
  const [[row]] = await pool.query(
    "SELECT COUNT(*) AS c FROM viajes WHERE producto_id = ?",
    [id]
  );
  if (row.c > 0) {
    return res.status(409).json({
      error:
        "No se puede eliminar: hay viajes que usan este producto. Cambiá el producto en esos viajes primero.",
    });
  }
  const [r] = await pool.query("DELETE FROM productos WHERE id = ?", [id]);
  if (r.affectedRows === 0) {
    return res.status(404).json({ error: "Producto no encontrado" });
  }
  res.json({ ok: true });
});

app.get("/api/viajes", async (req, res) => {
  const { desde, hasta } = req.query;
  if (!desde || !hasta) {
    return res.status(400).json({ error: "desde y hasta (YYYY-MM-DD) requeridos" });
  }
  const [rows] = await pool.query(
    `SELECT v.id, v.fecha, v.slot, v.cliente_id, v.chofer_id, v.patente, v.producto_id,
            v.precio, v.tipo_venta, v.observaciones, v.entregado, v.anulado, v.motivo_anulacion,
            c.nombre AS cliente_nombre, ch.nombre AS chofer_nombre, p.nombre AS producto_nombre, p.codigo AS producto_codigo
     FROM viajes v
     JOIN clientes c ON c.id = v.cliente_id
     LEFT JOIN choferes ch ON ch.id = v.chofer_id
     JOIN productos p ON p.id = v.producto_id
     WHERE v.fecha >= ? AND v.fecha <= ?
     ORDER BY v.fecha, v.slot`,
    [desde, hasta]
  );
  res.json(rows);
});

app.post("/api/viajes", async (req, res) => {
  const {
    fecha,
    cliente_id,
    chofer_id,
    patente,
    producto_id,
    precio,
    tipo_venta,
    observaciones,
  } = req.body || {};
  if (!fecha || !cliente_id || !producto_id) {
    return res.status(400).json({ error: "fecha, cliente_id y producto_id requeridos" });
  }
  const choferSql =
    chofer_id != null && chofer_id !== "" ? Number(chofer_id) : null;
  const patenteSql =
    patente != null && String(patente).trim() !== ""
      ? String(patente).trim().toUpperCase()
      : null;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const slot = await nextFreeSlot(conn, fecha);
    if (slot === null) {
      await conn.rollback();
      return res.status(409).json({ error: "Máximo 8 viajes para esa fecha" });
    }
    const [r] = await conn.query(
      `INSERT INTO viajes (fecha, slot, cliente_id, chofer_id, patente, producto_id, precio, tipo_venta, observaciones, entregado)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      [
        fecha,
        slot,
        Number(cliente_id),
        choferSql,
        patenteSql,
        Number(producto_id),
        normPrecio3(precio),
        normTipoVentaMasDos(tipo_venta),
        observaciones != null ? String(observaciones) : null,
      ]
    );
    await conn.commit();
    res.status(201).json({ id: r.insertId, slot });
  } catch (e) {
    await conn.rollback();
    res.status(500).json({ error: String(e.message) });
  } finally {
    conn.release();
  }
});

function normDateSql(d) {
  if (d == null) return d;
  return String(d).slice(0, 10);
}

/**
 * Mueve viaje a (targetFecha, targetSlot). Sin conflicto: UPDATE directo. Con conflicto: intercambio.
 */
async function applyViajePosition(conn, id, curFecha, curSlot, targetFecha, targetSlot) {
  if (curFecha === targetFecha && curSlot === targetSlot) return;

  const [conflict] = await conn.query(
    "SELECT id FROM viajes WHERE fecha = ? AND slot = ? AND id != ? FOR UPDATE",
    [targetFecha, targetSlot, id]
  );

  if (conflict.length === 0) {
    if (curFecha !== targetFecha) {
      const n = await countTripsOnDate(conn, targetFecha);
      if (n >= 8) {
        const err = new Error("MAX_8");
        err.code = "MAX_8";
        throw err;
      }
    }
    await conn.query("UPDATE viajes SET fecha = ?, slot = ? WHERE id = ?", [
      targetFecha,
      targetSlot,
      id,
    ]);
    return;
  }

  const otherId = conflict[0].id;
  const tmp = await nextFreeSlot(conn, curFecha);
  if (tmp === null) {
    const err = new Error("REORDER");
    err.code = "REORDER";
    throw err;
  }

  await conn.query("UPDATE viajes SET fecha = ?, slot = ? WHERE id = ?", [
    curFecha,
    tmp,
    id,
  ]);
  await conn.query("UPDATE viajes SET fecha = ?, slot = ? WHERE id = ?", [
    curFecha,
    curSlot,
    otherId,
  ]);
  await conn.query("UPDATE viajes SET fecha = ?, slot = ? WHERE id = ?", [
    targetFecha,
    targetSlot,
    id,
  ]);
}

/**
 * PATCH: opcional fecha/slot (mover) y/o cliente_id, chofer_id, patente, producto_id, precio, tipo_venta, observaciones.
 */
app.patch("/api/viajes/:id", async (req, res) => {
  const id = Number(req.params.id);
  const b = req.body || {};
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[cur]] = await conn.query(
      `SELECT fecha, slot, cliente_id, chofer_id, patente, producto_id, precio, tipo_venta, observaciones, entregado, anulado, motivo_anulacion
       FROM viajes WHERE id = ? FOR UPDATE`,
      [id]
    );
    if (!cur) {
      await conn.rollback();
      return res.status(404).json({ error: "Viaje no encontrado" });
    }

    const curFecha = normDateSql(cur.fecha);
    const curSlot = Number(cur.slot);

    const wantsMove = b.fecha != null || b.slot != null;
    let targetFecha = curFecha;
    let targetSlot = curSlot;

    if (wantsMove) {
      if (b.fecha == null) {
        await conn.rollback();
        return res.status(400).json({ error: "fecha requerida al cambiar posición" });
      }
      targetFecha = normDateSql(b.fecha);
      targetSlot =
        b.slot != null ? Number(b.slot) : await nextFreeSlot(conn, targetFecha);
      if (targetSlot == null || targetSlot < 1 || targetSlot > 8) {
        await conn.rollback();
        return res
          .status(409)
          .json({ error: "No hay cupo (máx. 8 viajes) o slot inválido" });
      }
      try {
        await applyViajePosition(conn, id, curFecha, curSlot, targetFecha, targetSlot);
      } catch (e) {
        await conn.rollback();
        if (e.code === "MAX_8") {
          return res.status(409).json({ error: "Máximo 8 viajes para esa fecha" });
        }
        if (e.code === "REORDER") {
          return res.status(409).json({ error: "No se pudo reordenar (día lleno)" });
        }
        throw e;
      }
    }

    const fields = [];
    const vals = [];
    if (b.cliente_id !== undefined) {
      fields.push("cliente_id = ?");
      vals.push(Number(b.cliente_id));
    }
    if (b.chofer_id !== undefined) {
      fields.push("chofer_id = ?");
      vals.push(
        b.chofer_id == null || b.chofer_id === "" ? null : Number(b.chofer_id)
      );
    }
    if (b.patente !== undefined) {
      fields.push("patente = ?");
      vals.push(
        b.patente == null || String(b.patente).trim() === ""
          ? null
          : String(b.patente).trim().toUpperCase()
      );
    }
    if (b.producto_id !== undefined) {
      fields.push("producto_id = ?");
      vals.push(Number(b.producto_id));
    }
    if (b.precio !== undefined) {
      fields.push("precio = ?");
      vals.push(normPrecio3(b.precio));
    }
    if (b.tipo_venta !== undefined) {
      fields.push("tipo_venta = ?");
      vals.push(normTipoVentaMasDos(b.tipo_venta));
    }
    if (b.observaciones !== undefined) {
      fields.push("observaciones = ?");
      vals.push(b.observaciones == null || b.observaciones === "" ? null : String(b.observaciones));
    }
    if (b.entregado !== undefined) {
      fields.push("entregado = ?");
      vals.push(normEntregado(b.entregado));
    }
    if (b.anulado !== undefined) {
      const nextAnulado = normAnulado(b.anulado);
      fields.push("anulado = ?");
      vals.push(nextAnulado);

      if (nextAnulado === 0) {
        fields.push("motivo_anulacion = ?");
        vals.push(null);
      } else if (b.motivo_anulacion !== undefined) {
        const motivo = normMotivoAnulacion(b.motivo_anulacion);
        if (!motivo) {
          await conn.rollback();
          return res.status(400).json({
            error: "motivo_anulacion inválido. Usar: Anulo Cliente, Anulo Molino u Otros",
          });
        }
        fields.push("motivo_anulacion = ?");
        vals.push(motivo);
      }
    } else if (b.motivo_anulacion !== undefined) {
      const motivo = normMotivoAnulacion(b.motivo_anulacion);
      if (!motivo) {
        await conn.rollback();
        return res.status(400).json({
          error: "motivo_anulacion inválido. Usar: Anulo Cliente, Anulo Molino u Otros",
        });
      }
      fields.push("anulado = ?");
      vals.push(1);
      fields.push("motivo_anulacion = ?");
      vals.push(motivo);
    }

    if (fields.length > 0) {
      vals.push(id);
      await conn.query(`UPDATE viajes SET ${fields.join(", ")} WHERE id = ?`, vals);
    }

    await conn.commit();
    res.json({ ok: true, fecha: targetFecha, slot: targetSlot });
  } catch (e) {
    await conn.rollback();
    res.status(500).json({ error: String(e.message) });
  } finally {
    conn.release();
  }
});

app.delete("/api/viajes/:id", async (req, res) => {
  const id = Number(req.params.id);
  const [r] = await pool.query("DELETE FROM viajes WHERE id = ?", [id]);
  if (r.affectedRows === 0) {
    return res.status(404).json({ error: "Viaje no encontrado" });
  }
  res.json({ ok: true });
});

const distPath = path.join(__dirname, "..", "dist");
app.use(express.static(distPath));

app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api")) return next();
  res.sendFile(path.join(distPath, "index.html"), (err) => {
    if (err) next();
  });
});

initSchema()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`API logística http://localhost:${PORT}`);
    });
  })
  .catch((e) => {
    console.error("DB init:", e);
    process.exit(1);
  });
