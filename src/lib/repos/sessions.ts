import type { WithId } from 'mongodb';
import { col } from '@/lib/db/collections';
import type { ReadingSessionDoc, SessionStatus } from '@/lib/db/types';

/** Bajo este umbral una sesión no cuenta para nada (anti-toque accidental). */
export const MIN_SESSION_SECONDS = 60;

/**
 * Una sesión abierta más vieja que esto se considera abandonada: el usuario
 * cerró la pestaña y se fue. No se le regala el tiempo transcurrido.
 */
export const STALE_SESSION_HOURS = 6;

/**
 * Tiempo real de lectura de una sesión, **calculado en el servidor**.
 *
 * El navegador no es de fiar (pestaña dormida, reloj cambiado, F5), así que el
 * documento guarda los tramos ya cerrados en `accumulatedSeconds` y el inicio
 * del tramo en curso en `lastResumedAt`. En pausa, `lastResumedAt` es `null`.
 */
export function elapsedSeconds(session: ReadingSessionDoc, now = new Date()): number {
  const live = session.lastResumedAt
    ? Math.floor((now.getTime() - session.lastResumedAt.getTime()) / 1000)
    : 0;
  return session.accumulatedSeconds + Math.max(0, live);
}

/** Estados en los que la sesión sigue viva y el usuario puede retomarla. */
const OPEN_STATUSES: SessionStatus[] = ['running', 'paused'];

/** La sesión abierta del usuario, si existe. */
export async function findOpenSession(
  userId: string,
): Promise<WithId<ReadingSessionDoc> | null> {
  const sessions = await col.sessions();
  return sessions.findOne(
    { userId, status: { $in: OPEN_STATUSES } },
    { sort: { startedAt: -1 } },
  );
}

/**
 * Cierra como abandonadas las sesiones abiertas demasiado antiguas.
 * Devuelve cuántas cerró.
 */
export async function abandonStaleSessions(
  userId: string,
  now = new Date(),
): Promise<number> {
  const sessions = await col.sessions();
  const cutoff = new Date(now.getTime() - STALE_SESSION_HOURS * 3_600_000);

  const stale = await sessions
    .find({ userId, status: { $in: OPEN_STATUSES }, startedAt: { $lt: cutoff } })
    .toArray();

  for (const session of stale) {
    await sessions.updateOne(
      { _id: session._id },
      {
        $set: {
          status: 'abandoned',
          lastResumedAt: null,
          // No se acredita el tramo en curso: nadie estaba leyendo.
          durationSeconds: session.accumulatedSeconds,
          endedAt: now,
          updatedAt: now,
        },
      },
    );
  }
  return stale.length;
}

/**
 * Abre una sesión, o devuelve la que ya estuviera abierta.
 *
 * Nunca crea una segunda sesión simultánea: si el usuario abre dos pestañas,
 * las dos trabajan sobre la misma.
 */
export async function startSession(
  userId: string,
  dayKeyValue: string,
  bookTitle: string | null,
  now = new Date(),
): Promise<{ session: WithId<ReadingSessionDoc>; resumed: boolean }> {
  await abandonStaleSessions(userId, now);

  const existing = await findOpenSession(userId);
  if (existing) return { session: existing, resumed: true };

  const sessions = await col.sessions();
  const doc: ReadingSessionDoc = {
    userId,
    dayKey: dayKeyValue,
    bookTitle,
    status: 'running',
    startedAt: now,
    lastResumedAt: now,
    accumulatedSeconds: 0,
    endedAt: null,
    durationSeconds: 0,
    settledAt: null,
    createdAt: now,
    updatedAt: now,
  };

  const { insertedId } = await sessions.insertOne(doc);
  return { session: { ...doc, _id: insertedId }, resumed: false };
}

/** Pausa: consolida el tramo en curso y detiene el reloj. Idempotente. */
export async function pauseSession(
  session: WithId<ReadingSessionDoc>,
  now = new Date(),
): Promise<WithId<ReadingSessionDoc>> {
  if (session.status !== 'running') return session;

  const sessions = await col.sessions();
  const accumulated = elapsedSeconds(session, now);

  const updated = await sessions.findOneAndUpdate(
    { _id: session._id, status: 'running' },
    {
      $set: {
        status: 'paused',
        accumulatedSeconds: accumulated,
        lastResumedAt: null,
        updatedAt: now,
      },
    },
    { returnDocument: 'after' },
  );
  return updated ?? session;
}

/** Reanuda: reabre el tramo en curso. Idempotente. */
export async function resumeSession(
  session: WithId<ReadingSessionDoc>,
  now = new Date(),
): Promise<WithId<ReadingSessionDoc>> {
  if (session.status !== 'paused') return session;

  const sessions = await col.sessions();
  const updated = await sessions.findOneAndUpdate(
    { _id: session._id, status: 'paused' },
    { $set: { status: 'running', lastResumedAt: now, updatedAt: now } },
    { returnDocument: 'after' },
  );
  return updated ?? session;
}

/**
 * Cierra la sesión definitivamente.
 *
 * Bajo `MIN_SESSION_SECONDS` se marca `abandoned` en vez de `completed`, así que
 * no puntúa. La liquidación de perritos ocurre en la Tanda 7, **después** de
 * esto y solo si el estado es `completed`.
 */
export async function finishSession(
  session: WithId<ReadingSessionDoc>,
  now = new Date(),
): Promise<WithId<ReadingSessionDoc>> {
  if (session.status === 'completed' || session.status === 'abandoned') {
    return session;
  }

  const sessions = await col.sessions();
  const duration = elapsedSeconds(session, now);
  const status: SessionStatus = duration < MIN_SESSION_SECONDS ? 'abandoned' : 'completed';

  const updated = await sessions.findOneAndUpdate(
    { _id: session._id, status: { $in: OPEN_STATUSES } },
    {
      $set: {
        status,
        accumulatedSeconds: duration,
        durationSeconds: duration,
        lastResumedAt: null,
        endedAt: now,
        updatedAt: now,
      },
    },
    { returnDocument: 'after' },
  );
  return updated ?? session;
}

/** Segundos totales de lectura completada del usuario en un día. */
export async function completedSecondsForDay(
  userId: string,
  dayKeyValue: string,
): Promise<number> {
  const sessions = await col.sessions();
  const [row] = await sessions
    .aggregate<{ total: number }>([
      { $match: { userId, dayKey: dayKeyValue, status: 'completed' } },
      { $group: { _id: null, total: { $sum: '$durationSeconds' } } },
    ])
    .toArray();
  return row?.total ?? 0;
}
