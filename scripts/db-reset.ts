/**
 * Vacía TODAS las colecciones de la app y las de Better Auth.
 *
 *   ALLOW_DB_RESET=yes npm run db:reset
 *
 * Interruptor de seguridad deliberado: sin `ALLOW_DB_RESET=yes` el script no
 * borra nada. Nunca dejes esa variable activada en Vercel.
 */
import 'dotenv/config';
import { closeMongoClient, getDb } from '@/lib/db/client';
import { APP_COLLECTIONS, BETTER_AUTH_COLLECTIONS } from '@/lib/db/types';

async function main(): Promise<void> {
  if (process.env.ALLOW_DB_RESET !== 'yes') {
    console.error('✗ Reset bloqueado.');
    console.error('  Para confirmar:  ALLOW_DB_RESET=yes npm run db:reset');
    process.exitCode = 1;
    return;
  }

  const db = await getDb();
  const targets = [...APP_COLLECTIONS, ...BETTER_AUTH_COLLECTIONS];

  console.log(`⚠  Vaciando la base de datos "${db.databaseName}"`);
  console.log(`   Colecciones: ${targets.join(', ')}\n`);

  const existing = new Set(
    (await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name),
  );

  for (const name of targets) {
    if (!existing.has(name)) {
      console.log(`  −  ${name} (no existía)`);
      continue;
    }
    // deleteMany en lugar de drop: conserva los índices creados por db:init.
    const { deletedCount } = await db.collection(name).deleteMany({});
    console.log(`  ✓  ${name}: ${deletedCount} documento(s) eliminado(s)`);
  }

  console.log('\n✓ Base de datos limpia. Los índices se mantienen intactos.');
}

main()
  .catch((error: unknown) => {
    console.error('\n✗ Fallo al limpiar la base de datos:');
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(closeMongoClient);
