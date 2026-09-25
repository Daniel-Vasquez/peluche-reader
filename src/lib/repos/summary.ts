import { col } from '@/lib/db/collections';
import type { DailyProgressDoc } from '@/lib/db/types';
import { GAME } from '@/lib/game/config';
import { weeklyLossCap } from '@/lib/game/penalties';
import { ensureGameState, recentEvents, toGameState } from '@/lib/repos/gameState';
import { ensureProfile } from '@/lib/repos/profile';
import { dayProgressBetween } from '@/lib/repos/progress';
import type {
  DayPoint,
  DogsPoint,
  ProgressSummary,
  TimelineEntry,
  WeekRow,
} from '@/lib/progress-summary';
import {
  WEEKDAY_LABELS,
  addDays,
  dayKey,
  isoWeekdayOfDayKey,
  lastNDayKeys,
  startOfWeekDayKey,
  weekKeyFromDayKey,
} from '@/lib/time';

/** "L 22" — día de la semana y número, suficiente para un eje estrecho. */
function shortLabel(key: string): string {
  return `${WEEKDAY_LABELS[isoWeekdayOfDayKey(key)].short} ${Number(key.slice(8, 10))}`;
}

/**
 * Arma el resumen del dashboard.
 *
 * Rellena con ceros los días sin documento para que las series **no tengan
 * huecos**: una gráfica que salta del día 3 al día 9 miente sobre el ritmo.
 */
export async function buildProgressSummary(
  userId: string,
  days: number,
  now = new Date(),
): Promise<ProgressSummary> {
  const profile = await ensureProfile(userId);
  const todayKey = dayKey(now, profile.timezone);

  const stateDoc = await ensureGameState(userId, weekKeyFromDayKey(todayKey), todayKey);
  const state = toGameState(stateDoc);

  // Ocho semanas para el mapa de calor, o el rango pedido si es mayor.
  const heatmapStart = startOfWeekDayKey(addDays(todayKey, -7 * 7));
  const rangeStart = addDays(todayKey, -(days - 1));
  const from = heatmapStart < rangeStart ? heatmapStart : rangeStart;

  const rows = await dayProgressBetween(userId, from, todayKey);
  const byDay = new Map<string, DailyProgressDoc>(rows.map((r) => [r.dayKey, r]));

  const toPoint = (key: string): DayPoint => {
    const row = byDay.get(key);
    return {
      dayKey: key,
      label: shortLabel(key),
      minutes: Math.floor((row?.totalSeconds ?? 0) / 60),
      scheduled: row?.scheduled ?? profile.scheduledDays.includes(isoWeekdayOfDayKey(key)),
      outcome: row?.outcome ?? 'pending',
      dogsAwarded: row?.dogsAwarded ?? 0,
    };
  };

  const daily = lastNDayKeys(todayKey, days).map(toPoint);

  // --- Mapa de calor: 8 semanas completas, de lunes a domingo.
  const weeks: WeekRow[] = [];
  for (let w = 7; w >= 0; w -= 1) {
    const monday = startOfWeekDayKey(addDays(todayKey, -7 * w));
    weeks.push({
      weekKey: weekKeyFromDayKey(monday),
      label: `${Number(monday.slice(8, 10))}/${Number(monday.slice(5, 7))}`,
      // Los días futuros de la semana en curso quedan en `null`: no son cero,
      // simplemente todavía no han pasado.
      days: Array.from({ length: 7 }, (_, i) => {
        const key = addDays(monday, i);
        return key > todayKey ? null : toPoint(key);
      }),
    });
  }

  // --- Evolución del refugio: se reconstruye hacia atrás desde el saldo actual
  // usando los eventos, que guardan `dogsAfter`.
  const events = await recentEvents(userId, 400);
  const lastDogsOfDay = new Map<string, number>();
  for (const event of events) {
    // `events` viene de más reciente a más antiguo, así que el primero de cada
    // día es el saldo con el que ese día cerró.
    if (!lastDogsOfDay.has(event.dayKey)) lastDogsOfDay.set(event.dayKey, event.dogsAfter);
  }

  const timelineKeys = lastNDayKeys(todayKey, days);
  const dogsTimeline: DogsPoint[] = [];
  let carried = state.dogs;
  // Se recorre hacia atrás para arrastrar el último saldo conocido.
  for (let i = timelineKeys.length - 1; i >= 0; i -= 1) {
    const key = timelineKeys[i]!;
    const known = lastDogsOfDay.get(key);
    if (known !== undefined) carried = known;
    dogsTimeline.unshift({ dayKey: key, label: shortLabel(key), dogs: carried });
  }

  // --- Totales.
  const allRows = await (await col.dailyProgress()).find({ userId }).toArray();
  const minutesAllTime = Math.floor(
    allRows.reduce((sum, r) => sum + r.totalSeconds, 0) / 60,
  );
  const sessionsAllTime = allRows.reduce((sum, r) => sum + r.sessionsCount, 0);
  const daysCompleted = allRows.filter((r) => r.outcome === 'completed').length;

  const thisWeekKey = weekKeyFromDayKey(todayKey);
  const minutesThisWeek = Math.floor(
    allRows
      .filter((r) => r.weekKey === thisWeekKey)
      .reduce((sum, r) => sum + r.totalSeconds, 0) / 60,
  );

  // Adherencia: solo sobre días programados **ya cerrados**. Incluir hoy la
  // hundiría cada mañana y no sería culpa del usuario.
  const closed = allRows.filter((r) => r.dayKey < todayKey && r.scheduled);
  const completedScheduled = closed.filter((r) => r.outcome === 'completed').length;

  return {
    totals: {
      minutesAllTime,
      minutesThisWeek,
      sessionsAllTime,
      daysCompleted,
      adherence: closed.length > 0 ? completedScheduled / closed.length : null,
      scheduledClosed: closed.length,
      completedScheduled,
    },
    shelter: {
      dogs: state.dogs,
      capacity: state.capacity,
      adopted: state.adopted,
      streak: state.streak,
      bestStreak: state.bestStreak,
      weekLosses: state.weekLosses,
      weeklyLossCap: weeklyLossCap(state.weekStartDogs),
    },
    daily,
    dogsTimeline,
    weeks,
    events: events.slice(0, 20).map(
      (e): TimelineEntry => ({
        dayKey: e.dayKey,
        label: shortLabel(e.dayKey),
        type: e.type,
        delta: e.delta,
        reason: e.reason,
        dogsAfter: e.dogsAfter,
      }),
    ),
    empty: minutesAllTime === 0 && allRows.length === 0,
  };
}

export const MAX_DOGS_FOR_AXIS = GAME.MAX_CAPACITY;
