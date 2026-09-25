/**
 * Formas de los documentos de MongoDB.
 *
 * No hay mongoose: el "esquema" son estos tipos + la validación Zod de los
 * endpoints. La base de datos solo garantiza unicidad mediante los índices de
 * `scripts/db-init.ts`.
 *
 * Convenciones (ver CLAUDE.md):
 *  - `userId`   → el `id` (string) que emite Better Auth, nunca un ObjectId.
 *  - `dayKey`   → `"YYYY-MM-DD"` en la zona horaria del usuario.
 *  - `weekKey`  → `"YYYY-Www"` ISO-8601, la semana empieza en lunes.
 *  - duraciones → siempre en **segundos** enteros.
 *
 * Los tipos NO incluyen `_id`: usa `WithId<T>` del driver cuando lo necesites.
 */

import type { IsoWeekday } from '@/lib/time';

/** Cómo terminó un día para el usuario. */
export type DayOutcome =
  /** Aún en curso, o sin lectura suficiente pero todavía recuperable (hoy). */
  | 'pending'
  /** Alcanzó el umbral de recompensa. */
  | 'completed'
  /** Día programado que cerró sin lectura suficiente. Ya penalizado. */
  | 'missed'
  /** Día no programado: no penaliza ni rompe la racha. */
  | 'rest';

/** Estado de una sesión de cronómetro. */
export type SessionStatus =
  | 'running'
  | 'paused'
  | 'completed'
  /** Cerrada sin alcanzar el mínimo, o abandonada por inactividad. No puntúa. */
  | 'abandoned';

/** Tipo de movimiento en el historial de gamificación. */
export type GameEventType =
  | 'reward'
  | 'penalty'
  | 'week_rollover'
  | 'adoption';

/** Preferencias del usuario. Una por usuario (índice único en `userId`). */
export interface ProfileDoc {
  userId: string;
  /** Zona horaria IANA, p. ej. `"America/Bogota"`. */
  timezone: string;
  /** Días comprometidos, ISO 1..7, ordenados y sin duplicados. Nunca vacío. */
  scheduledDays: IsoWeekday[];
  /** Meta personal de minutos por sesión (solo UI; no afecta al balance). */
  dailyGoalMinutes: number;
  currentBookTitle: string | null;
  /** `null` hasta que el usuario guarda sus ajustes por primera vez. */
  onboardedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Una sesión de cronómetro.
 *
 * El tiempo real es `accumulatedSeconds + (lastResumedAt ? now - lastResumedAt : 0)`
 * y **solo el servidor** lo calcula (ver `elapsedSeconds` en `repos/sessions.ts`).
 */
export interface ReadingSessionDoc {
  userId: string;
  dayKey: string;
  bookTitle: string | null;
  status: SessionStatus;
  startedAt: Date;
  /** Inicio del tramo en curso; `null` mientras está en pausa. */
  lastResumedAt: Date | null;
  /** Segundos de tramos ya cerrados (no incluye el tramo en curso). */
  accumulatedSeconds: number;
  endedAt: Date | null;
  /** Duración definitiva; solo tiene sentido cuando `status` es final. */
  durationSeconds: number;
  /** Marca de liquidación: impide otorgar perritos dos veces por la misma sesión. */
  settledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Agregado por usuario y día. Índice único en `(userId, dayKey)`. */
export interface DailyProgressDoc {
  userId: string;
  dayKey: string;
  weekKey: string;
  /** ¿Era un día comprometido según el perfil en el momento de registrarlo? */
  scheduled: boolean;
  totalSeconds: number;
  sessionsCount: number;
  /**
   * Perritos ya otorgados por este día. Es la pieza que hace idempotente la
   * recompensa: `settle` solo entrega la diferencia con este valor.
   */
  dogsAwarded: number;
  outcome: DayOutcome;
  updatedAt: Date;
}

/** Estado de gamificación. Uno por usuario (índice único en `userId`). */
export interface GameStateDoc {
  userId: string;
  /** Perritos vivos en el refugio. Invariante: `FLOOR_DOGS <= dogs <= capacity`. */
  dogs: number;
  /** Aforo actual del refugio. */
  capacity: number;
  /** Score histórico: perritos que desbordaron el aforo y encontraron casa. */
  adopted: number;
  weekKey: string;
  /** Perritos al abrir la semana; base del tope de pérdida semanal. */
  weekStartDogs: number;
  /** Perritos perdidos en la semana en curso. Invariante: `<= weeklyLossCap()`. */
  weekLosses: number;
  /** Último `dayKey` ya evaluado por la reconciliación. Siempre `< hoy`. */
  lastReconciledDay: string;
  streak: number;
  bestStreak: number;
  updatedAt: Date;
}

/** Entrada del historial. Alimenta la línea de tiempo de `/progreso`. */
export interface GameEventDoc {
  userId: string;
  dayKey: string;
  type: GameEventType;
  /** Positivo si gana, negativo si pierde, `0` en el cambio de semana. */
  delta: number;
  /** Texto legible, en español, ya listo para mostrar. */
  reason: string;
  /** Perritos en el refugio después de aplicar el evento. */
  dogsAfter: number;
  createdAt: Date;
}

/** Colecciones que gestiona Better Auth. Solo se listan para poder resetearlas. */
export const BETTER_AUTH_COLLECTIONS = [
  'user',
  'session',
  'account',
  'verification',
] as const;

/** Colecciones propias de la app. */
export const APP_COLLECTIONS = [
  'profiles',
  'readingSessions',
  'dailyProgress',
  'gameState',
  'gameEvents',
] as const;
