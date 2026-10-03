import { describe, expect, it } from 'vitest';
import { GAME } from '@/lib/game/config';
import { addDays, isoWeekdayOfDayKey } from '@/lib/time';
import { DAYS, SEED_GOALS, STUDY_STARTS_ON } from '../seed-profiles';

/**
 * El criterio de la Tanda E pide que `npm run db:seed` produzca "tres objetivos
 * con rachas distintas". Ejecutar el seed exige Mongo, pero lo que decide si las
 * rachas salen distintas no es la base de datos: son estas funciones de minutos
 * contra el umbral de `GAME`. Eso sí se puede comprobar aquí.
 *
 * El seed arranca 55 días antes de hoy, así que el día de la semana del primer
 * día cambia en cada ejecución. Todo lo que se afirma abajo se comprueba en las
 * **siete** alineaciones posibles: un perfil que solo funcione si se siembra en
 * lunes no es un perfil, es una casualidad.
 */

/** 2026-01-05 es lunes; sumarle 0..6 da las siete alineaciones. */
const LUNES = '2026-01-05';
const ALINEACIONES = [0, 1, 2, 3, 4, 5, 6].map((n) => addDays(LUNES, n));

interface Recuento {
  /** Días programados que alcanzan el umbral: suman racha. */
  cumplidos: number;
  /** Días programados que cierran por debajo del umbral: cuestan perrito. */
  fallados: number;
  /** Días programados con sesión pero insuficiente (0 < min < umbral). */
  insuficientes: number;
  /** Sesiones en días no programados: regalo, nunca penalización. */
  extras: number;
  minutos: number;
  sesiones: number;
  /** Índice del primer día con sesión. `-1` si no hubo ninguna. */
  primerDia: number;
}

function recorrer(goalId: string, primerDia: string): Recuento {
  const seed = SEED_GOALS.find((g) => g.goalId === goalId)!;
  const r: Recuento = {
    cumplidos: 0,
    fallados: 0,
    insuficientes: 0,
    extras: 0,
    minutos: 0,
    sesiones: 0,
    primerDia: -1,
  };

  for (let i = 0; i < DAYS; i += 1) {
    const day = addDays(primerDia, i);
    const minutes = seed.minutesFor(day, i);

    // Un día solo está programado si el objetivo ya tenía sus días ese día.
    const programado =
      i >= seed.activeFrom && seed.scheduledDays.includes(isoWeekdayOfDayKey(day));

    if (minutes > 0) {
      r.sesiones += 1;
      r.minutos += minutes;
      if (r.primerDia === -1) r.primerDia = i;
    }

    if (!programado) {
      if (minutes > 0) r.extras += 1;
      continue;
    }

    if (minutes >= GAME.BASE_MINUTES) r.cumplidos += 1;
    else {
      r.fallados += 1;
      if (minutes > 0) r.insuficientes += 1;
    }
  }

  return r;
}

describe('perfiles del seed', () => {
  it('describe tres objetivos con días comprometidos distintos', () => {
    const porDias = SEED_GOALS.map((g) => g.scheduledDays.join(','));
    expect(new Set(porDias).size).toBe(SEED_GOALS.length);
  });

  it('usa una hora distinta por objetivo, para no apilar sesiones simultáneas', () => {
    const horas = SEED_GOALS.map((g) => g.hour);
    expect(new Set(horas).size).toBe(SEED_GOALS.length);
  });

  describe.each(ALINEACIONES)('sembrando desde %s', (primerDia) => {
    it('Lectura no falla ni un día programado: sostiene la racha larga', () => {
      const r = recorrer('reading', primerDia);
      expect(r.fallados).toBe(0);
      // 8 semanas × 5 días laborables, menos el margen de la alineación.
      expect(r.cumplidos).toBeGreaterThanOrEqual(38);
    });

    it('Inglés falla seis días programados, dos de ellos por quedarse corto', () => {
      const r = recorrer('english', primerDia);
      expect(r.fallados).toBe(6);
      expect(r.insuficientes).toBe(2);
      // Irregular, no abandonado: la mayoría de sus días sí cuentan.
      expect(r.cumplidos).toBeGreaterThan(r.fallados);
    });

    it('Estudio empieza hace poco y con sesiones largas', () => {
      const r = recorrer('study', primerDia);
      expect(r.primerDia).toBeGreaterThanOrEqual(STUDY_STARTS_ON);
      expect(r.fallados).toBe(0);
      expect(r.sesiones).toBeGreaterThanOrEqual(5);
      // "Sesiones largas" es la razón de ser de este perfil: todas pasan de 45.
      expect(r.minutos / r.sesiones).toBeGreaterThanOrEqual(45);
    });

    it('da a los tres rachas de longitudes bien separadas', () => {
      const [lectura, ingles, estudio] = [
        recorrer('reading', primerDia),
        recorrer('english', primerDia),
        recorrer('study', primerDia),
      ];

      // Lectura nunca rompe, así que su racha es su total de días cumplidos.
      // Inglés la rompe seis veces y Estudio solo lleva dos semanas: ninguno
      // puede acercarse.
      expect(lectura.cumplidos).toBeGreaterThan(ingles.cumplidos);
      expect(ingles.cumplidos).toBeGreaterThan(estudio.cumplidos);
    });

    it('nunca penaliza a Estudio por los días anteriores a su activación', () => {
      const seed = SEED_GOALS.find((g) => g.goalId === 'study')!;
      for (let i = 0; i < STUDY_STARTS_ON; i += 1) {
        expect(seed.minutesFor(addDays(primerDia, i), i)).toBe(0);
      }
    });
  });
});
