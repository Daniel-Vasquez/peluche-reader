/**
 * Datos de demostración: un usuario con 8 semanas de historia leyendo
 * "Influencia: La Psicología de la Persuasión".
 *
 *   npm run db:seed
 *
 * **No escribe `gameState` a mano.** Simula el paso del tiempo día a día
 * llamando a `syncOnVisit` y `settleSession` con un `now` falso, igual que haría
 * la app en producción. Así el seed es además un test de integración del motor:
 * si el balance está mal, aquí se nota.
 *
 * Por qué día a día y no de golpe: la reconciliación juzga cada día contra los
 * días ya marcados como completados. Si se crean todas las sesiones primero y se
 * reconcilia al final, el motor ve un pasado sin lecturas, penaliza todo y la
 * racha sale en cero. El orden importa.
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
import type { ReadingSessionDoc } from '@/lib/db/types';
import { settleSession, syncOnVisit } from '@/lib/game/service';
import { updateProfile } from '@/lib/repos/profile';
import { readEnvOr } from '@/lib/env';
import { addDays, dayKey, isoWeekdayOfDayKey, type IsoWeekday } from '@/lib/time';

const TIMEZONE = 'UTC';
const SCHEDULED: IsoWeekday[] = [1, 2, 3, 4, 5];
const BOOK = 'Influencia: La Psicología de la Persuasión';
const WEEKS = 8;

/**
 * Minutos leídos por día, empezando 8 semanas atrás.
 *
 * Mezcla deliberada: días buenos, días flojos, tres días programados fallados y
 * fines de semana en blanco, para que las gráficas tengan relieve y el mapa de
 * calor muestre los cuatro tramos de la rampa.
 */
function minutesFor(dayKeyValue: string, index: number): number {
  const weekday = isoWeekdayOfDayKey(dayKeyValue);
  const isWeekend = weekday === 6 || weekday === 7;

  // Tres fallos repartidos, para que se vean penalizaciones reales.
  if ([9, 24, 41].includes(index)) return 0;
  // Un día programado con lectura insuficiente: cuesta perrito igual.
  if (index === 33) return 6;

  if (isWeekend) return index % 3 === 0 ? 12 : 0;

  const patron = [22, 31, 14, 18, 26, 12, 35, 19, 24, 16, 21, 28, 13, 30, 17, 23, 11, 27, 20, 33];
  return patron[index % patron.length]!;
}

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

  await updateProfile(userId, {
    scheduledDays: SCHEDULED,
    timezone: TIMEZONE,
    dailyGoalMinutes: 20,
    currentBookTitle: BOOK,
  });

  const sessions = await col.sessions();
  const today = dayKey(new Date(), TIMEZONE);
  const firstDay = addDays(today, -(WEEKS * 7 - 1));

  let minutesTotal = 0;
  let sessionsTotal = 0;

  for (let i = 0; i < WEEKS * 7; i += 1) {
    const day = addDays(firstDay, i);
    // Mediodía de ese día: dentro de la jornada, lejos de cualquier frontera.
    const noon = new Date(`${day}T12:00:00.000Z`);

    // 1. Entrar a la app ese día: liquida las penalizaciones pendientes.
    await syncOnVisit(userId, noon);

    // 2. Leer, si toca.
    const minutes = minutesFor(day, i);
    if (minutes === 0) continue;

    const startedAt = new Date(noon.getTime() - minutes * 60_000);
    const doc: ReadingSessionDoc = {
      userId,
      dayKey: day,
      bookTitle: BOOK,
      status: 'completed',
      startedAt,
      lastResumedAt: null,
      accumulatedSeconds: minutes * 60,
      endedAt: noon,
      durationSeconds: minutes * 60,
      settledAt: null,
      createdAt: startedAt,
      updatedAt: noon,
    };
    const { insertedId } = await sessions.insertOne(doc);

    // 3. Liquidarla con el reloj de ese día.
    await settleSession(userId, { ...doc, _id: insertedId }, noon);

    minutesTotal += minutes;
    sessionsTotal += 1;
  }

  // Última visita con el reloj real, para dejar el estado al día.
  const snapshot = await syncOnVisit(userId);

  console.log(`\n  ${sessionsTotal} sesiones · ${minutesTotal} minutos en ${WEEKS} semanas`);
  console.log(`  Refugio: ${snapshot.shelter.dogs}/${snapshot.shelter.capacity} perritos, ` +
    `${snapshot.shelter.adopted} adoptados`);
  console.log(`  Racha: ${snapshot.shelter.streak} (récord ${snapshot.shelter.bestStreak})`);
  console.log(`\n✓ Listo. Entra con ${email} / ${password}`);
}

main()
  .catch((error: unknown) => {
    console.error('\n✗ Fallo al generar los datos de demostración:');
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(closeMongoClient);
