/**
 * Cifras del juego para textos de la interfaz **antes** de que exista el motor.
 *
 * Provisional: en la Tanda 6 estas constantes se sustituyen por las de
 * `src/lib/game/config.ts`, que son la fuente de verdad del balance. Existe solo
 * para que la Tanda 3 no incruste números sueltos en el marcado.
 */
export const GAME_PREVIEW = {
  startDogs: 7,
  baseMinutes: 10,
  penaltyPerMiss: 1,
} as const;
