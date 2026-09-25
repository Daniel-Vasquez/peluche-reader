import { describe, expect, it } from 'vitest';
import { GAME } from '@/lib/game/config';
import {
  applyAction,
  capacityFor,
  initialState,
  reconcile,
  type GameState,
} from '@/lib/game/engine';
import { weeklyLossCap } from '@/lib/game/penalties';
import type { IsoWeekday } from '@/lib/time';

/** Invariantes que deben cumplirse SIEMPRE, hagas lo que hagas. */
function expectInvariants(s: GameState) {
  expect(s.dogs).toBeGreaterThanOrEqual(GAME.FLOOR_DOGS);
  expect(s.dogs).toBeLessThanOrEqual(s.capacity);
  expect(s.capacity).toBeLessThanOrEqual(GAME.MAX_CAPACITY);
  expect(s.weekLosses).toBeLessThanOrEqual(weeklyLossCap(s.weekStartDogs));
  expect(s.adopted).toBeGreaterThanOrEqual(0);
  expect(s.bestStreak).toBeGreaterThanOrEqual(s.streak);
  expect(Number.isInteger(s.dogs)).toBe(true);
  expect(Number.isInteger(s.adopted)).toBe(true);
}

const WEEKDAYS: IsoWeekday[] = [1, 2, 3, 4, 5];

describe('capacityFor', () => {
  it('crece +1 cada 10 adopciones y topa en 21', () => {
    expect(capacityFor(0)).toBe(7);
    expect(capacityFor(9)).toBe(7);
    expect(capacityFor(10)).toBe(8);
    expect(capacityFor(19)).toBe(8);
    expect(capacityFor(140)).toBe(21);
    expect(capacityFor(10_000)).toBe(GAME.MAX_CAPACITY);
  });
});

describe('initialState', () => {
  it('abre con 7 perritos y sin deuda', () => {
    const s = initialState('2026-W39', '2026-09-24');
    expect(s.dogs).toBe(7);
    expect(s.capacity).toBe(7);
    expect(s.adopted).toBe(0);
    expect(s.weekLosses).toBe(0);
    expect(s.weekStartDogs).toBe(7);
    expectInvariants(s);
  });

  it('no penaliza el día de alta', () => {
    const s = initialState('2026-W39', '2026-09-24');
    expect(s.lastReconciledDay).toBe('2026-09-24');
    const { state, events } = reconcile(s, '2026-09-24', WEEKDAYS, new Set());
    expect(events).toEqual([]);
    expect(state).toEqual(s);
  });
});

describe('es puro: no muta el estado que recibe', () => {
  it('applyAction devuelve un objeto nuevo', () => {
    const s = initialState('2026-W39', '2026-09-23');
    const snapshot = structuredClone(s);
    applyAction(s, { kind: 'miss', dayKey: '2026-09-23' });
    applyAction(s, { kind: 'settle', dayKey: '2026-09-23', minutesToday: 30, alreadyAwarded: 0 });
    expect(s).toEqual(snapshot);
  });
});

describe('settle: recompensa idempotente', () => {
  it('liquidar dos veces los mismos minutos NO duplica la recompensa', () => {
    const base = { ...initialState('2026-W39', '2026-09-23'), dogs: 3, capacity: 7 };

    const first = applyAction(base, {
      kind: 'settle', dayKey: '2026-09-24', minutesToday: 20, alreadyAwarded: 0,
    });
    expect(first.state.dogs).toBe(7); // 3 + 4
    expect(first.events.filter((e) => e.type === 'reward')).toHaveLength(1);

    // Segunda liquidación del MISMO día: ya se otorgaron 4.
    const second = applyAction(first.state, {
      kind: 'settle', dayKey: '2026-09-24', minutesToday: 20, alreadyAwarded: 4,
    });
    expect(second.state.dogs).toBe(7);
    expect(second.events).toEqual([]);
    expectInvariants(second.state);
  });

  it('solo paga la diferencia cuando el usuario sigue leyendo', () => {
    const base = { ...initialState('2026-W39', '2026-09-23'), dogs: 1, capacity: 7 };
    // Primera sesión: 10 min → 1 perrito.
    const a = applyAction(base, {
      kind: 'settle', dayKey: '2026-09-24', minutesToday: 10, alreadyAwarded: 0,
    });
    expect(a.state.dogs).toBe(2);
    // Sigue hasta 20 min en total → total 4, ya tenía 1, así que +3 (no +4).
    const b = applyAction(a.state, {
      kind: 'settle', dayKey: '2026-09-24', minutesToday: 20, alreadyAwarded: 1,
    });
    expect(b.events[0]?.delta).toBe(3);
    expect(b.state.dogs).toBe(5);
  });

  it('por debajo del umbral no otorga ni registra nada', () => {
    const base = initialState('2026-W39', '2026-09-23');
    const r = applyAction(base, {
      kind: 'settle', dayKey: '2026-09-24', minutesToday: 8, alreadyAwarded: 0,
    });
    expect(r.events).toEqual([]);
    expect(r.state.dogs).toBe(base.dogs);
  });
});

