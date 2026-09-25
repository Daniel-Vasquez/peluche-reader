import { ObjectId } from 'mongodb';
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { badRequest, json, notFound, readJson, unauthorized } from '@/lib/api';
import { col } from '@/lib/db/collections';
import {
  completedSecondsForDay,
  finishSession,
  MIN_SESSION_SECONDS,
} from '@/lib/repos/sessions';
import { toSessionView } from '@/lib/sessions-view';

export const prerender = false;

const BodySchema = z.object({
  // El mensaje va en el constructor, no solo en `.min()`: si el campo falta
  // por completo, `.min()` no llega a evaluarse y Zod respondería en inglés.
  sessionId: z
    .string({ message: 'Falta el identificador de la sesión.' })
    .min(1, 'Falta el identificador de la sesión.'),
});

/**
 * Cierra la sesión y devuelve el total del día.
 *
 * En la **Tanda 7** este mismo endpoint liquidará además los perritos, llamando
 * a `settleSession()` justo después de cerrar.
 */
export const POST: APIRoute = async ({ locals, request }) => {
  if (!locals.user) return unauthorized();

  const body = await readJson(request);
  if (body === null) return badRequest('Cuerpo JSON inválido.');

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0]?.message ?? 'Datos inválidos.');
  }
  if (!ObjectId.isValid(parsed.data.sessionId)) {
    return badRequest('Identificador de sesión inválido.');
  }

  const sessions = await col.sessions();
  const session = await sessions.findOne({
    _id: new ObjectId(parsed.data.sessionId),
    userId: locals.user.id,
  });
  if (!session) return notFound('No encontramos esa sesión.');

  const now = new Date();
  const closed = await finishSession(session, now);
  const daySeconds = await completedSecondsForDay(locals.user.id, closed.dayKey);

  return json({
    session: toSessionView(closed, now),
    /** `false` cuando no llegó al mínimo y por tanto no puntúa. */
    counted: closed.status === 'completed',
    minSessionSeconds: MIN_SESSION_SECONDS,
    daySeconds,
  });
};
