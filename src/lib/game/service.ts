import { ObjectId, type WithId } from 'mongodb';
import { col } from '@/lib/db/collections';
import type { ProfileDoc, ReadingSessionDoc } from '@/lib/db/types';
import { GAME } from '@/lib/game/config';
import { applyAction, reconcile, type GameState } from '@/lib/game/engine';
import { weeklyLossCap } from '@/lib/game/penalties';
import { dogsForMinutes, nextRewardStep } from '@/lib/game/rewards';
import {
  appendEvents,
  ensureGameState,
  recentEvents,
  saveGameState,
  toGameState,
} from '@/lib/repos/gameState';
import { ensureProfile } from '@/lib/repos/profile';
import {
  addSessionToDay,
  completedDayKeysBetween,
  findDayProgress,
  setDayOutcome,
  setDogsAwarded,
} from '@/lib/repos/progress';
import { MIN_SESSION_SECONDS } from '@/lib/repos/sessions';
import { addDays, dayKey, isoWeekday, isoWeekdayOfDayKey, weekKeyFromDayKey } from '@/lib/time';

/**
 * Única puerta a la gamificación. Todo lo que otorgue o quite perritos pasa por
 * aquí; el resto de la app no llama al motor directamente.
 *
 * El motor (`game/engine.ts`) es puro y está probado; este archivo solo orquesta
 * lectura y escritura en MongoDB alrededor de él.
 */

export interface ShelterView {
  dogs: number;
  capacity: number;
  adopted: number;
  streak: number;
  bestStreak: number;
  weekLosses: number;
  weeklyLossCap: number;
  floorDogs: number;
}

/** Penalización recién aplicada, lista para mostrar en la interfaz. */
export interface FreshPenalty {
  dayKey: string;
  delta: number;
  reason: string;
}

export interface GameSnapshot {
  shelter: ShelterView;
  today: {
    dayKey: string;
    scheduled: boolean;
    totalSeconds: number;
    dogsAwarded: number;
  };
  /** Penalizaciones aplicadas en ESTA visita, para contarlas una sola vez. */
  freshPenalties: FreshPenalty[];
}

export interface SettleResult {
  /** Perritos ganados por esta liquidación. `0` si la sesión no puntúa. */
  dogsGained: number;
  /** Perritos que se adoptaron por desborde del aforo. */
  adoptedGained: number;
  minutesToday: number;
  shelter: ShelterView;
  nextStep: ReturnType<typeof nextRewardStep>;
  /** `false` cuando la sesión quedó por debajo del mínimo. */
  counted: boolean;
}

function toShelterView(state: GameState): ShelterView {
  return {
    dogs: state.dogs,
    capacity: state.capacity,
    adopted: state.adopted,
    streak: state.streak,
    bestStreak: state.bestStreak,
    weekLosses: state.weekLosses,
    weeklyLossCap: weeklyLossCap(state.weekStartDogs),
    floorDogs: GAME.FLOOR_DOGS,
  };
}

/**
 * Reconcilia los días cerrados y persiste el resultado.
 *
 * Es idempotente y barato cuando no hay nada que hacer: `reconcile` devuelve un
 * estado idéntico y cero eventos, así que no se escribe nada.
 */
async function reconcileAndPersist(
  userId: string,
  profile: ProfileDoc,
  state: GameState,
  todayKey: string,
): Promise<{ state: GameState; penalties: FreshPenalty[] }> {
  const firstPending = addDays(state.lastReconciledDay, 1);
  const completedDays =
    firstPending < todayKey
      ? await completedDayKeysBetween(userId, firstPending, todayKey)
      : new Set<string>();

  const result = reconcile(state, todayKey, profile.scheduledDays, completedDays);

  if (result.events.length === 0 && result.state.lastReconciledDay === state.lastReconciledDay) {
    return { state, penalties: [] };
  }

  await saveGameState(userId, result.state);
  await appendEvents(userId, result.events);

  // Anotar cómo terminó cada día cerrado, para el dashboard de la Tanda 8.
  for (const day of result.days) {
    if (day.outcome === 'completed') continue; // ya lo marcó `setDogsAwarded`
    await setDayOutcome(userId, day.dayKey, day.outcome);
  }

  const penalties = result.events
    .filter((e) => e.type === 'penalty')
    .map((e) => ({ dayKey: e.dayKey, delta: e.delta, reason: e.reason }));

  return { state: result.state, penalties };
}

/**
 * Se llama al ENTRAR a cualquier vista de la app (`/app`, `/progreso`,
 * `/ajustes`). Garantiza perfil y estado, liquida las penalizaciones diferidas y
 * devuelve todo lo que la interfaz necesita pintar.
 *
 * No lo llama el middleware: encarecería **todas** las peticiones, incluidos los
 * endpoints y los assets.
 */
