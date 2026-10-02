import type { APIRoute } from 'astro';
import { z } from 'zod';
import { ensureProfile, updateProfile } from '@/lib/repos/profile';
import { isValidTimezone } from '@/lib/time';

export const prerender = false;

/**
 * Solo la zona horaria: los días, la meta y el libro son de cada objetivo y se
 * editan por `/api/goals/[goalId]`.
 */
const PatchSchema = z.object({
  timezone: z
    .string({ message: 'La zona horaria debe ser texto.' })
    .refine(isValidTimezone, 'Zona horaria no reconocida.')
    .optional(),
});


function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user) return json({ error: 'No autenticado.' }, 401);
  const profile = await ensureProfile(locals.user.id);
  return json({ profile });
};

export const PATCH: APIRoute = async ({ locals, request }) => {
  if (!locals.user) return json({ error: 'No autenticado.' }, 401);

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return json({ error: 'Cuerpo JSON inválido.' }, 400);
  }

  const parsed = PatchSchema.safeParse(raw);
  if (!parsed.success) {
    // Se devuelve el primer mensaje: el formulario muestra uno a la vez.
    const first = parsed.error.issues[0];
    return json({ error: first?.message ?? 'Datos inválidos.' }, 400);
  }

  const profile = await updateProfile(locals.user.id, parsed.data);
  return json({ profile });
};
