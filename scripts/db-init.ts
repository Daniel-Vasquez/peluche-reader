/**
 * Crea los índices de MongoDB. Idempotente: se puede ejecutar N veces.
 *
 *   npm run db:init
 *
 * Ejecútalo también contra la base de PRODUCCIÓN antes del primer despliegue.
 */
import 'dotenv/config';
import { closeMongoClient, getDb } from '@/lib/db/client';

async function main(): Promise<void> {
  const db = await getDb();
  console.log(`Base de datos: ${db.databaseName}\n`);

  const created: string[] = [];
  const index = async (collection: string, name: string, promise: Promise<string>) => {
    await promise;
    created.push(`  ${collection}.${name}`);
  };

  // Un perfil y un estado de juego por usuario. El índice único es la garantía
  // de que dos peticiones concurrentes no creen duplicados vía upsert.
  await index('profiles', 'userId (único)',
    db.collection('profiles').createIndex({ userId: 1 }, { unique: true }));

  await index('gameState', 'userId (único)',
    db.collection('gameState').createIndex({ userId: 1 }, { unique: true }));

  // Clave del agregado diario. Sin este índice único, el upsert de
  // `addSessionToDay` (Tanda 7) podría crear dos documentos para el mismo día.
  await index('dailyProgress', 'userId+dayKey (único)',
    db.collection('dailyProgress').createIndex({ userId: 1, dayKey: 1 }, { unique: true }));

  // Consultas del dashboard: resumen semanal y rangos de días.
  await index('dailyProgress', 'userId+weekKey',
    db.collection('dailyProgress').createIndex({ userId: 1, weekKey: 1 }));

  await index('readingSessions', 'userId+dayKey',
    db.collection('readingSessions').createIndex({ userId: 1, dayKey: 1 }));

  // Recuperar la sesión abierta al recargar la página.
  await index('readingSessions', 'userId+status',
    db.collection('readingSessions').createIndex({ userId: 1, status: 1 }));

  // Línea de tiempo de /progreso, más reciente primero.
  await index('gameEvents', 'userId+createdAt desc',
    db.collection('gameEvents').createIndex({ userId: 1, createdAt: -1 }));

  console.log('Índices asegurados:');
  console.log(created.join('\n'));
  console.log('\n✓ Listo.');
}

main()
  .catch((error: unknown) => {
    console.error('\n✗ Fallo al crear los índices:');
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(closeMongoClient);
