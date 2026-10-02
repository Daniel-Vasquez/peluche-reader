import type { GoalType } from '@/lib/db/types';

/**
 * Las palabras que el motor necesita para redactar un evento.
 *
 * El motor es agnóstico: no sabe si el objetivo es leer, practicar inglés o
 * estudiar, y no debería. Pero los eventos que guarda sí llevan texto, porque la
 * línea de tiempo de `/progreso` los muestra tal cual.
 *
 * Se inyecta en lugar de devolver claves que la interfaz traduzca, por una razón
 * concreta: los `gameEvents` ya guardados almacenan `reason` como texto. Pasar a
 * claves obligaría a migrarlos; inyectar el vocabulario deja el historial
 * existente legible sin tocarlo.
 */
export interface GoalVocabulary {
  /** Complemento de la actividad: "de lectura", "de inglés", "de estudio". */
  activity: string;
  /** Razón del día fallado: "Día programado sin leer". */
  missed: string;
}

const POR_TIPO: Record<GoalType, GoalVocabulary> = {
  reading: { activity: 'de lectura', missed: 'Día programado sin leer' },
  english: { activity: 'de inglés', missed: 'Día programado sin practicar inglés' },
  study: { activity: 'de estudio', missed: 'Día programado sin estudiar' },
};

export function vocabularyFor(type: GoalType): GoalVocabulary {
  return POR_TIPO[type];
}
