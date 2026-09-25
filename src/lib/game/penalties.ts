import { GAME } from './config';

/**
 * Penalizaciones. Funciones puras.
 *
 * Hay **dos frenos**, no uno, y los dos son deliberados:
 *
 * 1. **Tope semanal**: como máximo se pierde el `WEEKLY_LOSS_RATIO` de los
 *    perritos que había al abrir la semana. Empezando con 7:
 *    `ceil(7 × 0.6) = 5`, así que fallar los siete días deja el refugio en 2,
 *    no en 0.
 * 2. **Piso absoluto** `FLOOR_DOGS = 1`: Peluche nunca muere. Es el ancla
 *    emocional y el punto desde el que siempre se puede remontar (10 min → +1).
 */

/** Máximo de perritos que se pueden perder en la semana en curso. */
export function weeklyLossCap(dogsAtWeekStart: number): number {
  return Math.max(1, Math.ceil(dogsAtWeekStart * GAME.WEEKLY_LOSS_RATIO));
}

/**
 * Penalización efectiva de un día fallado, ya recortada por los dos topes.
 * Devuelve `0` cuando no se puede perder nada más.
 */
export function effectivePenalty(
  dogs: number,
  dogsAtWeekStart: number,
  weekLosses: number,
): number {
  const remainingWeekly = Math.max(0, weeklyLossCap(dogsAtWeekStart) - weekLosses);
  const remainingFloor = Math.max(0, dogs - GAME.FLOOR_DOGS);
  return Math.min(GAME.PENALTY_PER_MISS, remainingWeekly, remainingFloor);
}
