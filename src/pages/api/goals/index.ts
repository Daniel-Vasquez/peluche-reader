import type { APIRoute } from 'astro';
import { json, unauthorized } from '@/lib/api';
import { ensureDefaultGoals, listGoals } from '@/lib/repos/goals';

export const prerender = false;

/**
 * Objetivos activos del usuario, en el orden en que se muestran.
 *
 * Garantiza los tres por defecto antes de listar: una cuenta creada antes de la
 * migración podría no tenerlos.
 */
export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user) return unauthorized();
  await ensureDefaultGoals(locals.user.id);
  return json({ goals: await listGoals(locals.user.id) });
};
