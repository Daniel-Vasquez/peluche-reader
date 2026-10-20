import type { GoalType } from '@/lib/db/types';
import { rewardCurveFor, type RewardCurve } from './rewards';
import { vocabularyFor, type GoalVocabulary } from './vocabulary';

/**
 * Todo lo que el tipo de un objetivo decide: cómo se llama lo que hace el
 * usuario y cuánto vale.
 *
 * Van juntos porque se piden juntos. El motor ya recibía el vocabulario en cada
 * llamada; añadir la curva al mismo objeto evita una segunda ristra de
 * parámetros por todas las firmas, y deja un solo sitio al que mirar cuando se
 * añada un cuarto tipo de objetivo.
 */
export interface GoalPolicy {
  type: GoalType;
  vocab: GoalVocabulary;
  rewards: RewardCurve;
}

const POLITICAS: Record<GoalType, GoalPolicy> = {
  reading: { type: 'reading', vocab: vocabularyFor('reading'), rewards: rewardCurveFor('reading') },
  english: { type: 'english', vocab: vocabularyFor('english'), rewards: rewardCurveFor('english') },
  study: { type: 'study', vocab: vocabularyFor('study'), rewards: rewardCurveFor('study') },
};

export function policyFor(type: GoalType): GoalPolicy {
  return POLITICAS[type];
}
