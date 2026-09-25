import { GAME } from './config';

/**
 * Curva de recompensa. Funciones puras, sin reloj ni base de datos.
 *
 * Regla: los primeros 10 minutos valen 1 perrito. Cada bloque extra de 5 minutos
 * vale **un perrito más que el bloque anterior**.
 *
 * | Minutos | Bloques | Perritos | Gana el bloque |
 * |--------:|--------:|---------:|---------------:|
 * |   0–9   |    —    |     0    |       —        |
 * |    10   |    0    |     1    |      +1        |
 * |    15   |    1    |     2    |      +1        |
 * |    20   |    2    |     4    |      +2        |
 * |    25   |    3    |     7    |      +3        |
 * |   30+   | 4 (tope)|    11    |      +4        |
 */

/**
 * Perritos totales que corresponden a `minutes` leídos en un mismo día.
 *
 * Se calcula sobre el **total del día**, no por sesión: así tres sesiones de
 * 7 minutos no valen 0.
 */
export function dogsForMinutes(minutes: number): number {
  if (!Number.isFinite(minutes) || minutes < GAME.BASE_MINUTES) return 0;
  const blocks = Math.min(
    Math.floor((minutes - GAME.BASE_MINUTES) / GAME.BLOCK_MINUTES),
    GAME.MAX_BLOCKS,
  );
  return 1 + (blocks * (blocks + 1)) / 2;
}

/** Minutos del último escalón que puntúa. Más allá, la recompensa no crece. */
export const MAX_REWARD_MINUTES =
  GAME.BASE_MINUTES + GAME.MAX_BLOCKS * GAME.BLOCK_MINUTES;

/** Los escalones de la curva, para pintarlos en la interfaz. */
export const REWARD_STEPS: readonly { minutes: number; dogs: number }[] =
  Array.from({ length: GAME.MAX_BLOCKS + 1 }, (_, i) => {
    const minutes = GAME.BASE_MINUTES + i * GAME.BLOCK_MINUTES;
    return { minutes, dogs: dogsForMinutes(minutes) };
  });

/**
 * Siguiente escalón por alcanzar, o `null` si ya está en el tope.
 * Alimenta el "te faltan 3 min para 2 perritos más" de la UI.
 */
export function nextRewardStep(
  minutes: number,
): { atMinutes: number; dogs: number; minutesAway: number } | null {
  const step = REWARD_STEPS.find((s) => minutes < s.minutes);
  if (!step) return null;
  return { atMinutes: step.minutes, dogs: step.dogs, minutesAway: step.minutes - minutes };
}
