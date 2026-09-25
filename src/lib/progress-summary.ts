import type { DayOutcome, GameEventType } from '@/lib/db/types';

/** Forma que consume el dashboard. Se calcula entera en el servidor. */

export interface DayPoint {
  dayKey: string;
  /** Etiqueta corta para el eje, p. ej. "L 22". */
  label: string;
  minutes: number;
  scheduled: boolean;
  outcome: DayOutcome;
  dogsAwarded: number;
}

export interface DogsPoint {
  dayKey: string;
  label: string;
  /** Perritos en el refugio al cerrar ese día. */
  dogs: number;
}

export interface WeekRow {
  weekKey: string;
  /** Lunes de la semana, como etiqueta corta. */
  label: string;
  days: (DayPoint | null)[];
}

export interface TimelineEntry {
  dayKey: string;
  label: string;
  type: GameEventType;
  delta: number;
  reason: string;
  dogsAfter: number;
}

export interface ProgressSummary {
  totals: {
    minutesAllTime: number;
    minutesThisWeek: number;
    sessionsAllTime: number;
    daysCompleted: number;
    /** Días cumplidos / días programados ya cerrados, en 0..1. `null` si no hay ninguno. */
    adherence: number | null;
    scheduledClosed: number;
    completedScheduled: number;
  };
  shelter: {
    dogs: number;
    capacity: number;
    adopted: number;
    streak: number;
    bestStreak: number;
    weekLosses: number;
    weeklyLossCap: number;
  };
  daily: DayPoint[];
  dogsTimeline: DogsPoint[];
  weeks: WeekRow[];
  events: TimelineEntry[];
  /** `true` cuando el usuario todavía no ha leído nunca. */
  empty: boolean;
}
