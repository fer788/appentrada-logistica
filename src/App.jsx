import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  getMondayToSaturdayWeek,
  toISODate,
  formatColumnLabel,
  formatWeekTabLabel,
  normalizeFecha,
  mondayStartsInYear,
  findDefaultWeekIndexNextMonday,
  slotDndId,
  parseSlotDndId,
} from "./dates.js";
import "./App.css";

const TIPOS_VENTA = ["Mas", "Dos"];
const MOTIVOS_ANULACION = ["Anulo Cliente", "Anulo Molino", "Otros"];

function clampPrecio3(v) {
  const n = Math.trunc(Number(v));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(999, n);
}

function initialTipoVenta(stored) {
  const t = String(stored ?? "").trim();
  return TIPOS_VENTA.includes(t) ? t : "Mas";
}

function onChangePrecio3(setPrecio) {
  return (e) => {
    const v = e.target.value;
    if (v === "") {
      setPrecio("");
      return;
    }
    const n = parseInt(v, 10);
    if (Number.isNaN(n)) return;
    setPrecio(String(Math.min(999, Math.max(0, n))));
  };
}

/** Tono distinto por producto (estable según id). */
const PRODUCT_TONE_COUNT = 10;
function tripProductToneClass(productoId) {
  return `trip-producto--p${Math.abs(Number(productoId) || 0) % PRODUCT_TONE_COUNT}`;
}

async function api(path, opts = {}) {
  const r = await fetch(path, {
    ...opts,
    headers: { "Content-Type": "application/json", ...opts.headers },
  });
  const text = await r.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { error: text };
  }
  if (!r.ok) {
    throw new Error(data?.error || r.statusText || "Error");
  }
  return data;
}

function DraggableTrip({ trip, onEditClick, onToggleEntregado }) {
  const anulado = Number(trip.anulado) === 1;
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: `viaje-${trip.id}`,
      disabled: anulado,
    });
  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
      }
    : undefined;

  const openEdit = () => onEditClick?.(trip);
  const entregado = Number(trip.entregado) === 1;

  const onCtx = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (anulado) return;
    onToggleEntregado?.(trip);
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`trip-card${isDragging ? " dragging" : ""}${
        entregado ? " trip-card--entregado" : ""
      }${anulado ? " trip-card--anulado" : ""}${
        anulado && trip.motivo_anulacion ? " trip-card--anulado-with-motivo" : ""
      }`}
      onContextMenu={onCtx}
      title={
        anulado
          ? "Viaje anulado (congelado) · Solo edición"
          : "Clic: editar · Clic derecho: marcar / desmarcar entregado"
      }
    >
      <button
        type="button"
        className="trip-drag-handle"
        aria-label="Arrastrar para mover de día u horario"
        onClick={(e) => e.stopPropagation()}
        onContextMenu={onCtx}
        {...listeners}
        {...attributes}
      >
        <span className="trip-drag-grip" aria-hidden />
      </button>
      <div
        className="trip-card-main"
        role="button"
        tabIndex={0}
        onClick={openEdit}
        onContextMenu={onCtx}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            openEdit();
          }
        }}
      >
        <div className="trip-cliente">{trip.cliente_nombre}</div>
        <div className={`trip-producto ${tripProductToneClass(trip.producto_id)}`}>
          {trip.producto_nombre}
        </div>
        <div className="trip-precio-row">
          <span className="trip-precio">
            {Number(trip.precio) > 0
              ? `$${clampPrecio3(trip.precio).toLocaleString("es-AR")}`
              : "—"}
          </span>
          <span className="trip-tipo-inline">
            {trip.tipo_venta?.trim() || "—"}
          </span>
        </div>
        <div className="trip-obs" title={trip.observaciones || ""}>
          {trip.observaciones?.trim() || "—"}
        </div>
        {anulado && (
          <div className="trip-anulado-badge">
            ANULADO{trip.motivo_anulacion ? ` · ${trip.motivo_anulacion}` : ""}
          </div>
        )}
      </div>
    </div>
  );
}

function SlotCell({
  fecha,
  slotNum,
  trip,
  isOver,
  onEditTrip,
  onEmptySlotClick,
  onToggleEntregado,
}) {
  const id = slotDndId(fecha, slotNum);
  const { setNodeRef } = useDroppable({ id });
  const filled = Boolean(trip);

  const openNuevoViaje = () => {
    if (!filled) onEmptySlotClick?.(fecha);
  };

  return (
    <div
      ref={setNodeRef}
      className={`slot-cell${filled ? " slot-filled" : " slot-empty slot-empty-clickable"}${
        isOver ? " slot-drag-over" : ""
      }`}
      {...(!filled
        ? {
            role: "button",
            tabIndex: 0,
            "aria-label": `Cargar nuevo viaje para el ${fecha}`,
            onClick: openNuevoViaje,
            onKeyDown: (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                openNuevoViaje();
              }
            },
          }
        : {})}
    >
      {trip ? (
        <DraggableTrip
          trip={trip}
          onEditClick={onEditTrip}
          onToggleEntregado={onToggleEntregado}
        />
      ) : (
        <span className="slot-placeholder">—</span>
      )}
    </div>
  );
}

