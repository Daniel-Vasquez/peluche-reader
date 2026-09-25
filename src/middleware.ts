import { defineMiddleware } from 'astro:middleware';
import { getAuth } from '@/lib/auth';

/** Rutas que exigen sesión. Se comparan con `startsWith`. */
const PROTECTED_PREFIXES = ['/app', '/progreso', '/ajustes'];

/** Rutas que no tienen sentido con sesión abierta. Coincidencia exacta. */
const GUEST_ONLY_PATHS = ['/login', '/registro'];

export const onRequest = defineMiddleware(async (context, next) => {
  // Las rutas prerenderizadas no tienen usuario: se generan en `astro build`,
  // antes de que exista una petición. Salir aquí evita además abrir una conexión
  // a MongoDB durante el build.
  if (context.isPrerendered) {
    context.locals.user = null;
    context.locals.session = null;
    return next();
  }

  const path = context.url.pathname;

  // El handler de Better Auth gestiona sus propias cookies; pedirle la sesión
  // aquí sería trabajo duplicado en cada login.
  if (path.startsWith('/api/auth/')) {
    context.locals.user = null;
    context.locals.session = null;
    return next();
  }

  const auth = await getAuth();
  const data = await auth.api.getSession({ headers: context.request.headers });

  context.locals.user = data?.user ?? null;
  context.locals.session = data?.session ?? null;

  if (!context.locals.user && PROTECTED_PREFIXES.some((p) => path.startsWith(p))) {
    return context.redirect(`/login?next=${encodeURIComponent(path)}`, 302);
  }

  if (context.locals.user && GUEST_ONLY_PATHS.includes(path)) {
    return context.redirect('/app', 302);
  }

  return next();
});
