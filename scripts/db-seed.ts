/**
 * Genera datos de demostración (usuario + 3 semanas de historia leyendo
 * "Influencia: La Psicología de la Persuasión").
 *
 *   npm run db:seed
 *
 * Se implementa en la **Tanda 9**: debe pasar por `settleSession` y `reconcile`
 * en vez de escribir `gameState` a mano, para que el seed funcione además como
 * test de integración del motor de gamificación.
 */
import 'dotenv/config';
import { closeMongoClient, getDb } from '@/lib/db/client';

async function main(): Promise<void> {
  const db = await getDb();
  console.log(`Base de datos: ${db.databaseName}`);
  console.log('\nℹ  `db:seed` se implementa en la Tanda 9 (requiere el motor de');
  console.log('   gamificación de la Tanda 6 y la integración de la Tanda 7).');
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(closeMongoClient);
