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

/**
 * Quita comillas envolventes y espacios.
 *
 * El panel de Vercel **no** limpia el valor que pegas: si copias
 * `MONGODB_URI="mongodb+srv://…"` del `.env.example` con las comillas incluidas,
 * llegan como parte del valor. Y eso rompe en silencio cosas difíciles de
 * diagnosticar: `new URL('"http://…"')` lanza `Invalid URL` (tumba el build por
 * `site` y la autenticación por `baseURL`), y el driver de Mongo no reconoce el
 * esquema `"mongodb+srv://`.
 *
 * Ningún valor legítimo del proyecto empieza y acaba por comilla —las URLs, el
 * secreto en base64 y los identificadores IANA no las contienen—, así que
 * normalizar aquí es seguro y cubre a todos los consumidores de golpe.
 */
function unwrap(value: string): string {
  return value.trim().replace(/^(['"])([\s\S]*)\1$/, '$2').trim();
}

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
    const raw = source?.[name];
    if (raw === undefined) continue;
    const value = unwrap(raw);
    if (value !== '') return value;
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