function DayRow({
  dateObj,
  tripsBySlot,
  overId,
  onEditTrip,
  onEmptySlotClick,
  onToggleEntregado,
}) {
  const fecha = toISODate(dateObj);
  const count = Object.keys(tripsBySlot).length;

  return (
    <section className="day-block">
      <div className="day-block-head">
        <span className="day-block-title">{formatColumnLabel(dateObj)}</span>
        <span className="day-block-count muted">{count}/8 viajes</span>
      </div>
      <div className="slots-line">
        {Array.from({ length: 8 }, (_, i) => {
          const slotNum = i + 1;
          const trip = tripsBySlot[slotNum];
          const isOver = overId === slotDndId(fecha, slotNum);
          return (
            <SlotCell
              key={slotNum}
              fecha={fecha}
              slotNum={slotNum}
              trip={trip}
              isOver={isOver}
              onEditTrip={onEditTrip}
              onEmptySlotClick={onEmptySlotClick}
              onToggleEntregado={onToggleEntregado}
            />
          );
        })}
      </div>
    </section>
  );
}

const MONDAYS_2026 = mondayStartsInYear(2026);

export default function App() {
  const [viewMode, setViewMode] = useState("calendario");
  const [weekIndex, setWeekIndex] = useState(() =>
    findDefaultWeekIndexNextMonday(MONDAYS_2026)
  );
  const columns = useMemo(
    () => getMondayToSaturdayWeek(MONDAYS_2026[weekIndex]),
    [weekIndex]
  );
  const desde = toISODate(columns[0]);
  const hasta = toISODate(columns[5]);

  const [viajes, setViajes] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [choferes, setChoferes] = useState([]);
  const [productos, setProductos] = useState([]);
  const [error, setError] = useState(null);
  const [overId, setOverId] = useState(null);

  const [modal, setModal] = useState(null);
  /** Fecha preseleccionada al abrir “Nuevo viaje” desde casilla vacía; null = usar lunes de la semana. */
  const [nuevoViajeFecha, setNuevoViajeFecha] = useState(null);
  const [editingTrip, setEditingTrip] = useState(null);

  const loadCatalog = useCallback(async () => {
    try {
      const [c, ch, p] = await Promise.all([
        api("/api/clientes"),
        api("/api/choferes"),
        api("/api/productos"),
      ]);
      setClientes(c);
      setChoferes(ch);
      setProductos(p);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  const loadViajes = useCallback(async () => {
    try {
      const v = await api(`/api/viajes?desde=${desde}&hasta=${hasta}`);
      setViajes(
        v.map((row) => ({
          ...row,
          fecha: normalizeFecha(row.fecha),
        }))
      );
    } catch (e) {
      setError(e.message);
    }
  }, [desde, hasta]);

  const load = useCallback(async () => {
    setError(null);
    await Promise.all([loadCatalog(), loadViajes()]);
  }, [loadCatalog, loadViajes]);

  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);

  useEffect(() => {
    loadViajes();
  }, [loadViajes]);

  const handleToggleEntregado = useCallback(
    async (trip) => {
      const next = Number(trip.entregado) === 1 ? false : true;
      try {
        await api(`/api/viajes/${trip.id}`, {
          method: "PATCH",
          body: JSON.stringify({ entregado: next }),
        });
        await loadViajes();
      } catch (e) {
        setError(e.message);
      }
    },
    [loadViajes]
  );

  const byFecha = useMemo(() => {
    const m = new Map();
    for (const col of columns) {
      m.set(toISODate(col), []);
    }
    for (const t of viajes) {
      const k = normalizeFecha(t.fecha);
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(t);
    }
    for (const arr of m.values()) {
      arr.sort((a, b) => a.slot - b.slot);
    }
    return m;
  }, [viajes, columns]);

  const tripsByFechaAndSlot = useMemo(() => {
    const out = new Map();
    for (const col of columns) {
      const f = toISODate(col);
      const slotMap = {};
      for (const t of byFecha.get(f) || []) {
        slotMap[t.slot] = t;
      }
      out.set(f, slotMap);
    }
    return out;
  }, [columns, byFecha]);

  const statsSemana = useMemo(() => {
    let n = 0;
    for (const col of columns) {
      n += (byFecha.get(toISODate(col)) || []).length;
    }
    return n;
  }, [columns, byFecha]);

  const statsPorPatenteSemana = useMemo(() => {
    const acc = new Map();
    for (const col of columns) {
      for (const t of byFecha.get(toISODate(col)) || []) {
        const p =
          t.patente && String(t.patente).trim() !== ""
            ? t.patente
            : "Sin patente";
        acc.set(p, (acc.get(p) || 0) + 1);
      }
    }
    return [...acc.entries()].sort((a, b) => b[1] - a[1]);
  }, [columns, byFecha]);

  const statsPatentePorDia = useMemo(() => {
    const out = {};
    for (const col of columns) {
      const f = toISODate(col);
      const acc = new Map();
      for (const t of byFecha.get(f) || []) {
        const p =
          t.patente && String(t.patente).trim() !== ""
            ? t.patente
            : "Sin patente";
        acc.set(p, (acc.get(p) || 0) + 1);
      }
      out[f] = acc;
    }
    return out;
  }, [columns, byFecha]);

  const statsV1 = useMemo(() => {
    const all = viajes || [];
    const total = all.length;
    const anulados = all.filter((t) => Number(t.anulado) === 1);
    const entregados = all.filter(
      (t) => Number(t.entregado) === 1 && Number(t.anulado) !== 1
    );
    const pendientes = all.filter(
      (t) => Number(t.entregado) !== 1 && Number(t.anulado) !== 1
    );
    const baseCumplimiento = total - anulados.length;
    const cumplimientoPct =
      baseCumplimiento > 0
        ? Math.round((entregados.length / baseCumplimiento) * 100)
        : 0;

    const motivos = new Map([
      ["Anulo Cliente", 0],
      ["Anulo Molino", 0],
      ["Otros", 0],
    ]);
    for (const t of anulados) {
      const m = String(t.motivo_anulacion || "Otros");
      motivos.set(m, (motivos.get(m) || 0) + 1);
    }

    const byCliente = new Map();
    const byProducto = new Map();
    const byDia = new Map();
    for (const d of columns) {
      byDia.set(toISODate(d), { total: 0, anulados: 0, entregados: 0 });
    }
    for (const t of all) {
      byCliente.set(t.cliente_nombre, (byCliente.get(t.cliente_nombre) || 0) + 1);
      byProducto.set(t.producto_nombre, (byProducto.get(t.producto_nombre) || 0) + 1);
      const k = normalizeFecha(t.fecha);
      if (!byDia.has(k)) continue;
      const day = byDia.get(k);
      day.total += 1;
      if (Number(t.anulado) === 1) day.anulados += 1;
      if (Number(t.entregado) === 1 && Number(t.anulado) !== 1) day.entregados += 1;
    }

    const topClientes = [...byCliente.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    const topProductos = [...byProducto.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    const maxMotivos = Math.max(1, ...[...motivos.values()]);
    const maxClientes = Math.max(1, ...topClientes.map(([, n]) => n), 1);
    const maxProductos = Math.max(1, ...topProductos.map(([, n]) => n), 1);
    const maxDiaTotal = Math.max(1, ...columns.map((d) => (byDia.get(toISODate(d))?.total || 0)));
    const diaRows = columns.map((d) => {
      const key = toISODate(d);
      return {
        key,
        label: formatColumnLabel(d),
        ...byDia.get(key),
      };
    });

    return {
      total,
      entregados: entregados.length,
      pendientes: pendientes.length,
      anulados: anulados.length,
      cumplimientoPct,
      motivos: [...motivos.entries()],
      topClientes,
      topProductos,
      diaRows,
      maxMotivos,
      maxClientes,
      maxProductos,
      maxDiaTotal,
    };
  }, [viajes, columns]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  const exportSemanaTxt = useCallback(() => {
    const header =
      "Fecha entrega\tID Cliente\tID producto\tPrecio\tObservaciones";
    const rows = [];
    for (const col of columns) {
      const f = toISODate(col);
      for (const t of byFecha.get(f) || []) {
        const obs = String(t.observaciones ?? "")
          .replace(/\r\n|\n|\r/g, " ")
          .replace(/\t/g, " ")
          .trim();
        const precio = clampPrecio3(
          t.precio != null && t.precio !== "" ? t.precio : 0
        );
        rows.push(
          [
            normalizeFecha(t.fecha),
            t.cliente_id,
            t.producto_id,
            precio,
            obs,
          ].join("\t")
        );
      }
    }
    const body = [header, ...rows].join("\r\n");
    const blob = new Blob(["\uFEFF" + body], {
      type: "text/plain;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `viajes_${desde}_${hasta}.txt`;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, [columns, byFecha, desde, hasta]);

  const handleDragEnd = async (event) => {
    setOverId(null);
    const { active, over } = event;
    if (!over) return;
    const idStr = String(active.id);
    if (!idStr.startsWith("viaje-")) return;
    const tripId = Number(idStr.slice(6));
    const parsed = parseSlotDndId(over.id);
    if (!parsed) return;
    const { fecha: targetFecha, slot: targetSlot } = parsed;
    const trip = viajes.find((v) => v.id === tripId);
    if (!trip) return;
    if (Number(trip.anulado) === 1) return;
    if (normalizeFecha(trip.fecha) === targetFecha && trip.slot === targetSlot) return;
    try {
      await api(`/api/viajes/${tripId}`, {
        method: "PATCH",
        body: JSON.stringify({ fecha: targetFecha, slot: targetSlot }),
      });
      await load();
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <h1>Calendario de entregas</h1>
        </div>
        <div className="toolbar">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setNuevoViajeFecha(null);
              setModal("viaje");
            }}
          >
            Nuevo viaje
          </button>
          <button type="button" className="btn" onClick={() => setModal("clientes")}>
            Clientes
          </button>
          <button type="button" className="btn" onClick={() => setModal("chofer")}>
            Chofer
          </button>
          <button type="button" className="btn" onClick={() => setModal("productos")}>
            Productos
          </button>
          <button
            type="button"
            className="btn"
            onClick={exportSemanaTxt}
            title="Descargar viajes de la semana en pantalla (lun–sáb)"
          >
            Exportar semana (.txt)
          </button>
        </div>
      </header>

      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}

      <nav className="week-tabs" aria-label="Semanas 2026 (lunes a sábado)">
        {MONDAYS_2026.map((m, i) => (
          <button
            key={toISODate(m)}
            type="button"
            className={`week-tab${i === weekIndex ? " week-tab--active" : ""}`}
            onClick={() => setWeekIndex(i)}
          >
            {formatWeekTabLabel(m)}
          </button>
        ))}
      </nav>

      <nav className="view-tabs" aria-label="Vista">
        <button
          type="button"
          className={`view-tab${viewMode === "calendario" ? " view-tab--active" : ""}`}
          onClick={() => setViewMode("calendario")}
        >
          Calendario
        </button>
        <button
          type="button"
          className={`view-tab${viewMode === "estadisticas" ? " view-tab--active" : ""}`}
          onClick={() => setViewMode("estadisticas")}
        >
          Estadísticas
        </button>
      </nav>

      {viewMode === "calendario" && (
        <>
          <div className="stats-bar">
            <span>
              <strong>{statsSemana}</strong>{" "}
              <span className="muted">viajes esta semana (lun–sáb en pantalla)</span>
            </span>
            {columns.map((d) => {
              const f = toISODate(d);
              const n = (byFecha.get(f) || []).length;
              return (
                <span key={f}>
                  <strong>{n}</strong>{" "}
                  <span className="muted">{formatColumnLabel(d)}</span>
                </span>
              );
            })}
          </div>

          <DndContext
            sensors={sensors}
            onDragOver={({ over }) => setOverId(over?.id ?? null)}
            onDragEnd={handleDragEnd}
            onDragCancel={() => setOverId(null)}
          >
            <div className="week-linear">
              {columns.map((d) => {
                const f = toISODate(d);
                const tripsBySlot = tripsByFechaAndSlot.get(f) || {};
                return (
                  <DayRow
                    key={f}
                    dateObj={d}
                    tripsBySlot={tripsBySlot}
                    overId={overId}
                    onEditTrip={(t) => setEditingTrip(t)}
                    onEmptySlotClick={(fechaIso) => {
                      setNuevoViajeFecha(fechaIso);
                      setModal("viaje");
                    }}
                    onToggleEntregado={handleToggleEntregado}
                  />
                );
              })}
            </div>
          </DndContext>

          <div className="patente-stats">
            <h3>Viajes por patente (semana en pantalla)</h3>
            {statsPorPatenteSemana.length === 0 ? (
              <p className="muted" style={{ margin: 0 }}>
                Ningún viaje cargado.
              </p>
            ) : (
              <ul>
                {statsPorPatenteSemana.map(([pat, n]) => (
                  <li key={pat}>
                    <strong>{pat}</strong>: {n} semanal
                    {columns.map((d) => {
                      const fd = toISODate(d);
                      const di = statsPatentePorDia[fd]?.get(pat) || 0;
                      if (!di) return null;
                      return (
                        <span key={fd} className="muted">
                          {" "}
                          · {formatColumnLabel(d)}: {di}
                        </span>
                      );
                    })}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}

      {viewMode === "estadisticas" && (
        <section className="v1-stats">
          <div className="v1-kpis">
            <article className="v1-card v1-kpi-total"><h3>Total</h3><strong>{statsV1.total}</strong></article>
            <article className="v1-card v1-kpi-ok"><h3>Entregados</h3><strong>{statsV1.entregados}</strong></article>
            <article className="v1-card v1-kpi-wait"><h3>Pendientes</h3><strong>{statsV1.pendientes}</strong></article>
            <article className="v1-card v1-kpi-cancel"><h3>Anulados</h3><strong>{statsV1.anulados}</strong></article>
            <article className="v1-card v1-kpi-rate"><h3>% Cumplimiento</h3><strong>{statsV1.cumplimientoPct}%</strong></article>
          </div>

          <div className="v1-grid">
            <article className="v1-panel">
              <h3>Top clientes</h3>
              <div className="v1-bars">
                {statsV1.topClientes.map(([n, c]) => (
                  <div key={n} className="v1-bar-row">
                    <div className="v1-bar-head">
                      <span>{n}</span>
                      <strong>
                        {c}
                        {statsV1.total > 0
                          ? ` (${Math.round((c / statsV1.total) * 100)}%)`
                          : " (0%)"}
                      </strong>
                    </div>
                    <div
                      className="v1-bar-track"
                      title={`${n}: ${c} viajes (${statsV1.total > 0
                        ? Math.round((c / statsV1.total) * 100)
                        : 0}%)`}
                    >
                      <div
                        className="v1-bar-fill v1-bar-fill--primary"
                        style={{ width: `${Math.round((c / statsV1.maxClientes) * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </article>
            <article className="v1-panel">
              <h3>Top productos</h3>
              <div className="v1-bars">
                {statsV1.topProductos.map(([n, c]) => (
                  <div key={n} className="v1-bar-row">
                    <div className="v1-bar-head">
                      <span>{n}</span>
                      <strong>
                        {c}
                        {statsV1.total > 0
                          ? ` (${Math.round((c / statsV1.total) * 100)}%)`
                          : " (0%)"}
                      </strong>
                    </div>
                    <div
                      className="v1-bar-track"
                      title={`${n}: ${c} viajes (${statsV1.total > 0
                        ? Math.round((c / statsV1.total) * 100)
                        : 0}%)`}
                    >
                      <div
                        className="v1-bar-fill v1-bar-fill--teal"
                        style={{ width: `${Math.round((c / statsV1.maxProductos) * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </article>
          </div>

          <article className="v1-panel">
            <h3>Carga por día (semana en pantalla)</h3>
            <div className="v1-legend">
              <span><i className="v1-dot v1-dot--total" /> Carga total</span>
              <span><i className="v1-dot v1-dot--ok" /> Entregados</span>
              <span><i className="v1-dot v1-dot--cancel" /> Anulados</span>
            </div>
            <div className="v1-day-rows">
              {statsV1.diaRows.map((r) => (
                <div
                  key={r.key}
                  className="v1-day-row"
                  title={`${r.label}: ${r.total} total · ${r.entregados} entregados · ${r.anulados} anulados`}
                >
                  <span>{r.label}</span>
                  <span><strong>{r.total}</strong> total</span>
                  <span><strong>{r.entregados}</strong> entregados</span>
                  <span><strong>{r.anulados}</strong> anulados</span>
                  <div className="v1-day-track">
                    <div
                      className="v1-day-fill v1-day-fill--total"
                      style={{ width: `${Math.round((r.total / statsV1.maxDiaTotal) * 100)}%` }}
                    />
                    <div
                      className="v1-day-fill v1-day-fill--ok"
                      style={{ width: `${r.total ? Math.round((r.entregados / r.total) * 100) : 0}%` }}
                    />
                    <div
                      className="v1-day-fill v1-day-fill--cancel"
                      style={{ width: `${r.total ? Math.round((r.anulados / r.total) * 100) : 0}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </article>
        </section>
      )}

      {modal === "clientes" && (
        <ModalABMClientes
          clientes={clientes}
          onClose={() => setModal(null)}
          onRefresh={load}
        />
      )}
      {modal === "chofer" && (
        <ModalChofer
          onClose={() => setModal(null)}
          onSaved={async () => {
            await load();
            setModal(null);
          }}
        />
      )}
      {modal === "viaje" && (
        <ModalViaje
          clientes={clientes}
          productos={productos}
          defaultFecha={nuevoViajeFecha ?? desde}
          columnas={columns}
          onClose={() => {
            setNuevoViajeFecha(null);
            setModal(null);
          }}
          onSaved={async () => {
            await load();
            setNuevoViajeFecha(null);
            setModal(null);
          }}
        />
      )}
      {modal === "productos" && (
        <ModalABMProductos
          productos={productos}
          onClose={() => setModal(null)}
          onRefresh={load}
        />
      )}
      {editingTrip && (
        <ModalEditarViaje
          trip={editingTrip}
          clientes={clientes}
          choferes={choferes}
          productos={productos}
          columnas={columns}
          onClose={() => setEditingTrip(null)}
          onSaved={async () => {
            await load();
            setEditingTrip(null);
          }}
        />
      )}
    </div>
  );
}

function ModalEditarViaje({
  trip,
  clientes,
  choferes,
  productos,
  columnas,
  onClose,
  onSaved,
}) {
  const [fecha, setFecha] = useState(normalizeFecha(trip.fecha));
  const [cliente_id, setClienteId] = useState(String(trip.cliente_id));
  const [chofer_id, setChoferId] = useState(
    trip.chofer_id != null && trip.chofer_id !== ""
      ? String(trip.chofer_id)
      : ""
  );
  const [patente, setPatente] = useState(
    trip.patente != null ? String(trip.patente) : ""
  );
  const [producto_id, setProductoId] = useState(String(trip.producto_id));
  const [precio, setPrecio] = useState(() =>
    String(clampPrecio3(trip.precio))
  );
  const [tipo_venta, setTipoVenta] = useState(() =>
    initialTipoVenta(trip.tipo_venta)
  );
  const [observaciones, setObs] = useState(trip.observaciones || "");
  const [motivoAnulacion, setMotivoAnulacion] = useState(
    MOTIVOS_ANULACION.includes(trip.motivo_anulacion)
      ? trip.motivo_anulacion
      : MOTIVOS_ANULACION[0]
  );
  const [err, setErr] = useState(null);
  const isAnulado = Number(trip.anulado) === 1;

  const submit = async (e) => {
    e.preventDefault();
    setErr(null);
    try {
      await api(`/api/viajes/${trip.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          fecha,
          slot: trip.slot,
          cliente_id: Number(cliente_id),
          chofer_id: chofer_id === "" ? null : Number(chofer_id),
          patente:
            patente.trim() === "" ? null : patente.trim().toUpperCase(),
          producto_id: Number(producto_id),
          precio: precio === "" ? 0 : clampPrecio3(precio),
          tipo_venta,
          observaciones: observaciones || null,
        }),
      });
      onSaved();
    } catch (e2) {
      setErr(e2.message);
    }
  };

  const eliminarViaje = async () => {
    if (
      !window.confirm(
        "¿Eliminar este viaje? La acción no se puede deshacer."
      )
    ) {
      return;
    }
    setErr(null);
    try {
      await api(`/api/viajes/${trip.id}`, { method: "DELETE" });
      onSaved();
    } catch (e2) {
      setErr(e2.message);
    }
  };

  const toggleAnulacionViaje = async () => {
    if (isAnulado) {
      if (!window.confirm("¿Desanular este viaje?")) {
        return;
      }
    } else if (
      !window.confirm(`¿Anular este viaje con motivo "${motivoAnulacion}"?`)
    ) {
      return;
    }
    const payload = isAnulado
      ? { anulado: false }
      : { anulado: true, motivo_anulacion: motivoAnulacion };
    setErr(null);
    try {
      await api(`/api/viajes/${trip.id}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      onSaved();
    } catch (e2) {
      setErr(e2.message);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal modal--edit"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="edit-viaje-title"
        aria-modal="true"
      >
        <h2 id="edit-viaje-title">Editar viaje</h2>
        <form className="modal-body modal-body--edit" onSubmit={submit}>
          {err && <div className="error-banner">{err}</div>}
          <div className="field">
            <label>Cliente</label>
            <select
              value={cliente_id}
              onChange={(e) => setClienteId(e.target.value)}
              required
            >
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Producto</label>
            <select
              value={producto_id}
              onChange={(e) => setProductoId(e.target.value)}
              required
            >
              {productos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre} ({p.codigo})
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Precio (máx. 3 cifras)</label>
            <input
              type="number"
              min={0}
              max={999}
              step={1}
              inputMode="numeric"
              value={precio}
              onChange={onChangePrecio3(setPrecio)}
            />
          </div>
          <div className="field">
            <label>Tipo de venta</label>
            <select
              value={tipo_venta}
              onChange={(e) => setTipoVenta(e.target.value)}
              required
            >
              {TIPOS_VENTA.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Observaciones</label>
            <textarea
              value={observaciones}
              onChange={(e) => setObs(e.target.value)}
              rows={5}
            />
          </div>
          <div className="field-group-label">Operación (cuando lo sepas)</div>
          <div className="field">
            <label>Chofer</label>
            <select
              value={chofer_id}
              onChange={(e) => setChoferId(e.target.value)}
            >
              <option value="">Sin asignar</option>
              {choferes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Patente</label>
            <input
              value={patente}
              onChange={(e) => setPatente(e.target.value.toUpperCase())}
              placeholder="Cuando esté definida"
            />
          </div>
          <div className="field">
            <label>Fecha</label>
            <select value={fecha} onChange={(e) => setFecha(e.target.value)}>
              {columnas.map((d) => {
                const f = toISODate(d);
                return (
                  <option key={f} value={f}>
                    {formatColumnLabel(d)} ({f})
                  </option>
                );
              })}
            </select>
          </div>
          <p className="modal-hint muted">
            Para cambiar la casilla del día, arrastrá el viaje desde la franja
            izquierda de la tarjeta.
          </p>
          <div className="field-group-label">Anulación</div>
          {!isAnulado && (
            <div className="field">
              <label>Motivo de anulación</label>
              <select
                value={motivoAnulacion}
                onChange={(e) => setMotivoAnulacion(e.target.value)}
              >
                {MOTIVOS_ANULACION.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="modal-actions modal-actions--spread">
            <span className="modal-actions-left">
              <button
                type="button"
                className={`btn ${isAnulado ? "btn-ghost" : "btn-danger"}`}
                onClick={toggleAnulacionViaje}
              >
                {isAnulado ? "DESANULAR" : "ANULAR"}
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={eliminarViaje}
              >
                Eliminar viaje
              </button>
            </span>
            <span className="modal-actions-right">
              <button type="button" className="btn btn-ghost" onClick={onClose}>
                Cancelar
              </button>
              <button type="submit" className="btn btn-primary">
                Guardar cambios
              </button>
            </span>
          </div>
        </form>
      </div>
    </div>
  );
}

function ModalABMProductos({ productos, onClose, onRefresh }) {
  const [err, setErr] = useState(null);
  const [nuevoCodigo, setNuevoCodigo] = useState("");
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editCodigo, setEditCodigo] = useState("");
  const [editNombre, setEditNombre] = useState("");

  const refresh = async () => {
    setErr(null);
    await onRefresh();
  };

  const agregar = async (e) => {
    e.preventDefault();
    setErr(null);
    try {
      await api("/api/productos", {
        method: "POST",
        body: JSON.stringify({
          codigo: nuevoCodigo,
          nombre: nuevoNombre,
        }),
      });
      setNuevoCodigo("");
      setNuevoNombre("");
      await refresh();
    } catch (e2) {
      setErr(e2.message);
    }
  };

  const startEdit = (p) => {
    setEditingId(p.id);
    setEditCodigo(p.codigo);
    setEditNombre(p.nombre);
    setErr(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditCodigo("");
    setEditNombre("");
  };

  const guardarEdit = async (id) => {
    setErr(null);
    try {
      await api(`/api/productos/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ codigo: editCodigo, nombre: editNombre }),
      });
      cancelEdit();
      await refresh();
    } catch (e2) {
      setErr(e2.message);
    }
  };

  const eliminar = async (p) => {
    if (
      !window.confirm(
        `¿Eliminar el producto "${p.nombre}" (código ${p.codigo})?`
      )
    ) {
      return;
    }
    setErr(null);
    try {
      await api(`/api/productos/${p.id}`, { method: "DELETE" });
      if (editingId === p.id) cancelEdit();
      await refresh();
    } catch (e2) {
      setErr(e2.message);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal modal--edit modal--productos"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="abm-productos-title"
        aria-modal="true"
      >
        <h2 id="abm-productos-title">Productos</h2>
        <div className="modal-body modal-body--edit">
          {err && <div className="error-banner">{err}</div>}
          <form className="abm-nuevo" onSubmit={agregar}>
            <div className="field-group-label">Nuevo producto</div>
            <div className="abm-nuevo-row">
              <div className="field field--inline">
                <label>Código</label>
                <input
                  value={nuevoCodigo}
                  onChange={(e) =>
                    setNuevoCodigo(e.target.value.toUpperCase())
                  }
                  placeholder="Ej. TRG"
                  maxLength={32}
                />
              </div>
              <div className="field field--inline field--grow">
                <label>Nombre</label>
                <input
                  value={nuevoNombre}
                  onChange={(e) => setNuevoNombre(e.target.value)}
                  placeholder="Nombre visible"
                  maxLength={120}
                />
              </div>
              <button type="submit" className="btn btn-primary abm-btn-add">
                Agregar
              </button>
            </div>
          </form>

          <div className="field-group-label">Listado</div>
          <ul className="abm-productos-list">
            {productos.length === 0 ? (
              <li className="abm-empty muted">No hay productos cargados.</li>
            ) : (
              productos.map((p) => (
                <li key={p.id} className="abm-producto-row">
                  {editingId === p.id ? (
                    <div className="abm-edit-row">
                      <div className="field field--inline">
                        <label>Código</label>
                        <input
                          value={editCodigo}
                          onChange={(e) =>
                            setEditCodigo(e.target.value.toUpperCase())
                          }
                          maxLength={32}
                        />
                      </div>
                      <div className="field field--inline field--grow">
                        <label>Nombre</label>
                        <input
                          value={editNombre}
                          onChange={(e) => setEditNombre(e.target.value)}
                          maxLength={120}
                        />
                      </div>
                      <div className="abm-row-actions">
                        <button
                          type="button"
                          className="btn btn-primary"
                          onClick={() => guardarEdit(p.id)}
                        >
                          Guardar
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost"
                          onClick={cancelEdit}
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="abm-producto-text">
                        <span className="abm-producto-nombre">{p.nombre}</span>
                        <span className="abm-producto-codigo muted">
                          {p.codigo}
                        </span>
                      </div>
                      <div className="abm-row-actions">
                        <button
                          type="button"
                          className="btn btn-ghost"
                          onClick={() => startEdit(p)}
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          className="btn btn-danger btn--compact"
                          onClick={() => eliminar(p)}
                        >
                          Eliminar
                        </button>
                      </div>
                    </>
                  )}
                </li>
              ))
            )}
          </ul>
          <div className="modal-actions">
            <button type="button" className="btn btn-primary" onClick={onClose}>
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ModalABMClientes({ clientes, onClose, onRefresh }) {
  const [err, setErr] = useState(null);
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editNombre, setEditNombre] = useState("");

  const refresh = async () => {
    setErr(null);
    await onRefresh();
  };

  const agregar = async (e) => {
    e.preventDefault();
    setErr(null);
    try {
      await api("/api/clientes", {
        method: "POST",
        body: JSON.stringify({ nombre: nuevoNombre.trim() }),
      });
      setNuevoNombre("");
      await refresh();
    } catch (e2) {
      setErr(e2.message);
    }
  };

  const startEdit = (c) => {
    setEditingId(c.id);
    setEditNombre(c.nombre);
    setErr(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditNombre("");
  };

  const guardarEdit = async (id) => {
    setErr(null);
    const n = editNombre.trim();
    if (!n) {
      setErr("El nombre no puede estar vacío.");
      return;
    }
    try {
      await api(`/api/clientes/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ nombre: n }),
      });
      cancelEdit();
      await refresh();
    } catch (e2) {
      setErr(e2.message);
    }
  };

  const eliminar = async (c) => {
    if (
      !window.confirm(
        `¿Eliminar el cliente "${c.nombre}" (ID ${c.id})?`
      )
    ) {
      return;
    }
    setErr(null);
    try {
      await api(`/api/clientes/${c.id}`, { method: "DELETE" });
      if (editingId === c.id) cancelEdit();
      await refresh();
    } catch (e2) {
      setErr(e2.message);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal modal--edit modal--productos"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="abm-clientes-title"
        aria-modal="true"
      >
        <h2 id="abm-clientes-title">Clientes</h2>
        <div className="modal-body modal-body--edit">
          {err && <div className="error-banner">{err}</div>}
          <form className="abm-nuevo" onSubmit={agregar}>
            <div className="field-group-label">Nuevo cliente</div>
            <div className="abm-nuevo-row">
              <div className="field field--inline field--grow">
                <label>Nombre</label>
                <input
                  value={nuevoNombre}
                  onChange={(e) => setNuevoNombre(e.target.value)}
                  placeholder="Nombre del cliente"
                  maxLength={200}
                  required
                />
              </div>
              <button type="submit" className="btn btn-primary abm-btn-add">
                Agregar
              </button>
            </div>
          </form>
          <p className="modal-hint muted abm-clientes-hint">
            El ID lo asigna el sistema al guardar. Solo podés cambiar el nombre.
          </p>

          <div className="field-group-label">Listado</div>
          <ul className="abm-productos-list">
            {clientes.length === 0 ? (
              <li className="abm-empty muted">No hay clientes cargados.</li>
            ) : (
              clientes.map((c) => (
                <li key={c.id} className="abm-producto-row">
                  {editingId === c.id ? (
                    <div className="abm-edit-row">
                      <div className="field field--inline abm-id-field">
                        <label>ID</label>
                        <input
                          className="abm-input-readonly"
                          value={String(c.id)}
                          readOnly
                          tabIndex={-1}
                          aria-readonly="true"
                        />
                      </div>
                      <div className="field field--inline field--grow">
                        <label>Nombre</label>
                        <input
                          value={editNombre}
                          onChange={(e) => setEditNombre(e.target.value)}
                          maxLength={200}
                        />
                      </div>
                      <div className="abm-row-actions">
                        <button
                          type="button"
                          className="btn btn-primary"
                          onClick={() => guardarEdit(c.id)}
                        >
                          Guardar
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost"
                          onClick={cancelEdit}
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="abm-producto-text">
                        <span className="abm-producto-nombre">{c.nombre}</span>
                        <span className="abm-producto-codigo muted">
                          ID {c.id}
                        </span>
                      </div>
                      <div className="abm-row-actions">
                        <button
                          type="button"
                          className="btn btn-ghost"
                          onClick={() => startEdit(c)}
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          className="btn btn-danger btn--compact"
                          onClick={() => eliminar(c)}
                        >
                          Eliminar
                        </button>
                      </div>
                    </>
                  )}
                </li>
              ))
            )}
          </ul>
          <div className="modal-actions">
            <button type="button" className="btn btn-primary" onClick={onClose}>
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ModalChofer({ onClose, onSaved }) {
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [err, setErr] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setErr(null);
    try {
      await api("/api/choferes", {
        method: "POST",
        body: JSON.stringify({ nombre, telefono: telefono || null }),
      });
      onSaved();
    } catch (e2) {
      setErr(e2.message);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Nuevo chofer</h2>
        <form className="modal-body" onSubmit={submit}>
          {err && <div className="error-banner">{err}</div>}
          <div className="field">
            <label>Nombre</label>
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label>Teléfono (opcional)</label>
            <input
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
            />
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary">
              Guardar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ModalViaje({
  clientes,
  productos,
  defaultFecha,
  columnas,
  onClose,
  onSaved,
}) {
  const [fecha, setFecha] = useState(defaultFecha);
  const [cliente_id, setClienteId] = useState("");
  const [producto_id, setProductoId] = useState(
    productos[0]?.id != null ? String(productos[0].id) : ""
  );
  const [precio, setPrecio] = useState("");
  const [tipo_venta, setTipoVenta] = useState("Mas");
  const [observaciones, setObs] = useState("");
  const [err, setErr] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setErr(null);
    try {
      await api("/api/viajes", {
        method: "POST",
        body: JSON.stringify({
          fecha,
          cliente_id: Number(cliente_id),
          producto_id: Number(producto_id),
          precio: precio === "" ? 0 : clampPrecio3(precio),
          tipo_venta,
          observaciones: observaciones || null,
        }),
      });
      onSaved();
    } catch (e2) {
      setErr(e2.message);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Nuevo viaje</h2>
        <form className="modal-body" onSubmit={submit}>
          {err && <div className="error-banner">{err}</div>}
          <p className="modal-hint muted" style={{ marginTop: 0 }}>
            Chofer y patente los podés cargar después, al editar el viaje.
          </p>
          <div className="field">
            <label>Fecha</label>
            <select value={fecha} onChange={(e) => setFecha(e.target.value)}>
              {columnas.map((d) => {
                const f = toISODate(d);
                return (
                  <option key={f} value={f}>
                    {formatColumnLabel(d)} ({f})
                  </option>
                );
              })}
            </select>
          </div>
          <div className="field">
            <label>Cliente</label>
            <select
              value={cliente_id}
              onChange={(e) => setClienteId(e.target.value)}
              required
            >
              <option value="">Elegir…</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Producto</label>
            <select
              value={producto_id}
              onChange={(e) => setProductoId(e.target.value)}
              required
            >
              {productos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre} ({p.codigo})
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Precio (máx. 3 cifras)</label>
            <input
              type="number"
              min={0}
              max={999}
              step={1}
              inputMode="numeric"
              value={precio}
              onChange={onChangePrecio3(setPrecio)}
            />
          </div>
          <div className="field">
            <label>Tipo de venta</label>
            <select
              value={tipo_venta}
              onChange={(e) => setTipoVenta(e.target.value)}
              required
            >
              {TIPOS_VENTA.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Observaciones</label>
            <textarea
              value={observaciones}
              onChange={(e) => setObs(e.target.value)}
            />
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary">
              Guardar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
