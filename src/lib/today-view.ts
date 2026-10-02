import { col } from '@/lib/db/collections';
import { goalContext, type GoalType } from '@/lib/db/types';
import { dogsForMinutes } from '@/lib/game/rewards';
import { ensureGameState, toGameState } from '@/lib/repos/gameState';
import { goalsForDay } from '@/lib/repos/goals';
import { findDayProgress } from '@/lib/repos/progress';
import { findOpenSession } from '@/lib/repos/sessions';
import { weekKeyFromDayKey, type IsoWeekday } from '@/lib/time';

/**
 * Lo que la Vista de Hoy necesita saber de un objetivo.
 *
 * Los metadatos llegan **ya resueltos a texto** (`context`), así que la tarjeta
 * no necesita un `switch` sobre el tipo. Añadir un cuarto tipo de objetivo no
 * toca ni un componente de interfaz.
 */
export interface TodayGoalView {
  goalId: string;
  type: GoalType;
  label: string;
  /** El libro, el curso o el tema. */
  context: string | null;
  dailyGoalMinutes: number;

  today: {
    minutes: number;
    dogsAwarded: number;
    /** `true` si ya alcanzó el umbral de recompensa. */
    completed: boolean;
  };

  shelter: { dogs: number; capacity: number; streak: number };

  /** `true` si la sesión abierta del usuario es de ESTE objetivo. */
  hasOpenSession: boolean;
}

/**
 * Arma las tarjetas del día.
 *
 * Asume que la reconciliación ya corrió (`syncAllGoals`): aquí solo se lee.
 */
export async function buildTodayView(
  userId: string,
  weekday: IsoWeekday,
  todayKey: string,
): Promise<TodayGoalView[]> {
  const goals = await goalsForDay(userId, weekday);
  if (goals.length === 0) return [];

  // Una sola consulta para toda la lista: solo puede haber una sesión abierta.
  const openSession = await findOpenSession(userId);
  const progress = await col.dailyProgress();

  const rows = await progress
    .find({ userId, dayKey: todayKey, goalId: { $in: goals.map((g) => g.goalId) } })
    .toArray();
  const byGoal = new Map(rows.map((r) => [r.goalId, r]));

  return Promise.all(
    goals.map(async (goal): Promise<TodayGoalView> => {
      const ref = { userId, goalId: goal.goalId };
      const row = byGoal.get(goal.goalId);
      const minutes = Math.floor((row?.totalSeconds ?? 0) / 60);
      const state = toGameState(
        await ensureGameState(ref, weekKeyFromDayKey(todayKey), todayKey),
      );

      return {
        goalId: goal.goalId,
        type: goal.type,
        label: goal.label,
        context: goalContext(goal.metadata),
        dailyGoalMinutes: goal.dailyGoalMinutes,
        today: {
          minutes,
          dogsAwarded: row?.dogsAwarded ?? 0,
          // "Hecho" es haber ganado perritos, no haber llegado a la meta
          // personal: la meta orienta, el umbral es lo que cuenta.
          completed: dogsForMinutes(minutes) > 0,
        },
        shelter: { dogs: state.dogs, capacity: state.capacity, streak: state.streak },
        hasOpenSession: openSession?.goalId === goal.goalId,
      };
    }),
  );
}
