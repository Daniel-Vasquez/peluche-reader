import type { WithId } from 'mongodb';
import { col } from '@/lib/db/collections';
import type { ProfileDoc } from '@/lib/db/types';
import { readEnvOr } from '@/lib/env';
import { isValidTimezone, type IsoWeekday } from '@/lib/time';

/** Valores de un perfil recién creado. */
export const PROFILE_DEFAULTS = {
  /** Lunes a viernes: el compromiso más habitual, y editable al instante. */
  scheduledDays: [1, 2, 3, 4, 5] as IsoWeekday[],
  dailyGoalMinutes: 10,
} as const;

/** Metas ofrecidas en la interfaz. Coinciden con los escalones de recompensa. */
export const GOAL_OPTIONS = [10, 15, 20, 25, 30] as const;

/** Zona horaria por defecto cuando el cliente no informa la suya. */
export function defaultTimezone(): string {
  const fromEnv = readEnvOr('PUBLIC_DEFAULT_TIMEZONE', 'America/Bogota');
  return isValidTimezone(fromEnv) ? fromEnv : 'UTC';
}

/**
 * Devuelve el perfil del usuario, creándolo si no existe. Idempotente.
 *
 * `$setOnInsert` + `upsert` en una sola operación: dos peticiones simultáneas
 * (por ejemplo dos pestañas abriendo `/app`) no pueden crear dos perfiles,
 * porque el índice único en `userId` lo impide.
 */
export async function ensureProfile(
  userId: string,
  timezone?: string,
): Promise<WithId<ProfileDoc>> {
  const profiles = await col.profiles();
  const now = new Date();
  const tz = timezone && isValidTimezone(timezone) ? timezone : defaultTimezone();

  await profiles.updateOne(
    { userId },
    {
      $setOnInsert: {
        userId,
        timezone: tz,
        scheduledDays: [...PROFILE_DEFAULTS.scheduledDays],
        dailyGoalMinutes: PROFILE_DEFAULTS.dailyGoalMinutes,
        currentBookTitle: null,
        onboardedAt: null,
        createdAt: now,
        updatedAt: now,
      },
    },
    { upsert: true },
  );

  const profile = await profiles.findOne({ userId });
  if (!profile) throw new Error(`No se pudo crear el perfil de ${userId}`);
  return profile;
}

/** Campos que el usuario puede cambiar desde `/ajustes`. */
export interface ProfilePatch {
  scheduledDays?: IsoWeekday[];
  timezone?: string;
  dailyGoalMinutes?: number;
  currentBookTitle?: string | null;
}

/**
 * Aplica cambios al perfil y marca el onboarding como completado.
 *
 * El primer guardado es lo que cierra el onboarding: hasta entonces `/app`
 * redirige a `/ajustes`, porque sin días comprometidos la gamificación no puede
 * penalizar ni recompensar nada.
 */
export async function updateProfile(
  userId: string,
  patch: ProfilePatch,
): Promise<WithId<ProfileDoc>> {
  const profiles = await col.profiles();
  const existing = await ensureProfile(userId, patch.timezone);

  const result = await profiles.findOneAndUpdate(
    { userId },
    {
      $set: {
        ...patch,
        updatedAt: new Date(),
        ...(existing.onboardedAt ? {} : { onboardedAt: new Date() }),
      },
    },
    { returnDocument: 'after' },
  );

  if (!result) throw new Error(`No se encontró el perfil de ${userId}`);
  return result;
}
