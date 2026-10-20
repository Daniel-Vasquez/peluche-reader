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
import { policyFor } from '@/lib/game/policy';
import type { IsoWeekday } from '@/lib/time';

/** Vocabulario de prueba: el motor no debe depender de cuál sea. */
const POL = policyFor('reading');

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
    const { state, events } = reconcile(s, '2026-09-24', WEEKDAYS, new Set(), POL);
    expect(events).toEqual([]);
    expect(state).toEqual(s);
  });
});

describe('es puro: no muta el estado que recibe', () => {
  it('applyAction devuelve un objeto nuevo', () => {
    const s = initialState('2026-W39', '2026-09-23');
    const snapshot = structuredClone(s);
    applyAction(s, { kind: 'miss', dayKey: '2026-09-23' }, POL);
    applyAction(s, { kind: 'settle', dayKey: '2026-09-23', minutesToday: 30, alreadyAwarded: 0 }, POL);
    expect(s).toEqual(snapshot);
  });
});

describe('settle: recompensa idempotente', () => {
  it('liquidar dos veces los mismos minutos NO duplica la recompensa', () => {
    const base = { ...initialState('2026-W39', '2026-09-23'), dogs: 3, capacity: 7 };

    const first = applyAction(base, {
      kind: 'settle', dayKey: '2026-09-24', minutesToday: 20, alreadyAwarded: 0,
    }, POL);
    expect(first.state.dogs).toBe(7); // 3 + 4
    expect(first.events.filter((e) => e.type === 'reward')).toHaveLength(1);

    // Segunda liquidación del MISMO día: ya se otorgaron 4.
    const second = applyAction(first.state, {
      kind: 'settle', dayKey: '2026-09-24', minutesToday: 20, alreadyAwarded: 4,
    }, POL);
    expect(second.state.dogs).toBe(7);
    expect(second.events).toEqual([]);
    expectInvariants(second.state);
  });

  it('solo paga la diferencia cuando el usuario sigue leyendo', () => {
    const base = { ...initialState('2026-W39', '2026-09-23'), dogs: 1, capacity: 7 };
    // Primera sesión: 10 min → 1 perrito.
    const a = applyAction(base, {
      kind: 'settle', dayKey: '2026-09-24', minutesToday: 10, alreadyAwarded: 0,
    }, POL);
    expect(a.state.dogs).toBe(2);
    // Sigue hasta 20 min en total → total 4, ya tenía 1, así que +3 (no +4).
    const b = applyAction(a.state, {
      kind: 'settle', dayKey: '2026-09-24', minutesToday: 20, alreadyAwarded: 1,
    }, POL);
    expect(b.events[0]?.delta).toBe(3);
    expect(b.state.dogs).toBe(5);
  });

  it('por debajo del umbral no otorga ni registra nada', () => {
    const base = initialState('2026-W39', '2026-09-23');
    const r = applyAction(base, {
      kind: 'settle', dayKey: '2026-09-24', minutesToday: 8, alreadyAwarded: 0,
    }, POL);
    expect(r.events).toEqual([]);
    expect(r.state.dogs).toBe(base.dogs);
  });
});

describe('settle: desborde del aforo', () => {
  it('con el refugio lleno, los extra se adoptan y amplían el aforo', () => {
    const full = { ...initialState('2026-W39', '2026-09-23'), dogs: 7, capacity: 7 };
    const r = applyAction(full, {
      kind: 'settle', dayKey: '2026-09-24', minutesToday: 30, alreadyAwarded: 0,
    }, POL);
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
    }, POL).state;
    expect(s.dogs + s.adopted).toBe(before + 11);
  });
});

describe('miss y rollover', () => {
  it('un día fallado cuesta un perrito y rompe la racha', () => {
    const s: GameState = { ...initialState('2026-W39', '2026-09-22'), streak: 4, bestStreak: 4 };
    const r = applyAction(s, { kind: 'miss', dayKey: '2026-09-23' }, POL);
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
    const r = applyAction(s, { kind: 'rollover', weekKey: '2026-W40', dayKey: '2026-09-28' }, POL);
    expect(r.state.weekKey).toBe('2026-W40');
    expect(r.state.weekStartDogs).toBe(4);
    expect(r.state.weekLosses).toBe(0);
    expect(r.state.dogs).toBe(4); // el cambio de semana no da ni quita perritos
    expect(r.events[0]).toMatchObject({ type: 'week_rollover', delta: 0 });
  });

  it('un día de descanso no penaliza ni rompe la racha', () => {
    const s: GameState = { ...initialState('2026-W39', '2026-09-25'), streak: 3, bestStreak: 3 };
    const r = applyAction(s, { kind: 'rest', dayKey: '2026-09-26' }, POL);
    expect(r.state.dogs).toBe(s.dogs);
    expect(r.state.streak).toBe(3);
    expect(r.events).toEqual([]);
  });
});