export async function syncOnVisit(userId: string, now = new Date()): Promise<GameSnapshot> {
  const profile = await ensureProfile(userId);
  const todayKey = dayKey(now, profile.timezone);

  const stateDoc = await ensureGameState(userId, weekKeyFromDayKey(todayKey), todayKey);
  const { state, penalties } = await reconcileAndPersist(
    userId,
    profile,
    toGameState(stateDoc),
    todayKey,
  );

  const todayProgress = await findDayProgress(userId, todayKey);
  const scheduled = profile.scheduledDays.includes(isoWeekday(now, profile.timezone));

  return {
    shelter: toShelterView(state),
    today: {
      dayKey: todayKey,
      scheduled,
      totalSeconds: todayProgress?.totalSeconds ?? 0,
      dogsAwarded: todayProgress?.dogsAwarded ?? 0,
    },
    freshPenalties: penalties,
  };
}

/**
 * Liquida una sesión ya cerrada. Se llama **solo** desde
 * `/api/sessions/finish`, después de `finishSession`.
 *
 * Orden de operaciones deliberado: reconciliar primero (las penalizaciones de
 * días pasados van antes que la recompensa de hoy), sumar la sesión al día,
 * liquidar sobre el **total del día** y marcar la sesión.
 *
 * No es una transacción. Con Atlas se podría envolver en `withTransaction`, pero
 * este orden garantiza que en el peor caso se otorgue **de menos**, nunca de más:
 * y la siguiente sesión del día corrige la diferencia sola, porque `settle`
 * siempre apunta al total acumulado.
 */
export async function settleSession(
  userId: string,
  session: WithId<ReadingSessionDoc>,
  now = new Date(),
): Promise<SettleResult> {
  const profile = await ensureProfile(userId);
  const todayKey = dayKey(now, profile.timezone);
  const sessions = await col.sessions();

  const stateDoc = await ensureGameState(userId, weekKeyFromDayKey(todayKey), todayKey);
  let state = (await reconcileAndPersist(userId, profile, toGameState(stateDoc), todayKey)).state;

  const notCounted = (minutes: number): SettleResult => ({
    dogsGained: 0,
    adoptedGained: 0,
    minutesToday: minutes,
    shelter: toShelterView(state),
    nextStep: nextRewardStep(minutes),
    counted: false,
  });

  // Sesión que no puntúa: ni suma tiempo al día ni toca el refugio.
  if (session.status !== 'completed' || session.durationSeconds < MIN_SESSION_SECONDS) {
    const existing = await findDayProgress(userId, session.dayKey);
    return notCounted(Math.floor((existing?.totalSeconds ?? 0) / 60));
  }

  // Ya liquidada: devolver el estado actual sin volver a pagar.
  if (session.settledAt) {
    const existing = await findDayProgress(userId, session.dayKey);
    const minutes = Math.floor((existing?.totalSeconds ?? 0) / 60);
    return { ...notCounted(minutes), counted: true };
  }

  // El día de la sesión es una fecha civil, así que no hace falta zona horaria.
  const scheduled = profile.scheduledDays.includes(isoWeekdayOfDayKey(session.dayKey));

  const dayProgress = await addSessionToDay(
    userId,
    session.dayKey,
    session.durationSeconds,
    scheduled,
  );
  const minutesToday = Math.floor(dayProgress.totalSeconds / 60);

  const result = applyAction(state, {
    kind: 'settle',
    dayKey: session.dayKey,
    minutesToday,
    alreadyAwarded: dayProgress.dogsAwarded,
  });
  state = result.state;

  await saveGameState(userId, state);
  await appendEvents(userId, result.events);
  await setDogsAwarded(userId, session.dayKey, dogsForMinutes(minutesToday));
  await sessions.updateOne(
    { _id: new ObjectId(session._id) },
    { $set: { settledAt: now, updatedAt: now } },
  );

  const reward = result.events.find((e) => e.type === 'reward');
  const adoption = result.events.find((e) => e.type === 'adoption');

  return {
    dogsGained: reward?.delta ?? 0,
    adoptedGained: adoption?.delta ?? 0,
    minutesToday,
    shelter: toShelterView(state),
    nextStep: nextRewardStep(minutesToday),
    counted: true,
  };
}

/** Historial reciente, para la línea de tiempo de `/progreso` (Tanda 8). */
export async function timeline(userId: string, limit = 20) {
  return recentEvents(userId, limit);
}
