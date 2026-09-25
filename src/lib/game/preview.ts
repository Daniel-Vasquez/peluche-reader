/**
 * Cifras del juego para textos de la interfaz **antes** de que exista el motor.
 *
 * Provisional: en la Tanda 6 estas constantes se sustituyen por las de
 * `src/lib/game/config.ts`, que son la fuente de verdad del balance. Busca
 * `GAME_PREVIEW` y cambia cada uso por la constante de `GAME`.
 */
export const GAME_PREVIEW = {
  startDogs: 7,
  baseMinutes: 10,
  penaltyPerMiss: 1,
} as const;

/**
 * Escalones de recompensa en minutos, con los perritos que otorga cada uno.
 * La curva es ascendente: cada bloque de 5 min vale un perrito más que el
 * anterior. La fórmula real llega en `game/rewards.ts` (Tanda 6).
 */
export const REWARD_STEPS = [
  { minutes: 10, dogs: 1 },
  { minutes: 15, dogs: 2 },
  { minutes: 20, dogs: 4 },
  { minutes: 25, dogs: 7 },
  { minutes: 30, dogs: 11 },
] as const;
