import { describe, expect, it } from 'vitest';
import { GAME } from '@/lib/game/config';
import {
  dogsForMinutes,
  MAX_REWARD_MINUTES,
  nextRewardStep,
  REWARD_STEPS,
} from '@/lib/game/rewards';

describe('dogsForMinutes', () => {
  it('no da nada por debajo del umbral', () => {
    expect(dogsForMinutes(0)).toBe(0);
    expect(dogsForMinutes(1)).toBe(0);
    expect(dogsForMinutes(9)).toBe(0);
  });

  it('cumple la tabla del contrato con la UI', () => {
    expect(dogsForMinutes(10)).toBe(1);
    expect(dogsForMinutes(15)).toBe(2);
    expect(dogsForMinutes(20)).toBe(4);
    expect(dogsForMinutes(25)).toBe(7);
    expect(dogsForMinutes(30)).toBe(11);
  });

  it('no sube hasta completar el bloque entero', () => {
    expect(dogsForMinutes(14)).toBe(1);
    expect(dogsForMinutes(19)).toBe(2);
    expect(dogsForMinutes(24)).toBe(4);
    expect(dogsForMinutes(29)).toBe(7);
  });

  it('topa a los 30 minutos: leer más no da más perritos', () => {
    expect(dogsForMinutes(30)).toBe(11);
    expect(dogsForMinutes(45)).toBe(11);
    expect(dogsForMinutes(90)).toBe(11);
    expect(dogsForMinutes(600)).toBe(11);
    expect(MAX_REWARD_MINUTES).toBe(30);
  });

  it('es monótona: leer más nunca da menos', () => {
    for (let m = 0; m <= 240; m += 1) {
      expect(dogsForMinutes(m)).toBeLessThanOrEqual(dogsForMinutes(m + 1));
    }
  });

  it('la curva es ASCENDENTE: cada bloque vale más que el anterior', () => {
    const gains = [10, 15, 20, 25, 30].map(
      (m, i, all) => dogsForMinutes(m) - (i === 0 ? 0 : dogsForMinutes(all[i - 1]!)),
    );
    expect(gains).toEqual([1, 1, 2, 3, 4]);
    // Estrictamente creciente a partir del segundo bloque.
    for (let i = 2; i < gains.length; i += 1) {
      expect(gains[i]!).toBeGreaterThan(gains[i - 1]!);
    }
  });

  it('aguanta entradas basura sin romperse', () => {
    expect(dogsForMinutes(-5)).toBe(0);
    expect(dogsForMinutes(Number.NaN)).toBe(0);
    expect(dogsForMinutes(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it('devuelve siempre enteros', () => {
    for (let m = 0; m <= 120; m += 1) {
      expect(Number.isInteger(dogsForMinutes(m))).toBe(true);
    }
  });
});

describe('REWARD_STEPS', () => {
  it('se deriva de la curva, no está escrita a mano', () => {
    expect(REWARD_STEPS).toEqual([
      { minutes: 10, dogs: 1 },
      { minutes: 15, dogs: 2 },
      { minutes: 20, dogs: 4 },
      { minutes: 25, dogs: 7 },
      { minutes: 30, dogs: 11 },
    ]);
  });

  it('tiene un escalón por bloque, más el base', () => {
    expect(REWARD_STEPS).toHaveLength(GAME.MAX_BLOCKS + 1);
  });
});

describe('nextRewardStep', () => {
  it('apunta al siguiente escalón y dice cuánto falta', () => {
    expect(nextRewardStep(0)).toEqual({ atMinutes: 10, dogs: 1, minutesAway: 10 });
    expect(nextRewardStep(12)).toEqual({ atMinutes: 15, dogs: 2, minutesAway: 3 });
    expect(nextRewardStep(24)).toEqual({ atMinutes: 25, dogs: 7, minutesAway: 1 });
  });

  it('devuelve null en el tope', () => {
    expect(nextRewardStep(30)).toBeNull();
    expect(nextRewardStep(120)).toBeNull();
  });
});
