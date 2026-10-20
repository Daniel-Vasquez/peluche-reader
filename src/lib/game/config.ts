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

  /**
   * Curva de recompensa **por tipo de objetivo**.
   *
   * `baseMinutes` es a la vez el umbral de recompensa y el **mínimo de
   * supervivencia**: por debajo no se gana ni un perrito, y un día programado
   * sin ganar perritos es un día fallado. Las dos cosas son el mismo número a
   * propósito, para que no puedan contradecirse.
   *
   * - `ascending`: cada bloque vale un perrito más que el anterior (1, 2, 4, 7, 11).
   *   Es la curva de lectura: convexa, premia alargar la sesión.
   * - `linear`: un perrito por bloque (1, 2, 3, 4…). Inglés y Estudio piden
   *   sesiones largas, así que el salto está en el umbral y no en la pendiente.
   *
   * `maxBlocks: null` = sin tope.
   */
  REWARDS: {
    reading: { shape: 'ascending', baseMinutes: 10, blockMinutes: 5, maxBlocks: 4 },
    english: { shape: 'linear', baseMinutes: 30, blockMinutes: 15, maxBlocks: null },
    study: { shape: 'linear', baseMinutes: 30, blockMinutes: 15, maxBlocks: null },
  },

  /** Perritos perdidos por cada día programado sin leer. */
  PENALTY_PER_MISS: 1,
  /** Tope de pérdida semanal, como fracción de los perritos al abrir la semana. */
  WEEKLY_LOSS_RATIO: 0.6,
} as const;
