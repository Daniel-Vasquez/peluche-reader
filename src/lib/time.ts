/**
 * Única fuente de verdad temporal de la app.
 *
 * Regla del proyecto: ninguna decisión de negocio ("¿qué día es hoy?", "¿este
 * día estaba programado?") se toma con `new Date()` crudo. Todo pasa por aquí,
 * porque el día del usuario depende de SU zona horaria, no de la del servidor
 * (que en Vercel es UTC).
 */

/** Día de la semana ISO: 1 = lunes … 7 = domingo. */
export type IsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

const WEEKDAY_TO_ISO: Record<string, IsoWeekday> = {
  Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7,
};

export const WEEKDAY_LABELS: Record<IsoWeekday, { short: string; long: string }> = {
  1: { short: 'L', long: 'lunes' },
  2: { short: 'M', long: 'martes' },
  3: { short: 'X', long: 'miércoles' },
  4: { short: 'J', long: 'jueves' },
  5: { short: 'V', long: 'viernes' },
  6: { short: 'S', long: 'sábado' },
  7: { short: 'D', long: 'domingo' },
};

/** Valida un identificador de zona horaria IANA. */
export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Devuelve el día de negocio como `"YYYY-MM-DD"` en la zona horaria dada.
 * Se usa `en-CA` porque su formato numérico corto ya es ISO (`2026-09-24`).
 */
export function dayKey(date: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/** Día de la semana ISO (1..7) del instante dado, en la zona horaria dada. */
export function isoWeekday(date: Date, tz: string): IsoWeekday {
  const short = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'short',
  }).format(date);
  const iso = WEEKDAY_TO_ISO[short];
  if (!iso) throw new Error(`Día de la semana no reconocido: ${short}`);
  return iso;
}

/**
 * Día de la semana ISO de un `dayKey`. No necesita zona horaria: el dayKey ya
 * es una fecha civil, así que se interpreta a mediodía UTC para evitar que un
 * desplazamiento lo mueva al día anterior o siguiente.
 */
export function isoWeekdayOfDayKey(key: string): IsoWeekday {
  const date = parseDayKey(key);
  const iso = ((date.getUTCDay() + 6) % 7) + 1; // getUTCDay: 0=domingo
  return iso as IsoWeekday;
}

/** `"YYYY-MM-DD"` → `Date` a mediodía UTC (inmune a desplazamientos de ±12 h). */
export function parseDayKey(key: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) {
    throw new Error(`dayKey inválido: ${key}`);
  }
  return new Date(`${key}T12:00:00.000Z`);
}

/** Suma (o resta, con `n` negativo) días a un `dayKey`. */
export function addDays(key: string, n: number): string {
  const date = parseDayKey(key);
  date.setUTCDate(date.getUTCDate() + n);
  return date.toISOString().slice(0, 10);
}

/** Diferencia en días entre dos `dayKey` (`to - from`). */
export function diffDays(from: string, to: string): number {
  return Math.round(
    (parseDayKey(to).getTime() - parseDayKey(from).getTime()) / 86_400_000,
  );
}

/**
 * `dayKey` de la semana ISO-8601 a la que pertenece: `"YYYY-Www"`.
 * La semana empieza en lunes y pertenece al año que contiene su jueves.
 */
export function weekKeyFromDayKey(key: string): string {
  const date = parseDayKey(key);
  // Mover al jueves de la misma semana ISO: define el año al que pertenece.
  const dayOffset = (date.getUTCDay() + 6) % 7; // 0 = lunes
  date.setUTCDate(date.getUTCDate() - dayOffset + 3);
  const isoYear = date.getUTCFullYear();

  // El 4 de enero siempre cae en la semana ISO 1.
  const jan4 = new Date(Date.UTC(isoYear, 0, 4, 12));
  const jan4Offset = (jan4.getUTCDay() + 6) % 7;
  const week1Monday = new Date(jan4.getTime() - jan4Offset * 86_400_000);

  const week = Math.round((date.getTime() - week1Monday.getTime()) / (7 * 86_400_000)) + 1;
  return `${isoYear}-W${String(week).padStart(2, '0')}`;
}

/** `dayKey` del lunes de la semana a la que pertenece el día dado. */
export function startOfWeekDayKey(key: string): string {
  return addDays(key, -((isoWeekdayOfDayKey(key) - 1)));
}

/**
 * Lista de `dayKey` entre `from` (**exclusivo**) y `to` (**inclusive**).
 * Base de la reconciliación de días pasados (Tanda 6).
 * Devuelve `[]` si `to <= from`.
 */
export function dayKeysBetween(from: string, to: string): string[] {
  const total = diffDays(from, to);
  if (total <= 0) return [];
  const out: string[] = [];
  for (let i = 1; i <= total; i += 1) out.push(addDays(from, i));
  return out;
}

/** Los últimos `count` `dayKey` terminando en `endKey` (incluido), en orden. */
export function lastNDayKeys(endKey: string, count: number): string[] {
  const out: string[] = [];
  for (let i = count - 1; i >= 0; i -= 1) out.push(addDays(endKey, -i));
  return out;
}

/** Formatea segundos como `"MM:SS"` (o `"H:MM:SS"` si pasa de una hora). */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}
