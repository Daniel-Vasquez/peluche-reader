/**
 * Constantes de balance de "Salvando a Peluche".
 *
 * **Este archivo es la única fuente de verdad del balance.** Si una cifra del
 * juego aparece en otro sitio, es un error: impórtala de aquí. Ajustar la
 * dificultad debe ser editar solo este archivo.
 *
 * Por qué funciona la mezcla: la penalización es lineal y acotada, la recompensa
 * es convexa. Recuperarse siempre es más rápido que caer — una sola sesión de
 * 20 min repone cuatro días fallados. El castigo crea urgencia; la curva
 * ascendente crea el "un bloque más" que alarga la sesión.
 */
export const GAME = {
  /** Perritos con los que abre el refugio una cuenta nueva. */
  START_DOGS: 7,
  /** Aforo base del refugio. */
  BASE_CAPACITY: 7,
  /** El refugio jamás baja de aquí: siempre queda Peluche. */
  FLOOR_DOGS: 1,
  /** Cada N adopciones el refugio gana +1 de aforo. */
  ADOPTIONS_PER_CAPACITY: 10,
  MAX_CAPACITY: 21,

  /** Umbral mínimo para ganar el primer perrito. */
  BASE_MINUTES: 10,
  /** Tamaño de cada bloque adicional. */
  BLOCK_MINUTES: 5,
  /** Bloques adicionales que puntúan (4 → tope de recompensa a los 30 min). */
  MAX_BLOCKS: 4,

  /** Perritos perdidos por cada día programado sin leer. */
  PENALTY_PER_MISS: 1,
  /** Tope de pérdida semanal, como fracción de los perritos al abrir la semana. */
  WEEKLY_LOSS_RATIO: 0.6,
} as const;
