import type { APIRoute } from 'astro';
import { badRequest, json, readJson, unauthorized } from '@/lib/api';
import { ensureProfile } from '@/lib/repos/profile';
import { startSession } from '@/lib/repos/sessions';
import { toSessionView } from '@/lib/sessions-view';
import { dayKey } from '@/lib/time';

export const prerender = false;

/**
 * Abre una sesión de lectura, o devuelve la que ya estuviera abierta.
 *
 * Idempotente a propósito: recargar la página o abrir una segunda pestaña no
 * debe crear dos cronómetros.
 */
export const POST: APIRoute = async ({ locals, request }) => {
  if (!locals.user) return unauthorized();

  const body = await readJson(request);
  if (body === null) return badRequest('Cuerpo JSON inválido.');

  const profile = await ensureProfile(locals.user.id);
  const now = new Date();

  // El libro del perfil es el valor por defecto; el cliente puede sobreescribirlo
  // para esta sesión concreta sin cambiar el perfil.
  const override = (body as { bookTitle?: unknown }).bookTitle;
  const bookTitle =
    typeof override === 'string' && override.trim().length > 0
      ? override.trim().slice(0, 160)
      : profile.currentBookTitle;

  const { session, resumed } = await startSession(
    locals.user.id,
    dayKey(now, profile.timezone),
    bookTitle,
    now,
  );

  return json({ session: toSessionView(session, now), resumed });
};
