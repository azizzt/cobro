/** Fechas como cadenas ISO "YYYY-MM-DD" (sin hora) para evitar problemas de zona horaria. */

export const TZ = process.env.APP_TIMEZONE || "America/Mexico_City";

export function todayISO(tz: string = TZ, now: Date = new Date()): string {
  // en-CA formatea como YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function parts(iso: string): [number, number, number] {
  const [y, m, d] = iso.split("-").map(Number);
  return [y, m, d];
}

function toISO(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Suma meses respetando fin de mes: 31-ene + 1 mes = 28/29-feb. */
export function addMonths(iso: string, n: number): string {
  const [y, m, d] = parts(iso);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return toISO(ny, nm, Math.min(d, daysInMonth(ny, nm)));
}

export function addDays(iso: string, n: number): string {
  const [y, m, d] = parts(iso);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return toISO(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

/** Días de a → b (b - a). */
export function diffDays(a: string, b: string): number {
  const [y1, m1, d1] = parts(a);
  const [y2, m2, d2] = parts(b);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}

const longFmt = new Intl.DateTimeFormat("es-MX", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/** "2026-11-05" → "5 nov 2026" */
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = parts(iso);
  return longFmt.format(new Date(Date.UTC(y, m - 1, d)));
}

export function fmtDateTime(ts: Date | string | null | undefined): string {
  if (!ts) return "—";
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: TZ,
  }).format(new Date(ts));
}

/** "vence en 3 días", "venció hace 2 días", "vence hoy" */
export function relativeDue(due: string, today: string): string {
  const n = diffDays(today, due);
  if (n === 0) return "vence hoy";
  if (n === 1) return "vence mañana";
  if (n > 1) return `vence en ${n} días`;
  if (n === -1) return "venció ayer";
  return `venció hace ${-n} días`;
}
