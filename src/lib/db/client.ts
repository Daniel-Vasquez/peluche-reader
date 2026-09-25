import { MongoClient, type Db } from 'mongodb';
import { requireEnv } from '@/lib/env';

/**
 * Conexión única a MongoDB, cacheada en el ámbito global.
 *
 * Por qué el global: en Vercel cada invocación puede reutilizar el proceso, y en
 * desarrollo el hot-reload reevalúa los módulos. Sin esta caché se abriría un
 * pool nuevo cada vez y Atlas agotaría su límite de conexiones.
 *
 * Por qué perezosa (y no validada en el tope del módulo): así importar este
 * archivo nunca falla durante `astro build`, donde las variables de entorno
 * pueden no estar disponibles todavía. El error salta al primer uso real.
 */

const GLOBAL_KEY = '__readingAppMongoClient__';

type GlobalWithMongo = typeof globalThis & {
  [GLOBAL_KEY]?: Promise<MongoClient>;
};

export function getMongoClient(): Promise<MongoClient> {
  const g = globalThis as GlobalWithMongo;
  if (!g[GLOBAL_KEY]) {
    const client = new MongoClient(requireEnv('MONGODB_URI'), {
      maxPoolSize: 10,
      minPoolSize: 0,
      serverSelectionTimeoutMS: 8_000,
      // Cierra conexiones ociosas: en serverless no hay a quién servir entre
      // invocaciones y mantenerlas abiertas solo consume cuota de Atlas.
      maxIdleTimeMS: 60_000,
    });
    g[GLOBAL_KEY] = client.connect();
  }
  return g[GLOBAL_KEY];
}

export async function getDb(): Promise<Db> {
  const client = await getMongoClient();
  return client.db(requireEnv('MONGODB_DB_NAME'));
}

/**
 * Cierra la conexión y limpia la caché. **Solo para scripts**: si se llama en
 * una petición, la siguiente tendría que reconectar desde cero.
 */
export async function closeMongoClient(): Promise<void> {
  const g = globalThis as GlobalWithMongo;
  const pending = g[GLOBAL_KEY];
  if (!pending) return;
  delete g[GLOBAL_KEY];
  await (await pending).close();
}
