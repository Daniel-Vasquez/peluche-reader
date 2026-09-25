import type { GameEventDoc, GameStateDoc } from '@/lib/db/types';
import { dayKeysBetween, isoWeekdayOfDayKey, weekKeyFromDayKey, type IsoWeekday } from '@/lib/time';
import { GAME } from './config';
import { effectivePenalty } from './penalties';
import { dogsForMinutes } from './rewards';

/**
 * Reducer del estado de gamificación. **Todo aquí es puro**: mismo estado más
 * misma acción producen siempre el mismo resultado. No lee el reloj ni la base
 * de datos; cuanto necesita entra por parámetros.
 *
 * La capa que habla con MongoDB es `game/service.ts` (Tanda 7).
 */

export type GameState = Omit<GameStateDoc, 'userId' | 'updatedAt'>;
export type NewEvent = Omit<GameEventDoc, 'userId' | 'createdAt'>;

export type GameAction =
  /** Cambio de semana: reinicia el tope de pérdida. */
  | { kind: 'rollover'; weekKey: string; dayKey: string }
  /** Día programado que cerró sin lectura suficiente. */
  | { kind: 'miss'; dayKey: string }
  /** Día no programado: no penaliza ni rompe la racha. */
  | { kind: 'rest'; dayKey: string }
  /** Liquidación del día: `minutesToday` es el acumulado del día completo. */
  | { kind: 'settle'; dayKey: string; minutesToday: number; alreadyAwarded: number };

export interface ApplyResult {
  state: GameState;
  events: NewEvent[];
}

/** Aforo que corresponde a un número de adopciones acumuladas. */
export function capacityFor(adopted: number): number {
  return Math.min(
    GAME.BASE_CAPACITY + Math.floor(adopted / GAME.ADOPTIONS_PER_CAPACITY),
    GAME.MAX_CAPACITY,
  );
}

/** Estado de una cuenta nueva. El día de alta **no** se penaliza. */
export function initialState(weekKey: string, dayKey: string): GameState {
  return {
    dogs: GAME.START_DOGS,
    capacity: capacityFor(0),
    adopted: 0,
    weekKey,
    weekStartDogs: GAME.START_DOGS,
    weekLosses: 0,
    lastReconciledDay: dayKey,
    streak: 0,
    bestStreak: 0,
  };
}

export function applyAction(state: GameState, action: GameAction): ApplyResult {
  const s: GameState = { ...state };
  const events: NewEvent[] = [];

  switch (action.kind) {
    case 'rollover': {
      s.weekKey = action.weekKey;
      s.weekStartDogs = s.dogs;
      s.weekLosses = 0;
      events.push({
        dayKey: action.dayKey,
        type: 'week_rollover',
        delta: 0,
        reason: `Nueva semana ${action.weekKey}`,
        dogsAfter: s.dogs,
      });
      break;
    }

    case 'rest': {
      s.lastReconciledDay = action.dayKey;
      break;
    }

    case 'miss': {
      const loss = effectivePenalty(s.dogs, s.weekStartDogs, s.weekLosses);
      if (loss > 0) {
        s.dogs -= loss;
        s.weekLosses += loss;
        events.push({
          dayKey: action.dayKey,
          type: 'penalty',
          delta: -loss,
          reason: 'Día programado sin lectura',
          dogsAfter: s.dogs,
        });
      }
      s.streak = 0;
      s.lastReconciledDay = action.dayKey;
      break;
    }

    case 'settle': {
      // Idempotencia: solo se entrega la DIFERENCIA con lo ya otorgado hoy.
      // Por eso liquidar dos veces la misma lectura no duplica la recompensa.
      const target = dogsForMinutes(action.minutesToday);
      const delta = target - action.alreadyAwarded;
      if (delta > 0) {
        const cap = capacityFor(s.adopted);
        const placed = Math.min(s.dogs + delta, cap);
        const overflow = s.dogs + delta - placed;

        s.dogs = placed;
        events.push({
          dayKey: action.dayKey,
          type: 'reward',
          delta,
          reason: `${action.minutesToday} min de lectura`,
          dogsAfter: s.dogs,
        });

        if (overflow > 0) {
          // El refugio está lleno: los extra encuentran casa. Suben el score
          // histórico y, cada 10, amplían el aforo.
          s.adopted += overflow;
          events.push({
            dayKey: action.dayKey,
            type: 'adoption',
            delta: overflow,
            reason: 'Refugio lleno: perritos adoptados',
            dogsAfter: s.dogs,
          });
        }
        s.capacity = capacityFor(s.adopted);
      }
      break;
    }
  }

  return { state: s, events };
}

/**
 * Evalúa todos los días **ya cerrados** entre `state.lastReconciledDay`
 * (exclusivo) y `todayKey` (**exclusivo**: el día en curso nunca se juzga).
 *
 * No hay cron en Vercel Hobby y no hace falta: las penalizaciones se liquidan de
 * forma perezosa la próxima vez que el usuario entra.
 *
 * @param scheduledDays Días comprometidos, ISO 1..7.
 * @param completedDays `dayKey`s con lectura suficiente (`dogsAwarded > 0`).
 */
export function reconcile(
  state: GameState,
  todayKey: string,
  scheduledDays: readonly IsoWeekday[],
  completedDays: ReadonlySet<string>,
): ApplyResult {
  let s = state;
  const events: NewEvent[] = [];

  for (const day of dayKeysBetween(s.lastReconciledDay, todayKey)) {
    if (day >= todayKey) break; // hoy todavía se puede salvar

    const weekKey = weekKeyFromDayKey(day);
    if (weekKey !== s.weekKey) {
      const rolled = applyAction(s, { kind: 'rollover', weekKey, dayKey: day });
      s = rolled.state;
      events.push(...rolled.events);
    }

    if (completedDays.has(day)) {
      // Leyó: la racha crece. La recompensa ya se otorgó el día en que leyó.
      const streak = s.streak + 1;
      s = {
        ...s,
        streak,
        bestStreak: Math.max(s.bestStreak, streak),
        lastReconciledDay: day,
      };
      continue;
    }

    const isScheduled = scheduledDays.includes(isoWeekdayOfDayKey(day));
    const applied = applyAction(s, {
      kind: isScheduled ? 'miss' : 'rest',
      dayKey: day,
    });
    s = applied.state;
    events.push(...applied.events);
  }

  return { state: s, events };
}
