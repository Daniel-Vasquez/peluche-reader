/**
 * Lectura de variables de entorno que funciona en los TRES contextos donde
 * corre este código:
 *
 *  1. **Scripts con `tsx`** (`db:init`, `db:seed`…): `dotenv` rellena `process.env`.
 *  2. **Vercel en producción**: la plataforma rellena `process.env`.
 *  3. **`astro dev`**: Vite carga el `.env` en `import.meta.env`, y **no** en
 *     `process.env`. Esta es la razón de existir de este archivo: sin el
 *     segundo origen, en desarrollo no se ve ninguna variable privada.
 *
 * No se usa `astro:env` porque es un módulo virtual que solo existe dentro del
 * build de Astro: los scripts de `scripts/` no podrían importarlo.
 */

type EnvSource = Record<string, string | undefined>;

/** `import.meta.env` si existe en este runtime. */
function metaEnv(): EnvSource | undefined {
  // Acceso dinámico a propósito: con una clave literal
  // (`import.meta.env.MONGODB_URI`) Vite sustituiría el valor en tiempo de build
  // e incrustaría el secreto en el bundle. Leyendo el objeto entero, la
  // resolución ocurre en tiempo de ejecución.
  const meta = import.meta as unknown as { env?: EnvSource };
  return meta.env;
}

function procEnv(): EnvSource | undefined {
  return typeof process !== 'undefined' ? process.env : undefined;
}

/** Devuelve la variable, o `undefined` si no está definida o está vacía. */
export function readEnv(name: string): string | undefined {
  // `process.env` primero: en Vercel es la fuente autoritativa.
  for (const source of [procEnv(), metaEnv()]) {
    const value = source?.[name];
    if (value !== undefined && value !== '') return value;
  }
  return undefined;
}

/** Igual que `readEnv`, pero lanza con un mensaje accionable si falta. */
export function requireEnv(name: string): string {
  const value = readEnv(name);
  if (!value) {
    throw new Error(
      `Falta la variable de entorno ${name}. Cópiala de .env.example a .env ` +
        '(y cárgala también en Vercel > Settings > Environment Variables).',
    );
  }
  return value;
}

/** Lee la variable, o devuelve el valor por defecto si no está definida. */
export function readEnvOr(name: string, fallback: string): string {
  return readEnv(name) ?? fallback;
}