describe('reconcile', () => {
  it('nunca juzga el día en curso', () => {
    const s = { ...initialState('2026-W39', '2026-09-22'), lastReconciledDay: '2026-09-22' };
    const r = reconcile(s, '2026-09-24', WEEKDAYS, new Set(), POL);
    // Evalúa el 23 (miércoles, programado, sin leer) pero NO el 24.
    expect(r.state.lastReconciledDay).toBe('2026-09-23');
    expect(r.events.filter((e) => e.type === 'penalty')).toHaveLength(1);
  });

  it('es idempotente: repetirla no produce eventos nuevos', () => {
    const s = { ...initialState('2026-W39', '2026-09-20'), lastReconciledDay: '2026-09-20' };
    const first = reconcile(s, '2026-09-25', WEEKDAYS, new Set(), POL);
    expect(first.events.length).toBeGreaterThan(0);

    const second = reconcile(first.state, '2026-09-25', WEEKDAYS, new Set(), POL);
    expect(second.events).toEqual([]);
    expect(second.state).toEqual(first.state);
  });

  it('no penaliza los días no programados', () => {
    const soloLunes: IsoWeekday[] = [1];
    const s = { ...initialState('2026-W39', '2026-09-21'), lastReconciledDay: '2026-09-21' };
    // 22 (mar) a 27 (dom): ninguno es lunes, así que ninguno penaliza.
    const r = reconcile(s, '2026-09-28', soloLunes, new Set(), POL);
    expect(r.events.filter((e) => e.type === 'penalty')).toHaveLength(0);
    expect(r.state.dogs).toBe(7);
  });

  it('cuenta la racha y conserva el récord', () => {
    const s = { ...initialState('2026-W39', '2026-09-20'), lastReconciledDay: '2026-09-20' };
    const leyo = new Set(['2026-09-21', '2026-09-22', '2026-09-23']);
    const r = reconcile(s, '2026-09-24', WEEKDAYS, leyo, POL);
    expect(r.state.streak).toBe(3);
    expect(r.state.bestStreak).toBe(3);

    // El 24 falla: la racha se rompe pero el récord queda.
    const r2 = reconcile(r.state, '2026-09-25', WEEKDAYS, leyo, POL);
    expect(r2.state.streak).toBe(0);
    expect(r2.state.bestStreak).toBe(3);
  });

  it('cruza el cambio de semana y reinicia el tope de pérdida', () => {
    // 2026-09-25 es viernes (W39); 2026-09-28, lunes (W40).
    const s = { ...initialState('2026-W39', '2026-09-24'), lastReconciledDay: '2026-09-24' };
    const r = reconcile(s, '2026-10-01', WEEKDAYS, new Set(), POL);
    expect(r.events.filter((e) => e.type === 'week_rollover')).toHaveLength(1);
    expect(r.state.weekKey).toBe('2026-W40');
    expectInvariants(r.state);
  });

  it('un mes entero sin entrar mantiene los invariantes y no vacía el refugio', () => {
    const s = { ...initialState('2026-W36', '2026-08-31'), lastReconciledDay: '2026-08-31' };
    const r = reconcile(s, '2026-10-01', WEEKDAYS, new Set(), POL);
    expect(r.state.dogs).toBeGreaterThanOrEqual(GAME.FLOOR_DOGS);
    expect(r.state.lastReconciledDay).toBe('2026-09-30');
    expectInvariants(r.state);
  });
});

