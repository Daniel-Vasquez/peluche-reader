import type { WithId } from 'mongodb';
import { col } from '@/lib/db/collections';
import type { ProfileDoc } from '@/lib/db/types';
import { readEnvOr } from '@/lib/env';
import type { GoalType } from '@/lib/db/types';
import { rewardCurveFor } from '@/lib/game/rewards';
import { isValidTimezone } from '@/lib/time';

/**
 * Metas ofrecidas en la interfaz, **por tipo de objetivo**.
 *
 * Se derivan de los escalones de la curva en vez de escribirse a mano. El
 * comentario de antes ya decía que coincidían con ellos, pero eran una lista
 * suelta: al separarse las curvas por tipo, esa lista habría ofrecido 20 minutos
 * como meta de Inglés, que es justo la cifra que ahora cuesta un perrito.
 */
export function goalOptionsFor(type: GoalType): readonly number[] {
  return rewardCurveFor(type).steps.map((s) => s.minutes);
}

/** Zona horaria por defecto cuando el cliente no informa la suya. */
export function defaultTimezone(): string {
  const fromEnv = readEnvOr('PUBLIC_DEFAULT_TIMEZONE', 'America/Bogota');
  return isValidTimezone(fromEnv) ? fromEnv : 'UTC';
}

/**
 * Devuelve el perfil del usuario, creándolo si no existe. Idempotente.
 *
 * `$setOnInsert` + `upsert` en una sola operación: dos peticiones simultáneas
 * (por ejemplo dos pestañas abriendo `/`) no pueden crear dos perfiles,
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

/**
 * Campos del PERFIL que el usuario puede cambiar desde `/ajustes`.
 *
 * Los días, la meta y el libro ya no están aquí: son de cada objetivo y se
 * editan por `/api/goals/[goalId]`.
 */
export interface ProfilePatch {
  timezone?: string;
}

/**
 * Aplica cambios al perfil y marca el onboarding como completado.
 *
 * El primer guardado es lo que cierra el onboarding: hasta entonces la raíz
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
