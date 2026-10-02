import type { APIRoute } from 'astro';
import { z } from 'zod';
import { badRequest, json, notFound, readJson, unauthorized } from '@/lib/api';
import { findGoal, updateGoal } from '@/lib/repos/goals';
import { GOAL_OPTIONS } from '@/lib/repos/profile';
import type { IsoWeekday } from '@/lib/time';

export const prerender = false;

/**
 * Metadatos por tipo, como unión discriminada que refleja la del modelo.
 * Zod valida aquí lo mismo que TypeScript garantiza en el servidor.
 */
const MetadataSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('reading'),
    bookTitle: z.string({ message: 'El título debe ser texto.' }).max(160).nullable(),
    author: z.string({ message: 'El autor debe ser texto.' }).max(120).nullable(),
  }),
  z.object({
    type: z.literal('english'),
    courseName: z.string({ message: 'El curso debe ser texto.' }).max(160).nullable(),
    level: z.string({ message: 'El nivel debe ser texto.' }).max(40).nullable(),
  }),
  z.object({
    type: z.literal('study'),
    subject: z.string({ message: 'La materia debe ser texto.' }).max(120).nullable(),
    topic: z.string({ message: 'El tema debe ser texto.' }).max(160).nullable(),
  }),
]);

const PatchSchema = z.object({
  label: z.string({ message: 'El nombre debe ser texto.' }).trim().min(1).max(60).optional(),
  /**
   * Un objetivo SÍ puede quedarse sin días: así se desactiva sin archivarlo.
   * Es la diferencia con el perfil de la Tanda 4, que exigía al menos uno.
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
    .max(7)
    .transform((days) => [...new Set(days)].sort((a, b) => a - b) as IsoWeekday[])
    .optional(),
  dailyGoalMinutes: z
    .number({ message: 'La meta debe ser un número de minutos.' })
    .int('La meta debe ser un número entero de minutos.')
    .refine(
      (m) => (GOAL_OPTIONS as readonly number[]).includes(m),
      `La meta debe ser una de: ${GOAL_OPTIONS.join(', ')} minutos.`,
    )
    .optional(),
  metadata: MetadataSchema.optional(),
  archived: z.boolean().optional(),
});

export const PATCH: APIRoute = async ({ locals, params, request }) => {
  if (!locals.user) return unauthorized();

  const ref = { userId: locals.user.id, goalId: params.goalId! };
  const goal = await findGoal(ref);
  // Un objetivo ajeno es indistinguible de uno inexistente: no se filtra que exista.
  if (!goal) return notFound('No encontramos ese objetivo.');

  const body = await readJson(request);
  if (body === null) return badRequest('Cuerpo JSON inválido.');

  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0]?.message ?? 'Datos inválidos.');
  }

  // Sin esto, un PATCH podría convertir un objetivo de lectura en uno de inglés
  // y dejar el metadato incoherente con su tipo.
  if (parsed.data.metadata && parsed.data.metadata.type !== goal.type) {
    return badRequest('Los metadatos no corresponden al tipo de este objetivo.');
  }

  const { archived, ...resto } = parsed.data;
  const updated = await updateGoal(ref, {
    ...resto,
    ...(archived === undefined ? {} : { archivedAt: archived ? new Date() : null }),
  });

  return json({ goal: updated });
};
