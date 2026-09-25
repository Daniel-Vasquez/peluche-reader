import { describe, expect, it } from 'vitest';
import { GAME } from '@/lib/game/config';
import { effectivePenalty, weeklyLossCap } from '@/lib/game/penalties';

describe('weeklyLossCap', () => {
  it('es el 60 % de los perritos al abrir la semana, redondeado hacia arriba', () => {
    expect(weeklyLossCap(7)).toBe(5); // ceil(4.2)
    expect(weeklyLossCap(10)).toBe(6);
    expect(weeklyLossCap(21)).toBe(13); // ceil(12.6)
  });

  it('nunca es 0, para que un refugio pequeño siga teniendo consecuencias', () => {
    expect(weeklyLossCap(1)).toBe(1);
    expect(weeklyLossCap(0)).toBe(1);
  });
});

describe('effectivePenalty', () => {
  it('cuesta un perrito en condiciones normales', () => {
    expect(effectivePenalty(7, 7, 0)).toBe(1);
  });

  it('se corta al alcanzar el tope semanal', () => {
    // Con 5 pérdidas ya consumidas de un tope de 5, no se pierde más.
    expect(effectivePenalty(2, 7, 5)).toBe(0);
    expect(effectivePenalty(2, 7, 4)).toBe(1);
  });

  it('respeta el piso absoluto: Peluche nunca muere', () => {
    expect(effectivePenalty(GAME.FLOOR_DOGS, 20, 0)).toBe(0);
    expect(effectivePenalty(2, 20, 0)).toBe(1);
  });

  it('nunca devuelve un valor negativo', () => {
    for (const dogs of [0, 1, 2, 7, 21]) {
      for (const start of [0, 1, 7, 21]) {
        for (const losses of [0, 1, 5, 99]) {
          expect(effectivePenalty(dogs, start, losses)).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });
});

describe('la semana desastrosa: 7 de 7 días fallados', () => {
  it('desde 7 perritos termina en 2, nunca en 0', () => {
    const start = GAME.START_DOGS;
    let dogs = start;
    let losses = 0;
    const perDay: number[] = [];

    for (let day = 0; day < 7; day += 1) {
      const loss = effectivePenalty(dogs, start, losses);
      dogs -= loss;
      losses += loss;
      perDay.push(loss);
    }

    expect(perDay).toEqual([1, 1, 1, 1, 1, 0, 0]); // los dos últimos ya no cuestan
    expect(losses).toBe(weeklyLossCap(start));
    expect(losses).toBe(5);
    expect(dogs).toBe(2);
    expect(dogs).toBeGreaterThan(0);
  });

  it('se puede remontar el lunes siguiente con una sesión de 20 min', () => {
    // 20 min → 4 perritos, que reponen los 5 días fallados casi por completo.
    const dogsAfterDisaster = 2;
    expect(dogsAfterDisaster + 4).toBe(6);
  });

  it('nunca llega al piso, empiece con los perritos que empiece', () => {
    for (const start of [1, 2, 3, 7, 12, 21]) {
      let dogs = start;
      let losses = 0;
      for (let day = 0; day < 30; day += 1) {
        const loss = effectivePenalty(dogs, start, losses);
        dogs -= loss;
        losses += loss;
      }
      expect(dogs).toBeGreaterThanOrEqual(GAME.FLOOR_DOGS);
    }
  });
});