describe('settle: desborde del aforo', () => {
  it('con el refugio lleno, los extra se adoptan y amplían el aforo', () => {
    const full = { ...initialState('2026-W39', '2026-09-23'), dogs: 7, capacity: 7 };
    const r = applyAction(full, {
      kind: 'settle', dayKey: '2026-09-24', minutesToday: 30, alreadyAwarded: 0,
    });
    expect(r.state.dogs).toBe(7);      // el refugio no crece de golpe
    expect(r.state.adopted).toBe(11);  // los 11 ganados encontraron casa
    expect(r.state.capacity).toBe(8);  // +1 por las 10 primeras adopciones
    expect(r.events.map((e) => e.type)).toEqual(['reward', 'adoption']);
    expectInvariants(r.state);
  });

  it('leer mucho nunca se desperdicia: todo lo ganado va a algún sitio', () => {
    let s = { ...initialState('2026-W39', '2026-09-23'), dogs: 5 };
    const before = s.dogs + s.adopted;
    s = applyAction(s, {
      kind: 'settle', dayKey: '2026-09-24', minutesToday: 30, alreadyAwarded: 0,
    }).state;
    expect(s.dogs + s.adopted).toBe(before + 11);
  });
});

describe('miss y rollover', () => {
  it('un día fallado cuesta un perrito y rompe la racha', () => {
    const s: GameState = { ...initialState('2026-W39', '2026-09-22'), streak: 4, bestStreak: 4 };
    const r = applyAction(s, { kind: 'miss', dayKey: '2026-09-23' });
    expect(r.state.dogs).toBe(6);
    expect(r.state.weekLosses).toBe(1);
    expect(r.state.streak).toBe(0);
    expect(r.state.bestStreak).toBe(4); // el récord se conserva
    expect(r.events[0]).toMatchObject({ type: 'penalty', delta: -1, dogsAfter: 6 });
  });

  it('el rollover reinicia el tope tomando los perritos actuales como base', () => {
    const s: GameState = {
      ...initialState('2026-W39', '2026-09-27'), dogs: 4, weekLosses: 5, weekStartDogs: 7,
    };
    const r = applyAction(s, { kind: 'rollover', weekKey: '2026-W40', dayKey: '2026-09-28' });
    expect(r.state.weekKey).toBe('2026-W40');
    expect(r.state.weekStartDogs).toBe(4);
    expect(r.state.weekLosses).toBe(0);
    expect(r.state.dogs).toBe(4); // el cambio de semana no da ni quita perritos
    expect(r.events[0]).toMatchObject({ type: 'week_rollover', delta: 0 });
  });

  it('un día de descanso no penaliza ni rompe la racha', () => {
    const s: GameState = { ...initialState('2026-W39', '2026-09-25'), streak: 3, bestStreak: 3 };
    const r = applyAction(s, { kind: 'rest', dayKey: '2026-09-26' });
    expect(r.state.dogs).toBe(s.dogs);
    expect(r.state.streak).toBe(3);
    expect(r.events).toEqual([]);
  });
});