describe('reconcile con el objetivo en pausa', () => {
  // 2026-09-21 es lunes. WEEKDAYS = lunes a viernes.
  const base = () => ({
    ...initialState('2026-W39', '2026-09-20'),
    lastReconciledDay: '2026-09-20',
  });

  it('una semana programada sin cumplir no cuesta ni un perrito', () => {
    const activo = reconcile(base(), '2026-09-26', WEEKDAYS, new Set(), POL, false);
    const pausado = reconcile(base(), '2026-09-26', WEEKDAYS, new Set(), POL, true);

    expect(activo.state.dogs).toBeLessThan(7);
    expect(pausado.state.dogs).toBe(7);
    expect(pausado.events.filter((e) => e.type === 'penalty')).toHaveLength(0);
    expectInvariants(pausado.state);
  });

  it('no rompe la racha', () => {
    const conRacha = { ...base(), streak: 5, bestStreak: 9 };
    const r = reconcile(conRacha, '2026-09-26', WEEKDAYS, new Set(), POL, true);
    expect(r.state.streak).toBe(5);
    expect(r.state.bestStreak).toBe(9);
  });

  it('avanza lastReconciledDay igual, así no se acumula deuda', () => {
    const r = reconcile(base(), '2026-09-26', WEEKDAYS, new Set(), POL, true);
    expect(r.state.lastReconciledDay).toBe('2026-09-25');

    // Y al reanudar, esos días ya están cerrados: no se cobran hacia atrás.
    const trasReanudar = reconcile(r.state, '2026-09-26', WEEKDAYS, new Set(), POL, false);
    expect(trasReanudar.events.filter((e) => e.type === 'penalty')).toHaveLength(0);
    expect(trasReanudar.state.dogs).toBe(7);
  });

  it('distingue en el historial un día pausado de uno libre', () => {
    // Del 21 (lun) al 27 (dom): cinco días programados y dos de descanso.
    const r = reconcile(base(), '2026-09-28', WEEKDAYS, new Set(), POL, true);
    const pausados = r.days.filter((d) => d.outcome === 'paused');
    const libres = r.days.filter((d) => d.outcome === 'rest');

    expect(pausados).toHaveLength(5);
    expect(libres).toHaveLength(2);
    expect(r.days.some((d) => d.outcome === 'missed')).toBe(false);
  });

  it('lo que sí se practica sigue contando', () => {
    const leyo = new Set(['2026-09-21', '2026-09-22']);
    const r = reconcile(base(), '2026-09-23', WEEKDAYS, new Set(leyo), POL, true);
    expect(r.state.streak).toBe(2);
    expect(r.days.filter((d) => d.outcome === 'completed')).toHaveLength(2);
  });

  it('sigue siendo idempotente', () => {
    const first = reconcile(base(), '2026-09-26', WEEKDAYS, new Set(), POL, true);
    const second = reconcile(first.state, '2026-09-26', WEEKDAYS, new Set(), POL, true);
    expect(second.events).toEqual([]);
    expect(second.state).toEqual(first.state);
  });

  it('un mes entero en pausa deja el refugio intacto', () => {
    const s = { ...initialState('2026-W36', '2026-08-31'), lastReconciledDay: '2026-08-31' };
    const r = reconcile(s, '2026-10-01', WEEKDAYS, new Set(), POL, true);
    expect(r.state.dogs).toBe(7);
    expect(r.state.weekLosses).toBe(0);
    expect(r.state.lastReconciledDay).toBe('2026-09-30');
    expectInvariants(r.state);
  });
});

