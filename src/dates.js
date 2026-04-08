/** Normaliza fecha desde API (string YYYY-MM-DD, ISO, o Date) a YYYY-MM-DD local. */
export function normalizeFecha(value) {
  if (value == null || value === "") return "";
  if (typeof value === "string") {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    if (value.includes("T")) return value.slice(0, 10);
  }
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) {
    const s = String(value);
    return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : s;
  }
  return toISODate(d);
}

export function toISODate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Lunes a sábado de la semana calendario que contiene `ref` (hora local). */
export function getMondayToSaturdayWeek(ref = new Date()) {
  const d = new Date(ref);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const offsetToMonday = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + offsetToMonday);
  const out = [];
  for (let i = 0; i < 6; i++) {
    const x = new Date(d);
    x.setDate(d.getDate() + i);
    out.push(x);
  }
  return out;
}

/** Todos los lunes calendario que caen en `year` (hora local). */
export function mondayStartsInYear(year) {
  const out = [];
  let d = new Date(year, 0, 1);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const add = day === 1 ? 0 : day === 0 ? 1 : (8 - day) % 7;
  d.setDate(d.getDate() + add);
  while (d.getFullYear() === year) {
    out.push(new Date(d));
    d.setDate(d.getDate() + 7);
  }
  return out;
}

/** Índice de semana en `mondays` para el lunes de la semana calendario siguiente a la actual. */
export function findDefaultWeekIndexNextMonday(mondays) {
  const t = new Date();
  const thisMon = getMondayToSaturdayWeek(t)[0];
  const nextMon = new Date(thisMon);
  nextMon.setDate(thisMon.getDate() + 7);
  const target = toISODate(nextMon);
  const idx = mondays.findIndex((d) => toISODate(d) === target);
  if (idx >= 0) return idx;
  for (let i = 0; i < mondays.length; i++) {
    if (toISODate(mondays[i]) >= target) return i;
  }
  return Math.max(0, mondays.length - 1);
}

const dias = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const meses = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sep",
  "oct",
  "nov",
  "dic",
];

export function formatWeekTabLabel(mondayDate) {
  const w = getMondayToSaturdayWeek(mondayDate);
  const a = w[0];
  const b = w[5];
  const ma = meses[a.getMonth()];
  const mb = meses[b.getMonth()];
  const y = a.getFullYear();
  if (ma === mb) return `${a.getDate()}–${b.getDate()} ${ma} ${y}`;
  return `${a.getDate()} ${ma} – ${b.getDate()} ${mb} ${y}`;
}

export function formatColumnLabel(d) {
  const w = dias[d.getDay()];
  const day = d.getDate();
  const mes = meses[d.getMonth()];
  return `${w} ${day} ${mes}`;
}

/** id estable para dnd-kit (string). */
export function slotDndId(fechaISO, slot) {
  return `slot|${fechaISO}|${slot}`;
}

export function parseSlotDndId(id) {
  const s = String(id);
  if (!s.startsWith("slot|")) return null;
  const parts = s.split("|");
  if (parts.length !== 3) return null;
  const fecha = parts[1];
  const slot = Number(parts[2]);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || slot < 1 || slot > 8) return null;
  return { fecha, slot };
}
