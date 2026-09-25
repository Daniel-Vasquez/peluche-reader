import type { WithId } from 'mongodb';
import type { ReadingSessionDoc } from '@/lib/db/types';
import { elapsedSeconds } from '@/lib/repos/sessions';

/**
 * Forma que viaja al navegador. El cliente **no** recalcula el tiempo: pinta un
 * contador local partiendo de `elapsedSeconds` y se resincroniza con cada
 * respuesta del servidor.
 */
export interface SessionView {
  id: string;
  dayKey: string;
  bookTitle: string | null;
  status: ReadingSessionDoc['status'];
  /** Segundos de lectura en el momento de responder. Autoritativo. */
  elapsedSeconds: number;
  /** `true` si el reloj corre ahora mismo. */
  running: boolean;
  startedAt: string;
}

export function toSessionView(
  session: WithId<ReadingSessionDoc>,
  now = new Date(),
): SessionView {
  return {
    id: String(session._id),
    dayKey: session.dayKey,
    bookTitle: session.bookTitle,
    status: session.status,
    elapsedSeconds: elapsedSeconds(session, now),
    running: session.status === 'running',
    startedAt: session.startedAt.toISOString(),
  };
}
