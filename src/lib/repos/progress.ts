import type { WithId } from 'mongodb';
import { col } from '@/lib/db/collections';
import type { DailyProgressDoc, DayOutcome } from '@/lib/db/types';
import { weekKeyFromDayKey } from '@/lib/time';

/**
 * Suma una sesión al agregado del día y devuelve el documento resultante.
 *
 * `$inc` con `upsert` es atómico: dos sesiones terminando a la vez suman las dos,
 * y el índice único `(userId, dayKey)` impide que se cree un segundo documento.
 */
export async function addSessionToDay(
  userId: string,
  dayKey: string,
  seconds: number,
  scheduled: boolean,
): Promise<WithId<DailyProgressDoc>> {
  const progress = await col.dailyProgress();
  const result = await progress.findOneAndUpdate(
    { userId, dayKey },
    {
      $inc: { totalSeconds: seconds, sessionsCount: 1 },
      $set: { weekKey: weekKeyFromDayKey(dayKey), scheduled, updatedAt: new Date() },
      $setOnInsert: { dogsAwarded: 0, outcome: 'pending' satisfies DayOutcome },
    },
    { upsert: true, returnDocument: 'after' },
  );
  if (!result) throw new Error(`No se pudo registrar el día ${dayKey} de ${userId}`);
  return result;
}

/** Lee el progreso de un día, sin crearlo. */
export async function findDayProgress(
  userId: string,
  dayKey: string,
): Promise<WithId<DailyProgressDoc> | null> {
  return (await col.dailyProgress()).findOne({ userId, dayKey });
}

/**
 * Fija el total de perritos ya otorgados por un día.
 *
 * Es la pieza que hace idempotente la recompensa: `settle` solo entrega la
 * diferencia contra este valor.
 */
export async function setDogsAwarded(
  userId: string,
  dayKey: string,
  totalDogs: number,
): Promise<void> {
  const progress = await col.dailyProgress();
  await progress.updateOne(
    { userId, dayKey },
    {
      $set: {
        dogsAwarded: totalDogs,
        outcome: (totalDogs > 0 ? 'completed' : 'pending') satisfies DayOutcome,
        updatedAt: new Date(),
      },
    },
  );
}

/**
 * Anota cómo terminó un día cerrado (`missed` o `rest`) sin tocar los contadores.
 * `upsert` porque un día sin ninguna sesión no tiene documento todavía.
 */
export async function setDayOutcome(
  userId: string,
  dayKey: string,
  outcome: DayOutcome,
): Promise<void> {
  const progress = await col.dailyProgress();
  await progress.updateOne(
    { userId, dayKey },
    {
      $set: { outcome, weekKey: weekKeyFromDayKey(dayKey), updatedAt: new Date() },
      $setOnInsert: {
        totalSeconds: 0,
        sessionsCount: 0,
        dogsAwarded: 0,
        scheduled: outcome === 'missed',
      },
    },
    { upsert: true },
  );
}

/** Días con lectura suficiente en un rango. Alimenta la reconciliación. */
export async function completedDayKeysBetween(
  userId: string,
  fromDayKey: string,
  toDayKey: string,
): Promise<Set<string>> {
  const progress = await col.dailyProgress();
  const rows = await progress
    .find(
      { userId, dayKey: { $gte: fromDayKey, $lte: toDayKey }, dogsAwarded: { $gt: 0 } },
      { projection: { dayKey: 1 } },
    )
    .toArray();
  return new Set(rows.map((r) => r.dayKey));
}

/** Progreso de un rango de días, ordenado. Para el dashboard de la Tanda 8. */
export async function dayProgressBetween(
  userId: string,
  fromDayKey: string,
  toDayKey: string,
): Promise<WithId<DailyProgressDoc>[]> {
  const progress = await col.dailyProgress();
  return progress
    .find({ userId, dayKey: { $gte: fromDayKey, $lte: toDayKey } })
    .sort({ dayKey: 1 })
    .toArray();
}
