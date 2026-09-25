import { betterAuth } from 'better-auth';
import { APIError } from 'better-auth/api';
import { mongodbAdapter } from 'better-auth/adapters/mongodb';
import { checkName } from '@/lib/name';
import { getDb, getMongoClient } from '@/lib/db/client';
import { readEnv, readEnvOr, requireEnv } from '@/lib/env';

/**
 * Instancia de Better Auth (lado servidor).
 *
 * Autenticación deliberadamente minimalista: correo + contraseña, sin
 * verificación de email, sin 2FA y sin recuperación de contraseña. La sesión
 * persiste 30 días.
 *
 * Se construye de forma **perezosa y cacheada**, igual que la conexión a Mongo:
 * `betterAuth()` necesita un `Db` ya conectado, y hacerlo con `await` en el tope
 * del módulo abriría una conexión durante `astro build` (cuando Astro carga el
 * entrypoint del servidor para prerenderizar). Con `getAuth()` la conexión solo
 * ocurre al atender la primera petición real.
 */

async function createAuth() {
  const [db, client] = await Promise.all([getDb(), getMongoClient()]);

  // Si falta, `requireEnv` explica dónde ponerlo. Genéralo con:
  //   openssl rand -base64 32
  const secret = requireEnv('BETTER_AUTH_SECRET');
  const vercelUrl = readEnv('VERCEL_URL');

  return betterAuth({
    // Pasar el `client` además del `db` habilita transacciones (Atlas es un
    // replica set). En un MongoDB standalone habría que poner transaction: false.
    database: mongodbAdapter(db, { client }),
    secret,
    baseURL: readEnvOr('BETTER_AUTH_URL', 'http://localhost:4321'),

    emailAndPassword: {
      enabled: true,
      autoSignIn: true,              // tras registrarse, la sesión ya está abierta
      requireEmailVerification: false,
      minPasswordLength: 8,
    },

    session: {
      expiresIn: 60 * 60 * 24 * 30,  // 30 días
      updateAge: 60 * 60 * 24,       // refresca la cookie como máximo 1 vez al día
      // Cachea la sesión en la cookie firmada: evita un viaje a Mongo en cada
      // request del middleware, que se ejecuta para TODAS las rutas.
      cookieCache: { enabled: true, maxAge: 5 * 60 },
    },

    advanced: {
      defaultCookieAttributes: {
        sameSite: 'lax',
        secure: readEnv('NODE_ENV') === 'production',
      },
    },

    databaseHooks: {
      user: {
        create: {
          // El nombre es la base de toda la personalización, así que se valida y
          // normaliza también aquí: el formulario de React no es una barrera
          // (cualquiera puede hacer POST a /api/auth/sign-up/email directamente).
          before: async (user) => {
            const result = checkName(String(user.name ?? ''));
            if (!result.ok) {
              throw new APIError('BAD_REQUEST', { message: result.error });
            }
            return { data: { ...user, name: result.name } };
          },
        },
        update: {
          // `/ajustes` permite renombrarse. El `before` de update recibe un
          // `Partial<User>`: solo valida si el nombre viene en esta petición.
          before: async (user) => {
            if (user.name === undefined) return;
            const result = checkName(String(user.name));
            if (!result.ok) {
              throw new APIError('BAD_REQUEST', { message: result.error });
            }
            return { data: { ...user, name: result.name } };
          },
        },
      },
    },

    // Los despliegues de vista previa de Vercel tienen un dominio distinto en
    // cada build; sin esto, Better Auth rechazaría sus peticiones.
    trustedOrigins: vercelUrl ? [`https://${vercelUrl}`] : [],
  });
}

const GLOBAL_KEY = '__readingAppAuth__';

type GlobalWithAuth = typeof globalThis & {
  [GLOBAL_KEY]?: ReturnType<typeof createAuth>;
};

/** Devuelve la instancia de Better Auth, creándola en el primer uso. */
export function getAuth(): ReturnType<typeof createAuth> {
  const g = globalThis as GlobalWithAuth;
  if (!g[GLOBAL_KEY]) g[GLOBAL_KEY] = createAuth();
  return g[GLOBAL_KEY];
}

export type Auth = Awaited<ReturnType<typeof createAuth>>;
export type Session = Auth['$Infer']['Session'];
export type SessionUser = Session['user'];
