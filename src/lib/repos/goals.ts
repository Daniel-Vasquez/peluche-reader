import type { WithId } from 'mongodb';
import { col } from '@/lib/db/collections';
import type { GoalDoc, GoalMetadata, GoalRef, GoalType } from '@/lib/db/types';
import type { IsoWeekday } from '@/lib/time';

/** Los tres objetivos que recibe una cuenta nueva, en orden de aparición. */
export const DEFAULT_GOALS: {
  goalId: string;
  type: GoalType;
  label: string;
  scheduledDays: IsoWeekday[];
  dailyGoalMinutes: number;
  metadata: GoalMetadata;
}[] = [
  {
    goalId: 'reading',
    type: 'reading',
    label: 'Lectura',
    scheduledDays: [1, 2, 3, 4, 5],
    dailyGoalMinutes: 20,
    metadata: { type: 'reading', bookTitle: null, author: null },
  },
  {
    // Inglés y Estudio nacen SIN días: aparecen en Ajustes para configurarlos,
    // pero no en la Vista de Hoy ni penalizan hasta que el usuario los active.
    goalId: 'english',
    type: 'english',
    label: 'Inglés',
    scheduledDays: [],
    dailyGoalMinutes: 20,
    metadata: { type: 'english', courseName: null, level: null },
  },
  {
    goalId: 'study',
    type: 'study',
    label: 'Estudio',
    scheduledDays: [],
    dailyGoalMinutes: 25,
    metadata: { type: 'study', subject: null, topic: null },
  },
];

/** Crea los objetivos por defecto que falten. Idempotente. */
export async function ensureDefaultGoals(userId: string): Promise<void> {
  const goals = await col.goals();
  const now = new Date();

  await Promise.all(
    DEFAULT_GOALS.map((plantilla, order) =>
      goals.updateOne(
        { userId, goalId: plantilla.goalId },
        {
          $setOnInsert: {
            userId,
            ...plantilla,
            order,
            archivedAt: null,
            createdAt: now,
            updatedAt: now,
          },
        },
        { upsert: true },
      ),
    ),
  );
}

/** Objetivos activos del usuario, en el orden en que se muestran. */
export async function listGoals(userId: string): Promise<WithId<GoalDoc>[]> {
  return (await col.goals())
    .find({ userId, archivedAt: null })
    .sort({ order: 1 })
    .toArray();
}

/**
 * Objetivos archivados, del más reciente al más antiguo.
 *
 * No entran en `listGoals`, así que quedan fuera de la Vista de Hoy, de los
 * acordeones de Ajustes y de `syncAllGoals`: un objetivo archivado **deja de
 * reconciliarse y por tanto de restar perritos**. Su historial sigue intacto y
 * `/progreso` lo muestra bajo "Archivados".
 */
export async function listArchivedGoals(userId: string): Promise<WithId<GoalDoc>[]> {
  return (await col.goals())
    .find({ userId, archivedAt: { $ne: null } })
    .sort({ archivedAt: -1 })
    .toArray();
}

/*
 * Aquí vivía `goalsForDay(userId, weekday)`, que filtraba en Mongo por
 * `scheduledDays: weekday`. Se quedó sin un solo uso cuando la Vista de Hoy pasó
 * a pintar todos los objetivos activos y a decidir la jerarquía visual con
 * `isScheduledToday`: el día de la semana dejó de ser un filtro de consulta para
 * ser una propiedad de la tarjeta.
 *
 * No se conserva "por si acaso". Una función de repositorio sin usos es una
 * consulta que nadie ha visto ejecutarse contra datos reales.
 */

export async function findGoal(ref: GoalRef): Promise<WithId<GoalDoc> | null> {
  return (await col.goals()).findOne(ref);
}

/** Campos que el usuario puede cambiar de un objetivo. */
export interface GoalPatch {
  label?: string;
  scheduledDays?: IsoWeekday[];
  dailyGoalMinutes?: number;
  metadata?: GoalMetadata;
  archivedAt?: Date | null;
}

export async function updateGoal(
  ref: GoalRef,
  patch: GoalPatch,
): Promise<WithId<GoalDoc> | null> {
  const goals = await col.goals();
  return goals.findOneAndUpdate(
    ref,
    { $set: { ...patch, updatedAt: new Date() } },
    { returnDocument: 'after' },
  );
}
