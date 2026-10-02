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

/* ────────────────────────────────────────────────────────────────────────────
   Objetivos

   Cada objetivo (Lectura, Inglés, Estudio) es una FILA, no un campo: su propia
   configuración, su propio refugio y su propio historial. Todo lo demás se
   identifica por `GoalRef`, nunca por `userId` suelto.
   ──────────────────────────────────────────────────────────────────────────── */

export type GoalType = 'reading' | 'english' | 'study';

/**
 * Metadatos propios de cada tipo, como unión discriminada.
 *
 * Es lo que permite que Inglés guarde un curso y Estudio una materia sin que
 * ninguno tenga campos vacíos del otro. TypeScript obliga a comprobar `type`
 * antes de leer cualquier campo, así que un formulario no puede escribir
 * `courseName` en un objetivo de lectura.
 */
export type GoalMetadata =
  | { type: 'reading'; bookTitle: string | null; author: string | null }
  | { type: 'english'; courseName: string | null; level: string | null }
  | { type: 'study'; subject: string | null; topic: string | null };

export interface GoalDoc {
  userId: string;
  /**
   * Slug estable y único por usuario. Es la clave de TODO lo demás: nunca se
   * reutiliza ni se renombra, porque hay sesiones apuntando a él.
   */
  goalId: string;
  type: GoalType;
  /** Nombre visible y editable: "Inglés", "Cálculo II". */
  label: string;
  /** Días comprometidos de ESTE objetivo. ISO 1..7. Vacío = inactivo. */
  scheduledDays: IsoWeekday[];
  dailyGoalMinutes: number;
  metadata: GoalMetadata;
  /** Orden en la Vista de Hoy. */
  order: number;
  /** Archivar en vez de borrar: las sesiones pasadas siguen teniendo sentido. */
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Cómo se identifica un objetivo en toda la capa de datos.
 *
 * Se pasa el objeto entero y se expande con `...ref` en los filtros. Es lo que
 * evita el error más probable de la refactorización: olvidar el `goalId`, que no
 * da error y mezcla en silencio los datos de dos objetivos.
 */
export interface GoalRef {
  userId: string;
  goalId: string;
}

/** Metadato colapsado a texto para la interfaz, sin `switch` en los componentes. */
export function goalContext(metadata: GoalMetadata): string | null {
  switch (metadata.type) {
    case 'reading':
      return metadata.bookTitle;
    case 'english':
      return metadata.courseName;
    case 'study':
      return metadata.subject;
  }
}

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

/**
 * Preferencias del USUARIO, no de un objetivo. Una por usuario.
 *
 * Los días comprometidos, la meta y el libro vivían aquí cuando solo había un
 * hábito; ahora son de cada objetivo y están en `GoalDoc`.
 */
export interface ProfileDoc {
  userId: string;
  /** Zona horaria IANA, p. ej. `"America/Bogota"`. */
  timezone: string;
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
export interface SessionDoc {
  userId: string;
  goalId: string;
  dayKey: string;
  /**
   * Instantánea del metadato al abrir la sesión: si el usuario cambia de libro o
   * de tema, las sesiones viejas conservan el suyo.
   */
  contextLabel: string | null;
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
  goalId: string;
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
  goalId: string;
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
  goalId: string;
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
  'goals',
  'sessions',
  'dailyProgress',
  'gameState',
  'gameEvents',
] as const;
