import { col } from '@/lib/db/collections';
import { goalContext, type GoalType } from '@/lib/db/types';
import { dogsForMinutes } from '@/lib/game/rewards';
import { ensureGameState, toGameState } from '@/lib/repos/gameState';
import { listGoals } from '@/lib/repos/goals';
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

  /**
   * `true` si hoy es uno de los días comprometidos de este objetivo.
   *
   * La Vista de Hoy pinta **todos** los objetivos activos y usa esta marca para
   * decidir la jerarquía visual. Antes la lista solo traía los de hoy, y un día
   * sin nada programado dejaba la pantalla en un único párrafo.
   */
  isScheduledToday: boolean;

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
 * Trae **todos** los objetivos activos, no solo los de hoy, y marca cada uno con
 * `isScheduledToday`. Filtrar aquí era lo que dejaba `/app` con una sola frase
 * los días libres: la pantalla no estaba vacía por falta de datos, sino porque
 * la consulta descartaba lo que sí había que enseñar.
 *
 * Los archivados siguen fuera: eso lo hace `listGoals` por su cuenta.
 *
 * Asume que la reconciliación ya corrió (`syncAllGoals`): aquí solo se lee.
 */
export async function buildTodayView(
  userId: string,
  weekday: IsoWeekday,
  todayKey: string,
): Promise<TodayGoalView[]> {
  const goals = await listGoals(userId);
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
        isScheduledToday: goal.scheduledDays.includes(weekday),
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
