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

  // Un perfil por usuario: la zona horaria y el onboarding son de la cuenta.
  await index('profiles', 'userId (único)',
    db.collection('profiles').createIndex({ userId: 1 }, { unique: true }));

  // Un objetivo por (usuario, slug).
  await index('goals', 'userId+goalId (único)',
    db.collection('goals').createIndex({ userId: 1, goalId: 1 }, { unique: true }));

  // La Vista de Hoy pregunta por los objetivos activos de un usuario, en orden.
  await index('goals', 'userId+archivedAt+order',
    db.collection('goals').createIndex({ userId: 1, archivedAt: 1, order: 1 }));

  // Un estado de juego por OBJETIVO: es lo que hace los refugios independientes.
  await index('gameState', 'userId+goalId (único)',
    db.collection('gameState').createIndex({ userId: 1, goalId: 1 }, { unique: true }));

  // Clave del agregado diario. Sin `goalId`, dos objetivos del mismo día
  // colisionarían y el segundo no podría registrarse.
  await index('dailyProgress', 'userId+goalId+dayKey (único)',
    db.collection('dailyProgress')
      .createIndex({ userId: 1, goalId: 1, dayKey: 1 }, { unique: true }));

  // Consultas del dashboard: resumen semanal por objetivo.
  await index('dailyProgress', 'userId+goalId+weekKey',
    db.collection('dailyProgress').createIndex({ userId: 1, goalId: 1, weekKey: 1 }));

  await index('sessions', 'userId+goalId+dayKey',
    db.collection('sessions').createIndex({ userId: 1, goalId: 1, dayKey: 1 }));

  // Solo UNA sesión abierta por usuario, aunque tenga varios objetivos: nadie
  // lee y estudia a la vez. El índice parcial lo convierte en regla de la base
  // de datos, no solo del código.
  await index('sessions', 'userId (único, solo abiertas)',
    db.collection('sessions').createIndex(
      { userId: 1 },
      { unique: true, partialFilterExpression: { status: { $in: ['running', 'paused'] } } },
    ));

  // Línea de tiempo de /progreso por objetivo, más reciente primero.
  await index('gameEvents', 'userId+goalId+createdAt desc',
    db.collection('gameEvents').createIndex({ userId: 1, goalId: 1, createdAt: -1 }));

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
