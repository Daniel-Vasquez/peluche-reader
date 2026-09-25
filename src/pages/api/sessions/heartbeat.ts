import { ObjectId } from 'mongodb';
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { badRequest, json, notFound, readJson, unauthorized } from '@/lib/api';
import { col } from '@/lib/db/collections';
import { pauseSession, resumeSession } from '@/lib/repos/sessions';
import { toSessionView } from '@/lib/sessions-view';

export const prerender = false;

const BodySchema = z.object({
  // El mensaje va en el constructor, no solo en `.min()`: si el campo falta
  // por completo, `.min()` no llega a evaluarse y Zod respondería en inglés.
  sessionId: z
    .string({ message: 'Falta el identificador de la sesión.' })
    .min(1, 'Falta el identificador de la sesión.'),
  action: z.enum(['pause', 'resume', 'ping'], {
    message: 'La acción debe ser pause, resume o ping.',
  }),
});

/**
 * Pausa, reanuda o solo consulta el estado.
 *
 * `ping` existe para que el cliente se resincronice cada 30 s y al volver a la
 * pestaña: el `setInterval` del navegador se congela cuando la pestaña duerme,
 * así que su contador se desvía del tiempo real.
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
  // El filtro incluye `userId`: nunca confíes en el sessionId del cliente sin
  // comprobar que la sesión es suya.
  const session = await sessions.findOne({
    _id: new ObjectId(parsed.data.sessionId),
    userId: locals.user.id,
  });
  if (!session) return notFound('No encontramos esa sesión.');

  const now = new Date();
  const updated =
    parsed.data.action === 'pause'
      ? await pauseSession(session, now)
      : parsed.data.action === 'resume'
        ? await resumeSession(session, now)
        : session;

  return json({ session: toSessionView(updated, now) });
};
