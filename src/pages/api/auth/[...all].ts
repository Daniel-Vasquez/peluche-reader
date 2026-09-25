import type { APIRoute } from 'astro';
import { getAuth } from '@/lib/auth';

// Nunca prerenderizar: estas rutas leen cookies y escriben en la base de datos.
export const prerender = false;

/**
 * Delega todas las rutas de Better Auth (`/api/auth/sign-in/email`,
 * `/api/auth/sign-up/email`, `/api/auth/sign-out`, `/api/auth/get-session`…)
 * a su handler. `ALL` cubre cualquier método HTTP.
 */
export const ALL: APIRoute = async ({ request }) => {
  const auth = await getAuth();
  return auth.handler(request);
};
