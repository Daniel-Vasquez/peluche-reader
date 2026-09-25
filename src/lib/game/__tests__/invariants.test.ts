import { describe, expect, it } from 'vitest';
import { GAME } from '@/lib/game/config';
import {
  applyAction,
  capacityFor,
  initialState,
  reconcile,
  type GameAction,
  type GameState,
} from '@/lib/game/engine';
import { weeklyLossCap } from '@/lib/game/penalties';
import { dogsForMinutes } from '@/lib/game/rewards';
import { addDays, type IsoWeekday } from '@/lib/time';

/**
 * Prueba de fuerza bruta: miles de secuencias aleatorias de acciones sobre el
 * reducer. Ninguna combinación debe poder violar los invariantes del juego.
 *
 * Generador determinista (mulberry32) para que un fallo sea reproducible.
 */
function rng(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function checkInvariants(s: GameState, context: string) {
  const fail = (why: string) => `${why} — ${context}\nestado: ${JSON.stringify(s)}`;

  expect(s.dogs >= GAME.FLOOR_DOGS, fail('dogs por debajo del piso')).toBe(true);
  expect(s.dogs <= s.capacity, fail('dogs por encima del aforo')).toBe(true);
  expect(s.capacity <= GAME.MAX_CAPACITY, fail('aforo por encima del máximo')).toBe(true);
  expect(s.capacity === capacityFor(s.adopted), fail('aforo incoherente con adopted')).toBe(true);
  expect(
    s.weekLosses <= weeklyLossCap(s.weekStartDogs),
    fail('pérdidas semanales por encima del tope'),
  ).toBe(true);
  expect(s.adopted >= 0, fail('adopted negativo')).toBe(true);
  expect(s.streak >= 0, fail('racha negativa')).toBe(true);
  expect(s.bestStreak >= s.streak, fail('récord menor que la racha actual')).toBe(true);
  expect(Number.isInteger(s.dogs) && Number.isInteger(s.adopted), fail('no enteros')).toBe(true);
}

describe('invariantes bajo secuencias aleatorias', () => {
  it('sobrevive a 2000 secuencias de 40 acciones', () => {
    const MINUTOS = [0, 3, 8, 9, 10, 11, 14, 15, 20, 24, 25, 29, 30, 47, 120];

    for (let seed = 1; seed <= 2000; seed += 1) {
      const rand = rng(seed);
      let s = initialState('2026-W39', '2026-09-01');
      let day = '2026-09-01';
      let awardedToday = 0;

      for (let step = 0; step < 40; step += 1) {
        const roll = rand();
        let action: GameAction;

        if (roll < 0.1) {
          day = addDays(day, 1);
          action = { kind: 'rollover', weekKey: `2026-W${40 + (step % 12)}`, dayKey: day };
        } else if (roll < 0.4) {
          day = addDays(day, 1);
          awardedToday = 0;
          action = { kind: 'miss', dayKey: day };
        } else if (roll < 0.5) {
          day = addDays(day, 1);
          awardedToday = 0;
          action = { kind: 'rest', dayKey: day };
        } else {
          const minutes = MINUTOS[Math.floor(rand() * MINUTOS.length)]!;
          action = {
            kind: 'settle',
            dayKey: day,
            minutesToday: minutes,
            alreadyAwarded: awardedToday,
          };
          awardedToday = Math.max(awardedToday, dogsForMinutes(minutes));
        }

        const result = applyAction(s, action);
        s = result.state;
        checkInvariants(s, `semilla ${seed}, paso ${step}, acción ${action.kind}`);

        // Todo evento de recompensa o penalización deja constancia del saldo.
        for (const e of result.events) {
          expect(e.dogsAfter).toBe(s.dogs);
        }
      }
    }
  });

  it('reconcile aguanta huecos largos y horarios raros', () => {
    const HORARIOS: IsoWeekday[][] = [
      [1], [7], [1, 2, 3, 4, 5], [6, 7], [1, 2, 3, 4, 5, 6, 7], [2, 5],
    ];

    for (let seed = 1; seed <= 300; seed += 1) {
      const rand = rng(seed * 977);
      const horario = HORARIOS[seed % HORARIOS.length]!;
      const inicio = addDays('2026-01-01', Math.floor(rand() * 300));
      const huecoDias = 1 + Math.floor(rand() * 120);
      const hoy = addDays(inicio, huecoDias);

      // Algunos días leyó, elegidos al azar dentro del hueco.
      const leyo = new Set<string>();
      for (let i = 1; i < huecoDias; i += 1) {
        if (rand() < 0.35) leyo.add(addDays(inicio, i));
      }

      let s = { ...initialState('2026-W01', inicio), lastReconciledDay: inicio };
      const first = reconcile(s, hoy, horario, leyo);
      checkInvariants(first.state, `semilla ${seed}, hueco de ${huecoDias} días`);

      // Nunca juzga hoy.
      expect(first.state.lastReconciledDay < hoy).toBe(true);

      // Idempotente: repetir no cambia nada ni emite eventos.
      const second = reconcile(first.state, hoy, horario, leyo);
      expect(second.events).toEqual([]);
      expect(second.state).toEqual(first.state);
    }
  });
});
