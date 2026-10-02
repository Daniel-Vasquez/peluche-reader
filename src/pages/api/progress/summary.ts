import type { APIRoute } from 'astro';
import { badRequest, json, unauthorized } from '@/lib/api';
import { buildProgressSummary } from '@/lib/repos/summary';

export const prerender = false;

/**
 * Todo el dashboard de UN objetivo en una sola respuesta. Nada de una petición
 * por gráfica: las cifras tienen que salir del mismo corte temporal o se
 * contradicen entre sí.
 */
export const GET: APIRoute = async ({ locals, url }) => {
  if (!locals.user) return unauthorized();

  const goalId = url.searchParams.get('goalId');
  if (!goalId) return badRequest('Falta el parámetro `goalId`.');

  const requested = Number(url.searchParams.get('days'));
  const days = Number.isFinite(requested) ? Math.min(Math.max(requested, 7), 120) : 30;

  return json(await buildProgressSummary({ userId: locals.user.id, goalId }, days));
};
