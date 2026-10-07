import { defineMiddleware } from 'astro:middleware';
import { getAuth } from '@/lib/auth';

/**
 * Rutas que exigen sesión y se comparan por **prefijo**.
 *
 * `/` no puede estar aquí: `'/login'.startsWith('/')` es `true`, así que la
 * Vista de Hoy en la raíz dejaría protegido el propio login, el registro, los
 * endpoints y los assets, y la app entera entraría en un bucle de redirecciones.
 * Por eso la raíz se compara aparte, exacta.
 */
const PROTECTED_PREFIXES = ['/progreso', '/ajustes', '/sesion'];

/** Rutas que exigen sesión con **coincidencia exacta**. */
const PROTECTED_PATHS = ['/'];

/** Rutas que no tienen sentido con sesión abierta. Coincidencia exacta. */
const GUEST_ONLY_PATHS = ['/login', '/registro'];

/** La Vista de Hoy: a donde va el usuario con sesión abierta. */
const HOME_PATH = '/';

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

  const requiereSesion =
    PROTECTED_PATHS.includes(path) || PROTECTED_PREFIXES.some((p) => path.startsWith(p));

  if (!context.locals.user && requiereSesion) {
    return context.redirect(`/login?next=${encodeURIComponent(path)}`, 302);
  }

  if (context.locals.user && GUEST_ONLY_PATHS.includes(path)) {
    return context.redirect(HOME_PATH, 302);
  }

  return next();
});