describe('escenario narrativo del Apéndice B', () => {
  it('reproduce la semana de Influencia paso a paso', () => {
    // Lunes 2026-09-21, compromiso L–V, refugio inicial de 7.
    let s = initialState('2026-W39', '2026-09-20');
    const settle = (dayKey: string, minutes: number, already = 0) => {
      const r = applyAction(s, { kind: 'settle', dayKey, minutesToday: minutes, alreadyAwarded: already }, POL);
      s = r.state;
      expectInvariants(s);
      return r;
    };
    const miss = (dayKey: string) => {
      const r = applyAction(s, { kind: 'miss', dayKey }, POL);
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

    applyAction(s, { kind: 'rest', dayKey: '2026-09-26' }, POL); // sábado libre
    expect(s.dogs).toBe(7);

    const domingo = settle('2026-09-27', 8); // domingo: 8 min, bajo el umbral
    expect(domingo.events).toEqual([]);

    // Cierre de semana el lunes siguiente.
    const rolled = applyAction(s, { kind: 'rollover', weekKey: '2026-W40', dayKey: '2026-09-28' }, POL);
    expect(rolled.state.weekStartDogs).toBe(7);
    expect(rolled.state.weekLosses).toBe(0);
    expect(rolled.state.adopted).toBe(8);
    expect(rolled.state.capacity).toBe(7); // faltan 2 adopciones para el +1
  });
});

describe('reconcile informa del resultado de cada día', () => {
  it('clasifica cada día como completed, missed o rest', () => {
    // 2026-09-21 lunes … 2026-09-27 domingo. Compromiso L–V.
    const s = { ...initialState('2026-W39', '2026-09-20'), lastReconciledDay: '2026-09-20' };
    const leyo = new Set(['2026-09-21', '2026-09-25']);
    const r = reconcile(s, '2026-09-28', WEEKDAYS, leyo, POL);

    expect(r.days).toEqual([
      { dayKey: '2026-09-21', outcome: 'completed' }, // lunes, leyó
      { dayKey: '2026-09-22', outcome: 'missed' },    // martes programado
      { dayKey: '2026-09-23', outcome: 'missed' },
      { dayKey: '2026-09-24', outcome: 'missed' },
      { dayKey: '2026-09-25', outcome: 'completed' }, // viernes, leyó
      { dayKey: '2026-09-26', outcome: 'rest' },      // sábado libre
      { dayKey: '2026-09-27', outcome: 'rest' },      // domingo libre
    ]);
  });

  it('un día `missed` sin penalización (tope alcanzado) sigue siendo `missed`', () => {
    const s = { ...initialState('2026-W39', '2026-09-20'), lastReconciledDay: '2026-09-20' };
    const r = reconcile(s, '2026-09-28', [1, 2, 3, 4, 5, 6, 7], new Set(), POL);
    const missed = r.days.filter((d) => d.outcome === 'missed');
    const penalties = r.events.filter((e) => e.type === 'penalty');
    expect(missed).toHaveLength(7);
    // El tope semanal corta en 5, pero los 7 días siguen marcados como fallados.
    expect(penalties).toHaveLength(5);
  });

  it('no devuelve ningún día cuando no hay nada que reconciliar', () => {
    const s = { ...initialState('2026-W39', '2026-09-24'), lastReconciledDay: '2026-09-24' };
    expect(reconcile(s, '2026-09-24', WEEKDAYS, new Set(), POL).days).toEqual([]);
  });
});

describe('el motor no sabe de qué objetivo habla', () => {
  it('redacta los eventos con el vocabulario que recibe', () => {
    const base = { ...initialState('2026-W39', '2026-09-23'), dogs: 3 };
    const ingles = policyFor('english');

    // 30 minutos: el umbral de Inglés. Con 20 no habría recompensa que redactar.
    const premio = applyAction(
      base,
      { kind: 'settle', dayKey: '2026-09-24', minutesToday: 30, alreadyAwarded: 0 },
      ingles,
    );
    expect(premio.events[0]?.reason).toBe('30 min de inglés');

    const fallo = applyAction(base, { kind: 'miss', dayKey: '2026-09-24' }, ingles);
    expect(fallo.events[0]?.reason).toBe('Día programado sin practicar inglés');
  });

  it('el mismo estado y la misma acción dan textos distintos por tipo', () => {
    const base = initialState('2026-W39', '2026-09-23');
    const razones = (['reading', 'english', 'study'] as const).map(
      (tipo) =>
        applyAction(base, { kind: 'miss', dayKey: '2026-09-24' }, policyFor(tipo))
          .events[0]?.reason,
    );
    // Tres textos distintos: el motor no impone ninguno.
    expect(new Set(razones).size).toBe(3);
    expect(razones).toEqual([
      'Día programado sin leer',
      'Día programado sin practicar inglés',
      'Día programado sin estudiar',
    ]);
  });

  it('la PENALIZACIÓN no depende del tipo: un día fallado cuesta lo mismo', () => {
    const base = { ...initialState('2026-W39', '2026-09-23'), dogs: 4 };
    const accion = { kind: 'miss' as const, dayKey: '2026-09-24' };
    const estados = (['reading', 'english', 'study'] as const).map(
      (tipo) => applyAction(base, accion, policyFor(tipo)).state,
    );
    expect(estados[0]).toEqual(estados[1]);
    expect(estados[1]).toEqual(estados[2]);
  });

  it('la RECOMPENSA sí: los mismos minutos valen distinto en cada curva', () => {
    // `adopted: 140` para que el aforo sea el máximo (21) y ninguna recompensa
    // desborde: el motor deriva `capacity` de `adopted`, así que fijarla a mano
    // no sirve de nada.
    const base = { ...initialState('2026-W39', '2026-09-23'), dogs: 1, adopted: 140, capacity: 21 };
    const settle = (minutos: number, tipo: 'reading' | 'english' | 'study') =>
      applyAction(
        base,
        { kind: 'settle', dayKey: '2026-09-24', minutesToday: minutos, alreadyAwarded: 0 },
        policyFor(tipo),
      ).state.dogs - base.dogs;

    // 25 minutos: una buena sesión de lectura, insuficiente para inglés.
    expect(settle(25, 'reading')).toBe(7);
    expect(settle(25, 'english')).toBe(0);

    // 30: tope de lectura, umbral de inglés.
    expect(settle(30, 'reading')).toBe(11);
    expect(settle(30, 'english')).toBe(1);

    // 60: lectura ya no crece; inglés sí.
    expect(settle(60, 'reading')).toBe(11);
    expect(settle(60, 'english')).toBe(3);

    // Inglés y Estudio comparten curva.
    expect(settle(60, 'study')).toBe(settle(60, 'english'));
  });
});

