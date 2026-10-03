/**
 * Datos de demostración: un usuario con 8 semanas de historia en los **tres**
 * objetivos, cada uno con una historia distinta.
 *
 *   npm run db:seed
 *
 * | Objetivo | Días    | Perfil                                      |
 * |----------|---------|---------------------------------------------|
 * | Lectura  | L–V     | constante, racha larga                      |
 * | Inglés   | M, J, S | irregular, con fallos y sesiones cortas     |
 * | Estudio  | L, X, V | sesiones largas, empezado hace dos semanas  |
 *
 * **No escribe `gameState` a mano.** Simula el paso del tiempo día a día
 * llamando a `syncGoal` y `settleSession` con un `now` falso, igual que haría la
 * app en producción. Así el seed es además un test de integración del motor: si
 * el balance está mal, aquí se nota.
 *
 * Por qué día a día y no de golpe: `reconcile` juzga cada día pendiente con los
 * días comprometidos que el objetivo tiene **en ese momento**. Si se crean todas
 * las sesiones primero y se reconcilia al final, el motor ve un pasado sin
 * actividad, penaliza todo y la racha sale en cero. El orden importa.
 *
 * Y es justo lo que hace posible el perfil de Estudio: sus días se ponen en el
 * día 42 de la simulación, así que los 42 anteriores ya se reconciliaron como
 * días de descanso y no le cuestan ni un perrito. Es lo mismo que pasa cuando un
 * usuario real activa un objetivo que tenía sin configurar.
 *
 * ⚠️ **Este script NUNCA borra un usuario existente.** Si `SEED_USER_EMAIL` ya
 * está registrado, aborta y te dice qué hacer. Una versión anterior sí borraba
 * "los datos previos del usuario de demostración" para poder repetirse, y cuando
 * esa variable apuntaba por descuido a una cuenta real, se la llevó por delante.
 * Poder repetir el seed no vale una cuenta borrada: usa otro correo.
 */
import 'dotenv/config';
import { closeMongoClient, getDb } from '@/lib/db/client';
import { getAuth } from '@/lib/auth';
import { col } from '@/lib/db/collections';
import type { SessionDoc } from '@/lib/db/types';
import { settleSession, syncAllGoals, syncGoal } from '@/lib/game/service';
import { ensureDefaultGoals, updateGoal } from '@/lib/repos/goals';
import { readEnvOr } from '@/lib/env';
import { addDays, dayKey } from '@/lib/time';
import { DAYS, SEED_GOALS, WEEKS } from './seed-profiles';

const TIMEZONE = 'UTC';
/** Longitud mínima que exige Better Auth (`emailAndPassword.minPasswordLength`). */
const MIN_PASSWORD_LENGTH = 8;

async function main(): Promise<void> {
  const db = await getDb();

  const email = readEnvOr('SEED_USER_EMAIL', 'demo@reading-app.local');
  const password = readEnvOr('SEED_USER_PASSWORD', 'demo12345');

  console.log(`Base de datos: ${db.databaseName}`);
  console.log(`Usuario de demostración: ${email}\n`);

  // --- Comprobaciones ANTES de escribir nada.

  if (password.length < MIN_PASSWORD_LENGTH) {
    console.error(
      `✗ SEED_USER_PASSWORD tiene ${password.length} caracteres y hacen falta ` +
        `al menos ${MIN_PASSWORD_LENGTH}. No se ha tocado la base de datos.`,
    );
    process.exitCode = 1;
    return;
  }

  // Nunca se borra una cuenta existente: si el correo ya está registrado, para.
  const existing = await db.collection('user').findOne({ email });
  if (existing) {
    console.error(`✗ Ya existe una cuenta con ${email}. El seed no borra cuentas.`);
    console.error('  Apunta SEED_USER_EMAIL a un correo que no uses, por ejemplo');
    console.error('  demo@reading-app.local, y vuelve a ejecutarlo.');
    process.exitCode = 1;
    return;
  }

  const auth = await getAuth();
  const signUp = await auth.api.signUpEmail({
    body: { email, password, name: 'Ana Torres' },
  });
  const userId = signUp.user.id;
  console.log(`  Usuario creado: ${userId}`);

  await ensureDefaultGoals(userId);

  /*
   * Los metadatos y la meta se fijan ya; los días comprometidos NO. Esos los
   * pone el bucle en el día que le toca a cada objetivo, porque son los que
   * deciden las penalizaciones del pasado.
   */
  for (const seed of SEED_GOALS) {
    await updateGoal(
      { userId, goalId: seed.goalId },
      { dailyGoalMinutes: seed.dailyGoalMinutes, metadata: seed.metadata },
    );
  }

  const sessions = await col.sessions();
  const today = dayKey(new Date(), TIMEZONE);
  const firstDay = addDays(today, -(DAYS - 1));

  const cuenta = new Map(SEED_GOALS.map((g) => [g.goalId, { minutes: 0, sessions: 0 }]));

  for (let i = 0; i < DAYS; i += 1) {
    const day = addDays(firstDay, i);

    for (const seed of SEED_GOALS) {
      const ref = { userId, goalId: seed.goalId };
      const at = new Date(`${day}T${String(seed.hour).padStart(2, '0')}:00:00.000Z`);

      // 1. ¿Hoy es el día en que este objetivo empieza? Ponerle sus días AHORA,
      //    cuando los días anteriores ya están reconciliados como descanso.
      if (i === seed.activeFrom) {
        await updateGoal(ref, { scheduledDays: seed.scheduledDays });
      }

      // 2. Entrar a la app: liquida las penalizaciones pendientes de este objetivo.
      await syncGoal(ref, at);

      // 3. Hacer la sesión, si toca.
      const minutes = seed.minutesFor(day, i);
      if (minutes === 0) continue;

      const startedAt = new Date(at.getTime() - minutes * 60_000);
      const doc: SessionDoc = {
        ...ref,
        dayKey: day,
        contextLabel: seed.contextLabel,
        status: 'completed',
        startedAt,
        lastResumedAt: null,
        accumulatedSeconds: minutes * 60,
        endedAt: at,
        durationSeconds: minutes * 60,
        settledAt: null,
        createdAt: startedAt,
        updatedAt: at,
      };
      const { insertedId } = await sessions.insertOne(doc);

      // 4. Liquidarla con el reloj de ese día.
      await settleSession({ ...doc, _id: insertedId }, at);

      const acumulado = cuenta.get(seed.goalId)!;
      acumulado.minutes += minutes;
      acumulado.sessions += 1;
    }
  }

  // Última visita con el reloj real, para dejar el estado al día.
  const snapshots = await syncAllGoals(userId);

  console.log(`\n  ${WEEKS} semanas simuladas, día a día:\n`);
  for (const seed of SEED_GOALS) {
    const snapshot = snapshots.find((s) => s.goalId === seed.goalId);
    const acumulado = cuenta.get(seed.goalId)!;
    if (!snapshot) {
      console.log(`  ${seed.label}: sin estado (¿archivado?)`);
      continue;
    }
    const { shelter } = snapshot;
    console.log(
      `  ${seed.label.padEnd(8)} ${String(acumulado.sessions).padStart(2)} sesiones · ` +
        `${String(acumulado.minutes).padStart(4)} min · ` +
        `${shelter.dogs}/${shelter.capacity} perritos · ` +
        `racha ${shelter.streak} (récord ${shelter.bestStreak})`,
    );
  }

  console.log(`\n✓ Listo. Entra con ${email} / ${password}`);
}

main()
  .catch((error: unknown) => {
    console.error('\n✗ Fallo al generar los datos de demostración:');
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(closeMongoClient);
