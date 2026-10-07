import { ObjectId, type WithId } from 'mongodb';
import { col } from '@/lib/db/collections';
import type { GoalDoc, GoalRef, SessionDoc } from '@/lib/db/types';
import { GAME } from '@/lib/game/config';
import { applyAction, reconcile, type GameState } from '@/lib/game/engine';
import { weeklyLossCap } from '@/lib/game/penalties';
import { dogsForMinutes, nextRewardStep } from '@/lib/game/rewards';
import { vocabularyFor } from '@/lib/game/vocabulary';
import {
  appendEvents,
  ensureGameState,
  recentEvents,
  saveGameState,
  toGameState,
} from '@/lib/repos/gameState';
import { ensureDefaultGoals, findGoal, listGoals } from '@/lib/repos/goals';
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
  goalId: string;
  label: string;
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
  ref: GoalRef,
  goal: GoalDoc,
  state: GameState,
  todayKey: string,
): Promise<{ state: GameState; penalties: FreshPenalty[] }> {
  const firstPending = addDays(state.lastReconciledDay, 1);
  const completedDays =
    firstPending < todayKey
      ? await completedDayKeysBetween(ref, firstPending, todayKey)
      : new Set<string>();

  // Los días comprometidos son los del OBJETIVO, no los del perfil: fallar
  // inglés no puede depender del calendario de lectura.
  // El vocabulario sale del TIPO del objetivo: un día fallado de inglés no puede
  // registrarse como "Día programado sin leer".
  // La pausa es del OBJETIVO: pausar inglés no puede dejar de penalizar lectura.
  const result = reconcile(
    state,
    todayKey,
    goal.scheduledDays,
    completedDays,
    vocabularyFor(goal.type),
    goal.isPaused === true,
  );

  if (result.events.length === 0 && result.state.lastReconciledDay === state.lastReconciledDay) {
    return { state, penalties: [] };
  }

  await saveGameState(ref, result.state);
  await appendEvents(ref, result.events);

  // Anotar cómo terminó cada día cerrado, para el dashboard de la Tanda 8.
  for (const day of result.days) {
    if (day.outcome === 'completed') continue; // ya lo marcó `setDogsAwarded`
    await setDayOutcome(ref, day.dayKey, day.outcome);
  }

  const penalties = result.events
    .filter((e) => e.type === 'penalty')
    .map((e) => ({ dayKey: e.dayKey, delta: e.delta, reason: e.reason }));

  return { state: result.state, penalties };
}

/**
 * Se llama al ENTRAR a cualquier vista de la app (`/`, `/progreso`,
 * `/ajustes`). Garantiza perfil y estado, liquida las penalizaciones diferidas y
 * devuelve todo lo que la interfaz necesita pintar.
 *
 * No lo llama el middleware: encarecería **todas** las peticiones, incluidos los
 * endpoints y los assets.
 */
export async function syncGoal(
  ref: GoalRef,
  now = new Date(),
): Promise<GameSnapshot | null> {
  const profile = await ensureProfile(ref.userId);
  const goal = await findGoal(ref);
  if (!goal) return null;

  const todayKey = dayKey(now, profile.timezone);
  const stateDoc = await ensureGameState(ref, weekKeyFromDayKey(todayKey), todayKey);
  const { state, penalties } = await reconcileAndPersist(
    ref,
    goal,
    toGameState(stateDoc),
    todayKey,
  );

  const todayProgress = await findDayProgress(ref, todayKey);
  const scheduled = goal.scheduledDays.includes(isoWeekday(now, profile.timezone));

  return {
    goalId: goal.goalId,
    label: goal.label,
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
 * Reconcilia TODOS los objetivos activos del usuario.
 *
 * Es lo que llaman las páginas: las penalizaciones de inglés no pueden depender
 * de que el usuario abra la pestaña de inglés.
 */
export async function syncAllGoals(
  userId: string,
  now = new Date(),
): Promise<GameSnapshot[]> {
  await ensureDefaultGoals(userId);
  const goals = await listGoals(userId);
  const snapshots: GameSnapshot[] = [];
  for (const goal of goals) {
    const snapshot = await syncGoal({ userId, goalId: goal.goalId }, now);
    if (snapshot) snapshots.push(snapshot);
  }
  return snapshots;
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
  session: WithId<SessionDoc>,
  now = new Date(),
): Promise<SettleResult> {
  // El `ref` sale de la propia sesión: así es imposible liquidarla contra el
  // objetivo equivocado, que es el error que un `userId` suelto permitiría.
  const ref: GoalRef = { userId: session.userId, goalId: session.goalId };

  const profile = await ensureProfile(ref.userId);
  const goal = await findGoal(ref);
  if (!goal) throw new Error(`La sesión apunta a un objetivo inexistente: ${ref.goalId}`);

  const todayKey = dayKey(now, profile.timezone);
  const sessions = await col.sessions();

  const stateDoc = await ensureGameState(ref, weekKeyFromDayKey(todayKey), todayKey);
  let state = (await reconcileAndPersist(ref, goal, toGameState(stateDoc), todayKey)).state;

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
    const existing = await findDayProgress(ref, session.dayKey);
    return notCounted(Math.floor((existing?.totalSeconds ?? 0) / 60));
  }

  // Ya liquidada: devolver el estado actual sin volver a pagar.
  if (session.settledAt) {
    const existing = await findDayProgress(ref, session.dayKey);
    const minutes = Math.floor((existing?.totalSeconds ?? 0) / 60);
    return { ...notCounted(minutes), counted: true };
  }

  // El día de la sesión es una fecha civil, así que no hace falta zona horaria.
  const scheduled = goal.scheduledDays.includes(isoWeekdayOfDayKey(session.dayKey));

  const dayProgress = await addSessionToDay(
    ref,
    session.dayKey,
    session.durationSeconds,
    scheduled,
  );
  const minutesToday = Math.floor(dayProgress.totalSeconds / 60);

  const result = applyAction(
    state,
    {
      kind: 'settle',
      dayKey: session.dayKey,
      minutesToday,
      alreadyAwarded: dayProgress.dogsAwarded,
    },
    vocabularyFor(goal.type),
  );
  state = result.state;

  await saveGameState(ref, state);
  await appendEvents(ref, result.events);
  await setDogsAwarded(ref, session.dayKey, dogsForMinutes(minutesToday));
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

/** Historial reciente de UN objetivo, para la línea de tiempo de `/progreso`. */
export async function timeline(ref: GoalRef, limit = 20) {
  return recentEvents(ref, limit);
}
