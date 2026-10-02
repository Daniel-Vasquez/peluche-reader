/**
 * Migra el esquema de un solo hábito a multi-objetivo.
 *
 *   ALLOW_DB_MIGRATE=yes npm run db:migrate
 *
 * Es **idempotente**: se puede ejecutar dos veces con el mismo resultado. Lo que
 * ya está migrado no se vuelve a tocar, gracias a `$exists: false`.
 *
 * ⚠️ Antes de ejecutarlo: `npm run db:dump`. Este script borra índices, y un
 * `dropIndex` no se deshace solo.
 *
 * ⚠️ Después de ejecutarlo: `npm run db:init`. En ese orden y no al revés —
 * crear el índice único `(userId, goalId, dayKey)` sobre documentos que todavía
 * no tienen `goalId` falla, porque todos valdrían `null` y colisionarían.
 *
 * ⚠️ **Para el servidor antes de migrar** (`astro dev stop`). Cualquier visita a
 * `/app` dispara `ensureDefaultGoals`, que crea los objetivos con los valores por
 * defecto. Si eso pasa antes de la migración, un `$setOnInsert` no haría nada y
 * el objetivo de lectura se quedaría sin la configuración del usuario. Ocurrió en
 * la ejecución real; por eso ahora el script usa `$set` para los campos que el
 * perfil todavía tiene, no `$setOnInsert`.
 */
import 'dotenv/config';
import { closeMongoClient, getDb } from '@/lib/db/client';
import { DEFAULT_GOALS } from '@/lib/repos/goals';
import { READING_GOAL_ID } from '@/lib/goal-constants';

/** Colecciones de datos que ganan `goalId`, todas atribuidas a Lectura. */
const CON_GOAL_ID = ['dailyProgress', 'gameState', 'gameEvents', 'sessions'] as const;

/** Índices de la era de un solo hábito. Sobran y además estorban. */
const INDICES_VIEJOS = [
  ['dailyProgress', 'userId_1_dayKey_1'],
  ['dailyProgress', 'userId_1_weekKey_1'],
  ['gameState', 'userId_1'],
  ['gameEvents', 'userId_1_createdAt_-1'],
  ['sessions', 'userId_1_dayKey_1'],
  ['sessions', 'userId_1_status_1'],
] as const;

async function main(): Promise<void> {
  if (process.env.ALLOW_DB_MIGRATE !== 'yes') {
    console.error('✗ Migración bloqueada: borra índices y reescribe documentos.');
    console.error('  Haz antes `npm run db:dump`, y luego:');
    console.error('  ALLOW_DB_MIGRATE=yes npm run db:migrate');
    process.exitCode = 1;
    return;
  }

  const db = await getDb();
  console.log(`Base de datos: ${db.databaseName}\n`);

  // 1. Renombrar la colección: `readingSessions` mentía en cuanto hay un
  //    objetivo que no es lectura.
  const existentes = (await db.listCollections({}, { nameOnly: true }).toArray())
    .map((c) => c.name);
  if (existentes.includes('readingSessions') && !existentes.includes('sessions')) {
    await db.renameCollection('readingSessions', 'sessions');
    console.log('  ✓ readingSessions → sessions');
  } else {
    console.log('  −  renombrado: ya estaba hecho');
  }

  // 2. Un juego de objetivos por usuario.
  const profiles = await db.collection('profiles').find({}).toArray();
  console.log(`\n  ${profiles.length} perfil(es) que migrar:`);

  for (const profile of profiles) {
    const userId = profile.userId as string;
    const now = new Date();

    for (const [order, plantilla] of DEFAULT_GOALS.entries()) {
      const esLectura = plantilla.goalId === READING_GOAL_ID;

      // Lo que el perfil TODAVÍA tiene manda, exista ya el objetivo o no. Con
      // `$setOnInsert` bastaría que algo hubiera creado el objetivo antes —una
      // visita a /app dispara `ensureDefaultGoals`— para perder la
      // configuración del usuario en silencio.
      const delPerfil =
        esLectura && profile.scheduledDays !== undefined
          ? {
              scheduledDays: profile.scheduledDays,
              dailyGoalMinutes: profile.dailyGoalMinutes ?? plantilla.dailyGoalMinutes,
              metadata: {
                type: 'reading' as const,
                bookTitle: (profile.currentBookTitle as string | null) ?? null,
                author: null,
              },
              updatedAt: now,
            }
          : {};

      await db.collection('goals').updateOne(
        { userId, goalId: plantilla.goalId },
        {
          $setOnInsert: {
            userId,
            ...plantilla,
            order,
            archivedAt: null,
            createdAt: profile.createdAt ?? now,
            updatedAt: now,
          },
          ...(Object.keys(delPerfil).length > 0 ? { $set: delPerfil } : {}),
        },
        { upsert: true },
      );
    }
    console.log(`    ${userId}: ${DEFAULT_GOALS.length} objetivo(s) asegurados`);
  }

  // 3. Estampar goalId en los datos que ya existen. Todo lo anterior a la
  //    migración es, por definición, de lectura.
  console.log('\n  Estampando goalId en los datos existentes:');
  for (const nombre of CON_GOAL_ID) {
    const { modifiedCount } = await db.collection(nombre).updateMany(
      { goalId: { $exists: false } },
      { $set: { goalId: READING_GOAL_ID } },
    );
    console.log(`    ${nombre.padEnd(16)} ${modifiedCount} documento(s)`);
  }

  // 4. `bookTitle` → `contextLabel` en las sesiones ya guardadas.
  const { modifiedCount: renombrados } = await db.collection('sessions').updateMany(
    { bookTitle: { $exists: true } },
    [{ $set: { contextLabel: '$bookTitle' } }, { $unset: 'bookTitle' }],
  );
  console.log(`    sessions         ${renombrados} bookTitle → contextLabel`);

  // 5. El perfil suelta lo que ahora es de cada objetivo.
  const { modifiedCount: limpiados } = await db.collection('profiles').updateMany(
    {},
    { $unset: { scheduledDays: '', dailyGoalMinutes: '', currentBookTitle: '' } },
  );
  console.log(`\n  ${limpiados} perfil(es) limpiados`);

  // 6. Fuera los índices de la era de un solo hábito.
  console.log('\n  Índices viejos:');
  for (const [coleccion, indice] of INDICES_VIEJOS) {
    const borrado = await db
      .collection(coleccion)
      .dropIndex(indice)
      .then(() => true)
      .catch(() => false);
    console.log(`    ${borrado ? '✓' : '−'} ${coleccion}.${indice}${borrado ? '' : ' (no existía)'}`);
  }

  console.log('\n✓ Migración completa. Ahora: npm run db:init');
}

main()
  .catch((error: unknown) => {
    console.error('\n✗ Fallo al migrar:');
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(closeMongoClient);
