import { describe, expect, it } from 'vitest';
import type { GoalType } from '@/lib/db/types';
import { GAME } from '@/lib/game/config';
import { rewardCurveFor } from '@/lib/game/rewards';

const lectura = rewardCurveFor('reading');
const ingles = rewardCurveFor('english');
const estudio = rewardCurveFor('study');

const TIPOS: GoalType[] = ['reading', 'english', 'study'];

describe('curva de Lectura (no debe cambiar)', () => {
  it('no paga por debajo del umbral', () => {
    expect(lectura.dogsForMinutes(0)).toBe(0);
    expect(lectura.dogsForMinutes(1)).toBe(0);
    expect(lectura.dogsForMinutes(9)).toBe(0);
  });

  it('sube de forma ascendente en cada escalón', () => {
    expect(lectura.dogsForMinutes(10)).toBe(1);
    expect(lectura.dogsForMinutes(15)).toBe(2);
    expect(lectura.dogsForMinutes(20)).toBe(4);
    expect(lectura.dogsForMinutes(25)).toBe(7);
    expect(lectura.dogsForMinutes(30)).toBe(11);
  });

  it('no paga los minutos sueltos de un bloque incompleto', () => {
    expect(lectura.dogsForMinutes(14)).toBe(1);
    expect(lectura.dogsForMinutes(19)).toBe(2);
    expect(lectura.dogsForMinutes(24)).toBe(4);
    expect(lectura.dogsForMinutes(29)).toBe(7);
  });

  it('topa a los 30 minutos', () => {
    expect(lectura.dogsForMinutes(45)).toBe(11);
    expect(lectura.dogsForMinutes(600)).toBe(11);
    expect(lectura.nextStep(30)).toBeNull();
    expect(lectura.nextStep(120)).toBeNull();
  });

  it('mantiene sus escalones y su umbral', () => {
    expect(lectura.baseMinutes).toBe(10);
    expect(lectura.steps).toEqual([
      { minutes: 10, dogs: 1 },
      { minutes: 15, dogs: 2 },
      { minutes: 20, dogs: 4 },
      { minutes: 25, dogs: 7 },
      { minutes: 30, dogs: 11 },
    ]);
  });

  it('anuncia el siguiente escalón', () => {
    expect(lectura.nextStep(0)).toEqual({ atMinutes: 10, dogs: 1, minutesAway: 10 });
    expect(lectura.nextStep(12)).toEqual({ atMinutes: 15, dogs: 2, minutesAway: 3 });
    expect(lectura.nextStep(24)).toEqual({ atMinutes: 25, dogs: 7, minutesAway: 1 });
  });
});

describe.each([
  ['Inglés', ingles],
  ['Estudio', estudio],
] as const)('curva de %s', (_nombre, curva) => {
  it('exige 30 minutos para salvar el día', () => {
    expect(curva.baseMinutes).toBe(30);
    expect(curva.dogsForMinutes(29)).toBe(0);
    expect(curva.dogsForMinutes(30)).toBe(1);
  });

  it('da un perrito más por cada bloque completo de 15 minutos', () => {
    expect(curva.dogsForMinutes(30)).toBe(1);
    expect(curva.dogsForMinutes(45)).toBe(2);
    expect(curva.dogsForMinutes(60)).toBe(3);
    expect(curva.dogsForMinutes(75)).toBe(4);
    expect(curva.dogsForMinutes(90)).toBe(5);
  });

  it('coincide con la fórmula del encargo para los extras', () => {
    // El encargo contaba "extras sobre la base": 30→0, 45→1, 60→2, 75→3.
    for (const m of [30, 45, 60, 75, 90, 120]) {
      const extras = m >= 45 ? Math.floor((m - 30) / 15) : 0;
      expect(curva.dogsForMinutes(m) - 1).toBe(extras);
    }
  });

  it('no paga los minutos sueltos de un bloque incompleto', () => {
    expect(curva.dogsForMinutes(44)).toBe(1);
    expect(curva.dogsForMinutes(59)).toBe(2);
    expect(curva.dogsForMinutes(74)).toBe(3);
  });

  it('no tiene tope: sigue creciendo', () => {
    expect(curva.dogsForMinutes(180)).toBe(11);
    expect(curva.nextStep(180)).toEqual({ atMinutes: 195, dogs: 12, minutesAway: 15 });
  });

  it('empieza sus escalones en el umbral', () => {
    expect(curva.steps[0]).toEqual({ minutes: 30, dogs: 1 });
    expect(curva.steps.map((s) => s.minutes)).toEqual([30, 45, 60, 75, 90]);
  });

  it('apunta al umbral mientras no se alcance', () => {
    expect(curva.nextStep(0)).toEqual({ atMinutes: 30, dogs: 1, minutesAway: 30 });
    expect(curva.nextStep(29)).toEqual({ atMinutes: 30, dogs: 1, minutesAway: 1 });
  });
});

describe('invariantes de todas las curvas', () => {
  it.each(TIPOS)('%s: nunca decrece', (tipo) => {
    const curva = rewardCurveFor(tipo);
    for (let m = 0; m <= 200; m++) {
      expect(curva.dogsForMinutes(m)).toBeLessThanOrEqual(curva.dogsForMinutes(m + 1));
    }
  });

  it.each(TIPOS)('%s: siempre entero y nunca negativo', (tipo) => {
    const curva = rewardCurveFor(tipo);
    for (let m = 0; m <= 200; m++) {
      const d = curva.dogsForMinutes(m);
      expect(Number.isInteger(d)).toBe(true);
      expect(d).toBeGreaterThanOrEqual(0);
    }
  });

  it.each(TIPOS)('%s: aguanta entradas basura', (tipo) => {
    const curva = rewardCurveFor(tipo);
    expect(curva.dogsForMinutes(-5)).toBe(0);
    expect(curva.dogsForMinutes(Number.NaN)).toBe(0);
    expect(curva.dogsForMinutes(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it.each(TIPOS)('%s: el umbral paga exactamente un perrito', (tipo) => {
    const curva = rewardCurveFor(tipo);
    expect(curva.dogsForMinutes(curva.baseMinutes)).toBe(1);
    expect(curva.dogsForMinutes(curva.baseMinutes - 1)).toBe(0);
  });

  it.each(TIPOS)('%s: el primer escalón es el umbral de su config', (tipo) => {
    expect(rewardCurveFor(tipo).baseMinutes).toBe(GAME.REWARDS[tipo].baseMinutes);
  });

  it('Inglés y Estudio comparten curva; Lectura no', () => {
    expect(ingles.steps).toEqual(estudio.steps);
    expect(lectura.steps).not.toEqual(ingles.steps);
  });
});
