/**
 * Acoplamiento TEMPORAL al objetivo de lectura.
 *
 * La Tanda A cambia el esquema a multi-objetivo pero deja la interfaz igual que
 * antes: un solo hábito. Estas constantes marcan los sitios donde la UI todavía
 * asume que solo hay lectura.
 *
 * **Las Tandas C y D las eliminan**: la Vista de Hoy recorre todos los objetivos
 * y `/ajustes` los edita por acordeones. Mientras existan, `grep -rn
 * READING_GOAL_ID src/` da la lista exacta de lo que falta por desacoplar.
 */
export const READING_GOAL_ID = 'reading';
