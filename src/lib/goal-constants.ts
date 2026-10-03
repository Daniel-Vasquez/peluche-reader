/**
 * Identificador del objetivo de lectura.
 *
 * Ya **no** es un acoplamiento de la interfaz: las Tandas C y D la desacoplaron
 * entera, y `grep -rn READING_GOAL_ID src/` solo encuentra este archivo.
 *
 * Sigue existiendo para los scripts, donde el objetivo de lectura es un hecho
 * concreto y no una suposición: la migración atribuye a él todos los datos
 * anteriores al multi-objetivo, porque antes no había otra cosa.
 */
export const READING_GOAL_ID = 'reading';
