import type { APIRoute } from 'astro';
import { z } from 'zod';
import { ensureProfile, GOAL_OPTIONS, updateProfile } from '@/lib/repos/profile';
import { isValidTimezone, type IsoWeekday } from '@/lib/time';

export const prerender = false;

const PatchSchema = z.object({
  /**
   * Al menos un día. Un usuario con `scheduledDays: []` no podría perder ni
   * ganar perritos por compromiso, y la gamificación se quedaría sin sentido.
   */
  scheduledDays: z
    .array(
      z
        .number({ message: 'Los días deben ser números.' })
        .int('Los días deben ser números enteros.')
        .min(1, 'Día de la semana inválido: debe estar entre 1 (lunes) y 7 (domingo).')
        .max(7, 'Día de la semana inválido: debe estar entre 1 (lunes) y 7 (domingo).'),
      { message: 'Los días deben venir en una lista.' },
    )
    .min(1, 'Elige al menos un día de la semana.')
    .max(7)
    .transform((days) => [...new Set(days)].sort((a, b) => a - b) as IsoWeekday[])
    .optional(),

  timezone: z
    .string({ message: 'La zona horaria debe ser texto.' })
    .refine(isValidTimezone, 'Zona horaria no reconocida.')
    .optional(),

  dailyGoalMinutes: z
    .number({ message: 'La meta debe ser un número de minutos.' })
    .int('La meta debe ser un número entero de minutos.')
    .refine(
      (m) => (GOAL_OPTIONS as readonly number[]).includes(m),
      `La meta debe ser una de: ${GOAL_OPTIONS.join(', ')} minutos.`,
    )
    .optional(),

  currentBookTitle: z
    .string({ message: 'El título del libro debe ser texto.' })
    .max(160, 'El título no puede pasar de 160 caracteres.')
    .transform((t) => t.trim())
    // Un título vacío se guarda como null, no como "".
    .transform((t) => (t.length === 0 ? null : t))
    .nullable()
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
