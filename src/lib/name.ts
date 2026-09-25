/**
 * Reglas del nombre del usuario.
 *
 * El nombre se pide **solo al registrarse** (el inicio de sesión sigue siendo
 * correo + contraseña) y es la fuente de toda la personalización de la app.
 *
 * Este archivo lo comparten el formulario de React y el hook de Better Auth del
 * servidor: la validación tiene que ser la misma en los dos lados, porque un
 * cliente puede hacer POST a `/api/auth/sign-up/email` sin pasar por el
 * formulario.
 */

export const NAME_MIN_LENGTH = 2;
export const NAME_MAX_LENGTH = 60;

/** Quita espacios sobrantes y colapsa los internos. No recorta la longitud. */
export function normalizeName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ');
}

export type NameCheck =
  | { ok: true; name: string }
  | { ok: false; error: string };

/** Normaliza y valida. El mensaje de error ya está en español, listo para mostrar. */
export function checkName(raw: string): NameCheck {
  const name = normalizeName(raw);

  if (name.length < NAME_MIN_LENGTH) {
    return {
      ok: false,
      error: `Tu nombre debe tener al menos ${NAME_MIN_LENGTH} caracteres.`,
    };
  }
  if (name.length > NAME_MAX_LENGTH) {
    return {
      ok: false,
      error: `Tu nombre no puede pasar de ${NAME_MAX_LENGTH} caracteres.`,
    };
  }
  return { ok: true, name };
}

/**
 * Primer nombre, para saludos cortos ("Hola, Daniel" en vez del nombre completo).
 * Si el nombre es una sola palabra, la devuelve tal cual.
 */
export function firstName(fullName: string): string {
  return normalizeName(fullName).split(' ')[0] ?? fullName;
}
