// @ts-check
import { defineConfig } from 'astro/config';

import react from '@astrojs/react';
import vercel from '@astrojs/vercel';
import tailwindcss from '@tailwindcss/vite';

/**
 * Este archivo corre en Node puro, antes de que exista la tubería de Vite, así
 * que NO ve el `.env` y no puede importar `@/lib/env` (el alias tampoco existe
 * todavía). En Vercel sí funciona `process.env`, porque la plataforma lo rellena
 * durante el build.
 *
 * `site` tiene que ser una URL absoluta válida o Astro aborta el build con
 * "Invalid URL". Dos formas habituales de que llegue mal desde el panel de
 * Vercel, que **no** limpia el valor que pegas:
 *
 *   1. Con las comillas del `.env.example`:  "https://mi-app.vercel.app"
 *   2. Sin protocolo:                         mi-app.vercel.app
 *
 * Se normalizan las dos en vez de dejar caer el despliegue.
 */
/**
 * @param {string | undefined} raw
 * @returns {string}
 */
function resolveSite(raw) {
  const fallback = 'http://localhost:4321';
  if (!raw) return fallback;

  // Quita espacios y comillas envolventes (simples o dobles).
  let value = raw.trim().replace(/^['"]|['"]$/g, '').trim();
  if (value === '') return fallback;

  // Sin protocolo, se asume https: un dominio desnudo no es una URL válida.
  if (!/^https?:\/\//i.test(value)) value = `https://${value}`;

  try {
    return new URL(value).origin;
  } catch {
    console.warn(
      `[astro.config] PUBLIC_SITE_URL no es una URL válida (${raw}). ` +
        `Usando ${fallback}. Revísala en Vercel > Settings > Environment Variables.`,
    );
    return fallback;
  }
}

// https://astro.build/config
export default defineConfig({
  output: 'server',
  adapter: vercel(),
  integrations: [react()],
  site: resolveSite(process.env.PUBLIC_SITE_URL),
  vite: {
    plugins: [tailwindcss()],
  },
});
