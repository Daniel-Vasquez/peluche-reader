import type { GoalType } from '@/lib/db/types';
import { GAME } from './config';

/**
 * Curvas de recompensa. Funciones puras, sin reloj ni base de datos.
 *
 * **Cada tipo de objetivo tiene la suya**, porque no piden el mismo esfuerzo:
 *
 * | Tipo    | Umbral | Bloque | Forma     | Minutos → perritos          |
 * |---------|-------:|-------:|-----------|-----------------------------|
 * | Lectura |  10    |   5    | ascendente| 10→1, 15→2, 20→4, 25→7, 30→11 (tope) |
 * | Inglés  |  30    |  15    | lineal    | 30→1, 45→2, 60→3, 75→4, …   |
 * | Estudio |  30    |  15    | lineal    | igual que Inglés            |
 *
 * El umbral es **también el mínimo de supervivencia**: un día programado que
 * cierra sin perritos ganados es un día fallado (ver `completedDayKeysBetween`),
 * así que con 29 minutos de inglés se pierde un perrito y con 30 no.
 *
 * Por qué lectura es convexa y las otras lineales: diez minutos de lectura son
 * un hábito que hay que arrancar, y la curva ascendente paga el "un bloque más".
 * Media hora de inglés o de estudio ya es una sesión seria; ahí la dificultad
 * está en llegar al umbral, no en estirarlo.
 */

export interface RewardCurve {
  /** Umbral de recompensa y mínimo de supervivencia, en minutos. */
  baseMinutes: number;
  /** Perritos totales por los minutos acumulados **del día**. */
  dogsForMinutes(minutes: number): number;
  /** Escalones para pintar en la interfaz. */
  steps: readonly { minutes: number; dogs: number }[];
  /** Siguiente escalón, o `null` si ya no crece. */
  nextStep(minutes: number): { atMinutes: number; dogs: number; minutesAway: number } | null;
}

/** Cuántos escalones enseña la interfaz cuando la curva no tiene tope. */
const ESCALONES_SIN_TOPE = 4;

function construir(cfg: (typeof GAME.REWARDS)[GoalType]): RewardCurve {
  const { shape, baseMinutes, blockMinutes, maxBlocks } = cfg;

  const dogsForMinutes = (minutes: number): number => {
    if (!Number.isFinite(minutes) || minutes < baseMinutes) return 0;
    const brutos = Math.floor((minutes - baseMinutes) / blockMinutes);
    const blocks = maxBlocks === null ? brutos : Math.min(brutos, maxBlocks);
    // Ascendente: 1 + 1 + 2 + 3 + … = 1 + n(n+1)/2.  Lineal: 1 + n.
    return shape === 'ascending' ? 1 + (blocks * (blocks + 1)) / 2 : 1 + blocks;
  };

  const cuantos = maxBlocks === null ? ESCALONES_SIN_TOPE : maxBlocks;
  const steps = Array.from({ length: cuantos + 1 }, (_, i) => {
    const minutes = baseMinutes + i * blockMinutes;
    return { minutes, dogs: dogsForMinutes(minutes) };
  });

  const nextStep = (minutes: number) => {
    if (minutes < baseMinutes) {
      return { atMinutes: baseMinutes, dogs: dogsForMinutes(baseMinutes), minutesAway: baseMinutes - minutes };
    }
    // Sin tope la curva sigue creciendo, así que el siguiente escalón se calcula
    // en vez de buscarse en la lista, que es finita solo para la interfaz.
    const bloquesHechos = Math.floor((minutes - baseMinutes) / blockMinutes);
    if (maxBlocks !== null && bloquesHechos >= maxBlocks) return null;
    const atMinutes = baseMinutes + (bloquesHechos + 1) * blockMinutes;
    return { atMinutes, dogs: dogsForMinutes(atMinutes), minutesAway: atMinutes - minutes };
  };

  return { baseMinutes, dogsForMinutes, steps, nextStep };
}

const CURVAS: Record<GoalType, RewardCurve> = {
  reading: construir(GAME.REWARDS.reading),
  english: construir(GAME.REWARDS.english),
  study: construir(GAME.REWARDS.study),
};

export function rewardCurveFor(type: GoalType): RewardCurve {
  return CURVAS[type];
}
