import type { APIRoute } from 'astro';
import { z } from 'zod';
import { badRequest, json, notFound, readJson, unauthorized } from '@/lib/api';
import { goalContext } from '@/lib/db/types';
import { findGoal } from '@/lib/repos/goals';
import { ensureProfile } from '@/lib/repos/profile';
import { startSession } from '@/lib/repos/sessions';
import { toSessionView } from '@/lib/sessions-view';
import { dayKey } from '@/lib/time';

export const prerender = false;

const BodySchema = z.object({
  goalId: z
    .string({ message: 'Falta el objetivo de la sesión.' })
    .min(1, 'Falta el objetivo de la sesión.'),
});

/**
 * Abre una sesión del objetivo indicado, o devuelve la que ya estuviera abierta.
 *
 * Idempotente a propósito: recargar la página o abrir una segunda pestaña no
 * debe crear dos cronómetros. Si la sesión abierta pertenece a OTRO objetivo se
 * devuelve igualmente, con `resumed: true`; es quien llama —la pantalla de
 * sesión— quien decide qué mostrar, porque no se puede leer y estudiar a la vez.
 */
export const POST: APIRoute = async ({ locals, request }) => {
  if (!locals.user) return unauthorized();

  const body = await readJson(request);
  if (body === null) return badRequest('Cuerpo JSON inválido.');

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0]?.message ?? 'Datos inválidos.');
  }

  const ref = { userId: locals.user.id, goalId: parsed.data.goalId };
  const goal = await findGoal(ref);
  if (!goal) return notFound('No encontramos ese objetivo.');

  const profile = await ensureProfile(locals.user.id);
  const now = new Date();

  // El contexto sale del objetivo, no del cliente: un navegador no debería poder
  // decidir con qué libro o tema se guarda una sesión.
  const { session, resumed } = await startSession(
    ref,
    dayKey(now, profile.timezone),
    goalContext(goal.metadata),
    now,
  );

  return json({ session: toSessionView(session, now), resumed });
};
