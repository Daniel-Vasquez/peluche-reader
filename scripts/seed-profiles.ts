/**
 * Los perfiles de datos del seed, en su propio módulo.
 *
 * Están separados de `db-seed.ts` para que `__tests__/seed-profiles.test.ts`
 * pueda comprobarlos sin tocar la base de datos: el seed necesita Mongo, pero
 * decidir si los tres perfiles son de verdad distintos es aritmética sobre estas
 * funciones y el umbral de `GAME`.
 */
import type { GoalMetadata } from '@/lib/db/types';
import { isoWeekdayOfDayKey, type IsoWeekday } from '@/lib/time';

export const WEEKS = 8;
export const DAYS = WEEKS * 7;

/** El día de la simulación en que el usuario activa Estudio. */
export const STUDY_STARTS_ON = 42;

export interface SeedGoal {
  goalId: string;
  label: string;
  scheduledDays: IsoWeekday[];
  dailyGoalMinutes: number;
  metadata: GoalMetadata;
  contextLabel: string;
  /**
   * Hora local de su sesión. Cada objetivo tiene la suya para que las tres
   * sesiones de un mismo día no caigan en el mismo instante.
   */
  hour: number;
  /** Día de la simulación en que recibe sus días comprometidos. */
  activeFrom: number;
  /** Minutos de ese día. `0` significa que no hubo sesión. */
  minutesFor: (day: string, index: number) => number;
}

/**
 * Los tres perfiles.
 *
 * El umbral que decide si un día cuenta es `GAME.BASE_MINUTES` (10): por debajo,
 * un día programado cierra como `missed` y cuesta un perrito. Las cifras de aquí
 * están elegidas contra ese umbral, no al azar.
 */
export const SEED_GOALS: SeedGoal[] = [
  {
    goalId: 'reading',
    label: 'Lectura',
    scheduledDays: [1, 2, 3, 4, 5],
    dailyGoalMinutes: 20,
    metadata: {
      type: 'reading',
      bookTitle: 'Influencia: La Psicología de la Persuasión',
      author: 'Robert B. Cialdini',
    },
    contextLabel: 'Influencia: La Psicología de la Persuasión',
    hour: 12,
    activeFrom: 0,
    // Ni un día programado por debajo del umbral: es el objetivo que sostiene la
    // racha larga y el que llena el refugio.
    minutesFor: (day, i) => {
      const weekday = isoWeekdayOfDayKey(day);
      if (weekday === 6 || weekday === 7) return i % 11 === 0 ? 15 : 0;
      return [22, 28, 20, 31, 24, 26, 21, 34, 23, 29][i % 10]!;
    },
  },
  {
    goalId: 'english',
    label: 'Inglés',
    scheduledDays: [2, 4, 6],
    dailyGoalMinutes: 20,
    metadata: { type: 'english', courseName: 'Duolingo', level: 'B1' },
    contextLabel: 'Duolingo · B1',
    hour: 18,
    activeFrom: 0,
    /*
     * El objetivo irregular: cuatro días en blanco y dos sesiones que se quedan
     * por debajo del umbral. El motor penaliza las seis, así que aquí se ven de
     * verdad las pérdidas y el tope semanal.
     *
     * Los fallos se numeran por **día programado**, no por índice del bucle. El
     * seed empieza 55 días antes de hoy, así que el día de la semana en que
     * arranca cambia en cada ejecución; con índices crudos, un fallo caía en
     * martes un día y en domingo —donde Inglés no tiene nada— al siguiente, y el
     * perfil salía más o menos accidentado según el día en que se sembrara.
     *
     * Cualquier bloque de 7 días consecutivos contiene exactamente un martes, un
     * jueves y un sábado, así que esta cuenta recorre los días programados sin
     * huecos ni repeticiones.
     */
    minutesFor: (day, i) => {
      const weekday = isoWeekdayOfDayKey(day);
      const slot = [2, 4, 6].indexOf(weekday);
      if (slot === -1) return 0;

      const ordinal = Math.floor(i / 7) * 3 + slot;
      if ([2, 9, 14, 20].includes(ordinal)) return 0;
      if ([5, 17].includes(ordinal)) return 7;
      return [24, 20, 30, 22, 26][ordinal % 5]!;
    },
  },
  {
    goalId: 'study',
    label: 'Estudio',
    scheduledDays: [1, 3, 5],
    dailyGoalMinutes: 25,
    metadata: { type: 'study', subject: 'Cálculo II', topic: 'Integrales por partes' },
    contextLabel: 'Cálculo II · Integrales por partes',
    hour: 20,
    activeFrom: STUDY_STARTS_ON,
    // Sesiones largas y recién empezadas. Pasados los 30 minutos la recompensa
    // ya está en su tope, así que esto no desequilibra el refugio: solo da
    // relieve a la gráfica de minutos.
    minutesFor: (day, i) => {
      if (i < STUDY_STARTS_ON) return 0;
      const weekday = isoWeekdayOfDayKey(day);
      if (weekday !== 1 && weekday !== 3 && weekday !== 5) return 0;
      return [52, 68, 45, 60, 55, 72][i % 6]!;
    },
  },
];