describe('reconcile', () => {
  it('nunca juzga el día en curso', () => {
    const s = { ...initialState('2026-W39', '2026-09-22'), lastReconciledDay: '2026-09-22' };
    const r = reconcile(s, '2026-09-24', WEEKDAYS, new Set());
    // Evalúa el 23 (miércoles, programado, sin leer) pero NO el 24.
    expect(r.state.lastReconciledDay).toBe('2026-09-23');
    expect(r.events.filter((e) => e.type === 'penalty')).toHaveLength(1);
  });

  it('es idempotente: repetirla no produce eventos nuevos', () => {
    const s = { ...initialState('2026-W39', '2026-09-20'), lastReconciledDay: '2026-09-20' };
    const first = reconcile(s, '2026-09-25', WEEKDAYS, new Set());
    expect(first.events.length).toBeGreaterThan(0);

    const second = reconcile(first.state, '2026-09-25', WEEKDAYS, new Set());
    expect(second.events).toEqual([]);
    expect(second.state).toEqual(first.state);
  });

  it('no penaliza los días no programados', () => {
    const soloLunes: IsoWeekday[] = [1];
    const s = { ...initialState('2026-W39', '2026-09-21'), lastReconciledDay: '2026-09-21' };
    // 22 (mar) a 27 (dom): ninguno es lunes, así que ninguno penaliza.
    const r = reconcile(s, '2026-09-28', soloLunes, new Set());
    expect(r.events.filter((e) => e.type === 'penalty')).toHaveLength(0);
    expect(r.state.dogs).toBe(7);
  });

  it('cuenta la racha y conserva el récord', () => {
    const s = { ...initialState('2026-W39', '2026-09-20'), lastReconciledDay: '2026-09-20' };
    const leyo = new Set(['2026-09-21', '2026-09-22', '2026-09-23']);
    const r = reconcile(s, '2026-09-24', WEEKDAYS, leyo);
    expect(r.state.streak).toBe(3);
    expect(r.state.bestStreak).toBe(3);

    // El 24 falla: la racha se rompe pero el récord queda.
    const r2 = reconcile(r.state, '2026-09-25', WEEKDAYS, leyo);
    expect(r2.state.streak).toBe(0);
    expect(r2.state.bestStreak).toBe(3);
  });

  it('cruza el cambio de semana y reinicia el tope de pérdida', () => {
    // 2026-09-25 es viernes (W39); 2026-09-28, lunes (W40).
    const s = { ...initialState('2026-W39', '2026-09-24'), lastReconciledDay: '2026-09-24' };
    const r = reconcile(s, '2026-10-01', WEEKDAYS, new Set());
    expect(r.events.filter((e) => e.type === 'week_rollover')).toHaveLength(1);
    expect(r.state.weekKey).toBe('2026-W40');
    expectInvariants(r.state);
  });

  it('un mes entero sin entrar mantiene los invariantes y no vacía el refugio', () => {
    const s = { ...initialState('2026-W36', '2026-08-31'), lastReconciledDay: '2026-08-31' };
    const r = reconcile(s, '2026-10-01', WEEKDAYS, new Set());
    expect(r.state.dogs).toBeGreaterThanOrEqual(GAME.FLOOR_DOGS);
    expect(r.state.lastReconciledDay).toBe('2026-09-30');
    expectInvariants(r.state);
  });
});

describe('escenario narrativo del Apéndice B', () => {
  it('reproduce la semana de Influencia paso a paso', () => {
    // Lunes 2026-09-21, compromiso L–V, refugio inicial de 7.
    let s = initialState('2026-W39', '2026-09-20');
    const settle = (dayKey: string, minutes: number, already = 0) => {
      const r = applyAction(s, { kind: 'settle', dayKey, minutesToday: minutes, alreadyAwarded: already });
      s = r.state;
      expectInvariants(s);
      return r;
    };
    const miss = (dayKey: string) => {
      const r = applyAction(s, { kind: 'miss', dayKey });
      s = r.state;
      expectInvariants(s);
      return r;
    };

    settle('2026-09-21', 12);            // lunes: 12 min → +1, refugio lleno
    expect([s.dogs, s.adopted]).toEqual([7, 1]);

    settle('2026-09-22', 18);            // martes: 18 min → +2 (los 1080 s)
    expect([s.dogs, s.adopted]).toEqual([7, 3]);

    miss('2026-09-23');                  // miércoles sin leer
    expect(s.dogs).toBe(6);

    miss('2026-09-24');                  // jueves sin leer
    expect([s.dogs, s.weekLosses]).toEqual([5, 2]);

    settle('2026-09-25', 26);            // viernes: 26 min → +7, remonta dos días
    expect([s.dogs, s.adopted]).toEqual([7, 8]);

    applyAction(s, { kind: 'rest', dayKey: '2026-09-26' }); // sábado libre
    expect(s.dogs).toBe(7);

    const domingo = settle('2026-09-27', 8); // domingo: 8 min, bajo el umbral
    expect(domingo.events).toEqual([]);

    // Cierre de semana el lunes siguiente.
    const rolled = applyAction(s, { kind: 'rollover', weekKey: '2026-W40', dayKey: '2026-09-28' });
    expect(rolled.state.weekStartDogs).toBe(7);
    expect(rolled.state.weekLosses).toBe(0);
    expect(rolled.state.adopted).toBe(8);
    expect(rolled.state.capacity).toBe(7); // faltan 2 adopciones para el +1
  });
});
