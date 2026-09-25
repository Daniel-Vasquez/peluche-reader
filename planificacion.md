# Planificación técnica · **Peluche Reader**

> App web de hábito de lectura con gamificación ("Salvando a Peluche").
> Documento de ejecución para una IA desarrolladora. Cada **Tanda** es un paso
> atómico: al terminarla el proyecto debe compilar (`npm run build`) y quedar
> funcional, sin romper lo construido en tandas anteriores.
>
> **Qué tandas están hechas**: la lista con marcas está en
> [`README.md`](./README.md). Este documento describe el destino; el README dice
> por dónde va el camino.
>
> Los bloques de código son los **reales del proyecto**, no bocetos: cada tanda
> se sincronizó con la implementación al terminarla, incluidas las trampas que
> aparecieron al ejecutarla.

---

## 0. Contrato global (leer antes de escribir código)

### 0.1 Stack fijo

| Capa | Decisión | Nota |
|---|---|---|
| Framework | **Astro 7** (`output: 'server'`) | Islands; páginas estáticas con `prerender = true` |
| UI interactiva | **React 19** vía `@astrojs/react` | Solo componentes con estado (timer, refugio, gráficas, forms) |
| Estilos | **Tailwind CSS v4.3** (plugin de Vite) | Tokens en `@theme`, dark mode por clase |
| DB | **MongoDB** con el **driver nativo `mongodb`** | **NO mongoose** — ver 0.2 |
| Auth | **Better Auth** + adaptador MongoDB | Email + password, sin verificación ni reset |
| Gráficas | **Recharts** | Tanda 8 |
| Deploy | **Vercel** (`@astrojs/vercel`) | Runtime Node serverless |

### 0.2 Decisión: driver nativo en vez de mongoose

El adaptador de Mongo de Better Auth recibe una instancia `Db` **del driver
nativo**. Usar mongoose además obligaría a mantener dos pools de conexión en un
entorno serverless (donde las conexiones son el recurso escaso). Por eso:

- Toda la persistencia usa `mongodb` directamente.
- El "esquema" vive en **tipos de TypeScript** (`src/lib/db/types.ts`) + índices
  creados por script (`scripts/db-init.ts`). La validación de entrada la hace
  **Zod** en los endpoints, no la DB.

### 0.3 El nombre del usuario

El nombre se pide **solo al registrarse**. El inicio de sesión sigue siendo
**correo + contraseña** y nada más.

Ese nombre es la **fuente única de personalización** de toda la app: saludos,
títulos de página, el nombre del refugio y los textos de la gamificación.

Reglas en `src/lib/name.ts`, compartidas por el formulario de React y por el hook
de Better Auth del servidor — la validación tiene que ser idéntica en los dos
lados porque cualquiera puede hacer POST a `/api/auth/sign-up/email` sin pasar
por el formulario:

| Función | Qué hace |
|---|---|
| `normalizeName(raw)` | recorta extremos y colapsa espacios internos |
| `checkName(raw)` | normaliza y valida; devuelve el mensaje en español ya listo |
| `firstName(full)` | primera palabra, para saludos cortos ("Hola, Daniel") |

Longitud: `NAME_MIN_LENGTH = 2`, `NAME_MAX_LENGTH = 60`.

Uso: **`firstName()` para saludos** e interpelaciones; **nombre completo** para
títulos con peso ("El refugio de Daniel Vásquez").

### 0.4 Convenciones no negociables

1. **Alias de import**: `@/*` → `src/*` (configurar en `tsconfig.json`).
2. **`dayKey`**: toda fecha de negocio se guarda como `string` `"YYYY-MM-DD"`
   calculada **en la zona horaria del usuario**, nunca con `new Date()` crudo.
   Única fuente de verdad: `src/lib/time.ts`.
3. **`weekKey`**: `"YYYY-Www"` ISO-8601 (semana empieza **lunes**).
4. **Días de la semana**: enteros **1 = lunes … 7 = domingo** (ISO). Nunca el
   `0..6` de `Date.getDay()`; conviértelo siempre en `src/lib/time.ts`.
5. **Duraciones**: se persisten en **segundos** (`number`, entero). Los minutos
   solo existen en la capa de presentación y en el motor de recompensas.
6. **`userId`**: siempre el `id` (string) que emite Better Auth, no un `ObjectId`.
7. **Idempotencia**: cualquier función que otorgue o quite perritos debe poder
   ejecutarse dos veces con el mismo resultado (ver Tanda 6). El cliente puede
   reintentar; el servidor no puede duplicar recompensas.
8. **El servidor manda**: el cronómetro del navegador es solo UI. Los perritos se
   calculan **exclusivamente** en endpoints del servidor.
9. Nada de `any`. `strict: true` en TypeScript. Verifica con `npm run typecheck`
   (`tsc --noEmit`). **`astro check` no se usa**: no soporta TypeScript 7, que es
   la versión que instala el proyecto. Los `.astro` los valida `astro build`.
10. **`paths` sin `baseUrl`**: TypeScript 7 eliminó `baseUrl`, así que el alias se
   declara como `"@/*": ["./src/*"]` (ruta relativa al `tsconfig.json`).
11. **Variables de entorno solo por `@/lib/env`** (`readEnv` / `requireEnv` /
   `readEnvOr`). **Nunca `process.env.X` directo.** Motivo en 0.5.
12. **Nunca muestres el correo donde quepa el nombre.** La personalización usa
   `user.name` (ver 0.3); el correo solo aparece como dato de la cuenta.
13. **El toggle de tema va en TODAS las páginas**, incluidas las públicas
   (`/`, `/login`, `/registro`). Es una función del producto, no un adorno del
   área privada: quien llega por primera vez es justo quien más lo busca. Cada
   layout tiene que montarlo.
14. **Todo mensaje de Zod, en español — y también el del tipo.** Zod emite los
   suyos en inglés. Poner el texto solo en `.min()` / `.max()` no basta: si el
   campo **falta** o llega con **otro tipo**, esos refinamientos no se evalúan y
   responde `"Invalid input: expected string, received undefined"`. El mensaje va
   en el constructor:
   ```ts
   z.string({ message: 'Falta el identificador de la sesión.' }).min(1, '…')
   z.number({ message: 'La meta debe ser un número de minutos.' }).int('…')
   z.array(z.number({ message: '…' }), { message: 'Los días deben venir en una lista.' })
   ```

### 0.5 Las variables de entorno privadas NO están en `process.env`

Esta es la trampa que rompe el proyecto entero si se ignora:

| Contexto | Dónde acaba el `.env` |
|---|---|
| `tsx` (scripts `db:*`) | `process.env`, vía `dotenv` |
| Vercel en producción | `process.env`, vía la plataforma |
| **`astro dev`** | **`import.meta.env` únicamente** |

En desarrollo, Vite carga el `.env` en `import.meta.env` y **deja `process.env`
vacío** para las variables sin prefijo `PUBLIC_`. Un `process.env.MONGODB_URI`
devuelve `undefined` y toda la app responde 500.

Por eso existe `src/lib/env.ts`, que consulta los dos orígenes en orden
(`process.env` primero, porque en Vercel es el autoritativo):

```ts
export function readEnv(name: string): string | undefined {
  for (const source of [procEnv(), metaEnv()]) {
    const value = source?.[name];
    if (value !== undefined && value !== '') return value;
  }
  return undefined;
}
```

`metaEnv()` lee **el objeto completo** `import.meta.env` con acceso dinámico, no
`import.meta.env.MONGODB_URI`: con una clave literal Vite sustituiría el valor en
tiempo de build e incrustaría el secreto en el bundle.

> **No se usa `astro:env`** (que existe en Astro 7 y sería la vía idiomática)
> porque es un módulo virtual que solo resuelve dentro del build de Astro: los
> scripts de `scripts/` no podrían importarlo, y la conexión a Mongo es
> compartida entre los dos mundos.

**Excepción: `astro.config.mjs`.** Ese archivo corre en Node puro antes de que
exista la tubería de Vite, así que **no ve el `.env`**: su
`process.env.PUBLIC_SITE_URL` es `undefined` en local y `site` cae al valor por
defecto. En Vercel sí funciona, porque la plataforma rellena `process.env` en el
build. No se puede usar `@/lib/env` ahí (el alias tampoco existe todavía), así
que el patrón correcto es `process.env.X ?? 'valor-por-defecto'`.

### 0.6 Mapa de archivos final (referencia)

```
reading-app/
├── .env                          # (lo crea el usuario; nunca se commitea)
├── .env.example
├── astro.config.mjs
├── tsconfig.json
├── vitest.config.ts              # alias @/* para los tests
├── package.json
├── planificacion.md              # este documento
├── README.md                     # puesta en marcha + estado de las tandas
├── AGENTS.md                     # convenciones (CLAUDE.md es un symlink a él)
├── public/
│   └── dogs/                     # sprites/ilustraciones del refugio
├── scripts/
│   ├── db-init.ts                # crea índices
│   ├── db-reset.ts               # limpia colecciones (protegido)
│   └── db-seed.ts                # usuario + datos demo
└── src/
    ├── middleware.ts             # inyecta sesión en Astro.locals
    ├── env.d.ts
    ├── styles/global.css
    ├── lib/
    │   ├── auth.ts               # instancia servidor Better Auth
    │   ├── auth-client.ts        # cliente React
    │   ├── api.ts                # helpers de respuesta JSON de los endpoints
    │   ├── env.ts                # lector de variables (process.env + import.meta.env)
    │   ├── name.ts               # reglas del nombre (cliente + servidor)
    │   ├── sessions-view.ts      # forma de la sesión que viaja al navegador
    │   ├── time.ts               # dayKey / weekKey / ISO weekday
    │   ├── db/
    │   │   ├── client.ts         # conexión cacheada
    │   │   ├── collections.ts    # accesores tipados
    │   │   └── types.ts          # tipos de documento
    │   ├── game/
    │   │   ├── config.ts         # constantes de balance (ÚNICA fuente de verdad)
    │   │   ├── rewards.ts        # curva de recompensa (puro)
    │   │   ├── penalties.ts      # penalización + tope semanal (puro)
    │   │   ├── engine.ts         # reducer + reconcile (puro)
    │   │   ├── service.ts        # orquesta engine + MongoDB (impuro)
    │   │   └── __tests__/        # rewards · penalties · engine · invariants
    │   └── repos/
    │       ├── profile.ts
    │       ├── sessions.ts
    │       ├── progress.ts
    │       └── gameState.ts
    ├── components/
    │   ├── ui/
    │   │   ├── Button.tsx        # React: variantes primary / ghost / danger
    │   │   ├── Card.astro        # Astro: cero JS en el cliente
    │   │   └── Stat.astro        # Astro: cifra grande con tono semántico
    │   ├── auth/AuthForm.tsx
    │   ├── auth/SignOutButton.tsx
    │   ├── ThemeToggle.tsx
    │   ├── ScheduleEditor.tsx
    │   ├── ReadingTimer.tsx
    │   ├── Shelter.tsx
    │   └── charts/
    ├── layouts/
    │   ├── BaseLayout.astro
    │   ├── AuthLayout.astro
    │   └── AppLayout.astro
    └── pages/
        ├── index.astro           # landing (prerender)
        ├── login.astro
        ├── registro.astro
        ├── app.astro             # home logueado: timer + refugio
        ├── ajustes.astro
        ├── progreso.astro
        └── api/
            ├── auth/[...all].ts
            ├── profile.ts
            ├── sessions/start.ts
            ├── sessions/heartbeat.ts
            ├── sessions/finish.ts
            └── progress/summary.ts
```

### 0.7 Dependencias y scripts (referencia consolidada)

Versiones verificadas en el proyecto. Cada tanda instala solo lo suyo; esta tabla
es el estado final.

| Paquete | Versión | Tanda | Para qué |
|---|---|---|---|
| `astro` | 7.3.5 | 0 | framework |
| `@astrojs/react` | 7.0.0 | 0 | islas React |
| `@astrojs/vercel` | 11.0.11 | 0 | adaptador de despliegue |
| `react` · `react-dom` | 19.3.0 | 0 | los instala `astro add react` |
| `@types/react` · `@types/react-dom` | 19.3.0 | 0 | idem, como devDependencies |
| `tailwindcss` · `@tailwindcss/vite` | 4.3.3 | 0 | estilos |
| `@types/node` · `tsx` | — | 0 | ejecutar los scripts de `scripts/` |
| `mongodb` | 7.6.0 | 1 | driver nativo |
| `zod` | 4.6.5 | 1 | validación de entrada en los endpoints |
| `dotenv` | 18.0.3 | 1 | `.env` en los scripts (devDependency) |
| `typescript` | 7.0.2 | 1 | `npm run typecheck` (devDependency) |
| `better-auth` | 1.7.6 | 2 | autenticación |
| `@better-auth/mongo-adapter` | 1.7.6 | 2 | **hay que instalarlo aparte** (ver Tanda 2) |
| `clsx` | 2.1.1 | 3 | composición de clases |
| `lucide-react` | 1.48.0 | 3 | iconos |
| `vitest` | 5.0.1 | 6 | tests del motor de gamificación |
| `recharts` | — | 8 | gráficas |

**`@astrojs/check` no se instala**: no soporta TypeScript 7. Los `.ts`/`.tsx` los
valida `npm run typecheck` y los `.astro`, `astro build`.

| Script | Qué hace |
|---|---|
| `npm run dev` | servidor de desarrollo (`astro dev --background` para dejarlo en segundo plano) |
| `npm run build` | build de producción en `.vercel/output` |
| `npm run preview` | previsualiza el build |
| `npm run typecheck` | `tsc --noEmit` sobre todo el proyecto |
| `npm run db:init` | crea los 7 índices (idempotente) |
| `npm run db:reset` | vacía las colecciones; exige `ALLOW_DB_RESET=yes` |
| `npm run db:seed` | datos de demostración (Tanda 9) |
| `npm test` | Vitest (Tanda 6) |

---

# TANDA 0 · Scaffolding del proyecto

### Objetivo
Dejar un proyecto Astro + React + Tailwind v4 que arranca en `localhost:4321`,
compila para Vercel y tiene la paleta de diseño definida como tokens CSS.
**Sin DB, sin auth todavía.**

### Dependencias a instalar
```bash
npm create astro@latest . -- --template minimal --typescript strict \
  --no-install --no-git --skip-houston --yes
npm install
npx astro add react vercel --yes
npx astro add tailwind --yes
npm install -D @types/node tsx
```

> ⚠️ `create-astro` **no escribe en un directorio no vacío**: crea un subdirectorio
> con nombre aleatorio. Si ya existen `.env.example` / `planificacion.md`, mueve el
> contenido del subdirectorio a la raíz y bórralo.
>
> Versiones instaladas (verificadas): `astro@7.3.5`, `@astrojs/react@7.0.0`,
> `@astrojs/vercel@11.0.11`, `react@19.3.0`, `tailwindcss@4.3.3`.

### Archivos a crear / modificar

**`astro.config.mjs`**
```js
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import vercel from '@astrojs/vercel';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  output: 'server',
  adapter: vercel(),
  integrations: [react()],
  site: process.env.PUBLIC_SITE_URL ?? 'http://localhost:4321',
  vite: { plugins: [tailwindcss()] },
});
```

**`tsconfig.json`** (añadir sobre `astro/tsconfigs/strict`)
```json
{
  "extends": "astro/tsconfigs/strict",
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "react",
    "baseUrl": ".",
    "paths": { "@/*": ["src/*"] }
  }
}
```

**`src/styles/global.css`** — sistema de diseño completo.
> Paleta light: base `#fafafa` / `#eaedf2`, primario `#0d9488`,
> acentos puntuales `#0284c7` (info/datos) y `#e9437c` (alerta emocional: pérdida
> de perritos). Regla de uso: `#e9437c` **solo** para penalizaciones y estados
> críticos; nunca para navegación ni botones primarios.

**Cada color de marca necesita DOS tokens.** Un mismo tono no puede cumplir AA en
texto pequeño y seguir siendo el color de identidad en gráficos: `#0d9488` sobre
blanco da 3.74:1, por debajo del 4.5:1 que exige el texto normal. Y en tema
oscuro el relleno es un teal claro, donde una etiqueta blanca da 2.49:1.

| Token | Para qué | Claro | Oscuro |
|---|---|---|---|
| `--color-primary` | relleno de botones y **texto pequeño** | `#0f766e` | `#14b8a6` |
| `--color-primary-hover` | relleno en hover | `#0b6b62` | `#2dd4bf` |
| `--color-primary-bright` | teal de marca: **cifras grandes** y gráficos | `#0d9488` | `#2dd4bf` |
| `--color-primary-soft` | tinte de chip / fondo suave | `#edfbf8` | `#0f2b2a` |
| `--color-on-primary` | etiqueta sobre el relleno primary | `#ffffff` | `#0b1120` |
| `--color-accent` | cifras grandes y series de gráficas | `#0284c7` | `#38bdf8` |
| `--color-accent-text` | enlaces y **texto pequeño** | `#0369a1` | `#7dd3fc` |
| `--color-alert` | cifras grandes y marcas de pérdida | `#e9437c` | `#f472a3` |
| `--color-alert-text` | mensajes de error, **texto pequeño** | `#c02258` | `#fda4c4` |

> **El hover oscurece en claro y aclara en oscuro.** Si el hover aclarase en los
> dos, en tema claro la etiqueta blanca caería a 3.74:1: WCAG aplica a todos los
> estados, no solo al de reposo.

Contraste verificado (texto pequeño ≥ 4.5:1, cifras ≥ 24 px ≥ 3:1):

```
                            CLARO    OSCURO
texto normal sobre tarjeta  16.40    14.51
texto suave sobre tarjeta    5.83     6.73
primary texto sobre tarjeta  5.47     6.98
etiqueta en botón primary    5.47     7.56
etiqueta en botón (hover)    6.38    10.12
accent-text sobre tarjeta    5.93    10.42
alert-text sobre tarjeta     5.82     9.33
cifra primary-bright         3.74     9.33
cifra accent                 4.10     8.11
cifra alert                  3.78     6.44
```

```css
@import "tailwindcss";

/* Dark mode por clase en <html>, no por media query: el usuario manda sobre el SO. */
@custom-variant dark (&:where(.dark, .dark *));

@theme {
  --color-base: #fafafa;  --color-surface: #ffffff;
  --color-muted: #eaedf2; --color-border: #dfe3ea;
  --color-text: #16202e;  --color-text-soft: #5b6675;

  --color-primary: #0f766e;        --color-primary-hover: #0b6b62;
  --color-primary-bright: #0d9488; --color-primary-soft: #edfbf8;
  --color-on-primary: #ffffff;

  --color-accent: #0284c7;  --color-accent-text: #0369a1;
  --color-alert: #e9437c;   --color-alert-text: #c02258;

  --radius-card: 14px;
  --font-sans: "Inter", ui-sans-serif, system-ui, sans-serif;
}

/* Tema oscuro: mismos nombres, otros valores. */
.dark {
  --color-base: #0b1120;  --color-surface: #131a2a;
  --color-muted: #1b2436; --color-border: #26314a;
  --color-text: #e6ebf3;  --color-text-soft: #96a2b5;

  --color-primary: #14b8a6;        --color-primary-hover: #2dd4bf;
  --color-primary-bright: #2dd4bf; --color-primary-soft: #0f2b2a;
  --color-on-primary: #0b1120;     /* blanco daría 2.49:1 */

  --color-accent: #38bdf8;  --color-accent-text: #7dd3fc;
  --color-alert: #f472a3;   --color-alert-text: #fda4c4;
}

:root      { color-scheme: light; }
:root.dark { color-scheme: dark; }
```

`@layer base` fija además `body { background-color; color }`, el
`:focus-visible` con anillo `--color-primary`, y un bloque
`@media (prefers-reduced-motion: reduce)` que anula animaciones y transiciones.

**`src/layouts/BaseLayout.astro`** — `<html lang="es">`, importa `global.css`,
y un script **inline y bloqueante** en `<head>` para aplicar el tema antes del
primer pintado:
```astro
<script is:inline>
  const t = localStorage.getItem('theme');
  const dark = t === 'dark' || (!t && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
</script>
```

**`src/pages/index.astro`** — landing con `export const prerender = false;`.

**No se prerenderiza a propósito.** La landing tiene que saber si ya hay sesión:
ofrecer "Crear cuenta" a alguien que ya entró desorienta, y dejarle sin salida
—ni toggle de tema ni cerrar sesión— desde la primera pantalla de la app es peor.
Con sesión muestra "Seguir leyendo, {nombre}", "Ver mi progreso" y el botón de
salir. El coste de renderizarla en servidor es mínimo: no consulta la base de
datos, solo lee `Astro.locals.user`, que el middleware ya resolvió.

> Recuerda que el middleware **cortocircuita en `context.isPrerendered`**: una
> página prerenderizada siempre tiene `Astro.locals.user === null`, así que no
> puede reaccionar a la sesión ni con un truco.

**`.gitignore`** — añadir `.env`, `.vercel`, `node_modules`, `dist`.

**`package.json`** — añadir scripts (los archivos llegan en la Tanda 1):
```json
"scripts": {
  "dev": "astro dev",
  "build": "astro build",
  "preview": "astro preview",
  "db:init":  "tsx scripts/db-init.ts",
  "db:reset": "tsx scripts/db-reset.ts",
  "db:seed":  "tsx scripts/db-seed.ts"
}
```

### Qué necesito de tu lado
1. Copiar `.env.example` a `.env` y rellenar `MONGODB_URI` y `MONGODB_DB_NAME`
   (aún no se usan, pero evita rehacerlo después).
2. Ejecutar `npm run dev` y confirmar que carga `http://localhost:4321`.

### Criterio de aceptación
- `npm run build` termina sin errores.
- Alternar `.dark` a mano en el `<html>` desde DevTools cambia toda la paleta.

---

# TANDA 1 · Capa de datos (MongoDB)

### Objetivo
Conexión cacheada (segura en serverless), tipos de documento, accesores tipados
e índices. Incluye los scripts de `init`, `reset` y `seed`.

### Dependencias
```bash
npm install mongodb zod
npm install -D dotenv typescript
```

> Versiones instaladas (verificadas): `mongodb@7.6.0`, `zod@4.6.5`,
> `dotenv@18.0.3`, `typescript@7.0.2`.

### Archivos

**`src/lib/db/client.ts`** — conexión cacheada en el ámbito global. En Vercel
cada invocación puede reutilizar el proceso y en desarrollo el hot-reload
reevalúa los módulos: sin esta caché se abriría un pool nuevo cada vez y Atlas
agotaría su límite de conexiones.

Exporta `getMongoClient()`, `getDb()` y `closeMongoClient()`.

**La conexión es perezosa**, no se valida en el tope del módulo: así importar el
archivo nunca falla durante `astro build`, donde las variables de entorno pueden
no estar disponibles. El error salta en el primer uso real, con un mensaje que
apunta a `.env.example`.

```ts
const GLOBAL_KEY = '__readingAppMongoClient__';

export function getMongoClient(): Promise<MongoClient> {
  const g = globalThis as GlobalWithMongo;
  if (!g[GLOBAL_KEY]) {
    const client = new MongoClient(requireEnv('MONGODB_URI'), {
      maxPoolSize: 10,
      minPoolSize: 0,
      serverSelectionTimeoutMS: 8_000,
      maxIdleTimeMS: 60_000,   // en serverless nadie usa las conexiones ociosas
    });
    g[GLOBAL_KEY] = client.connect();
  }
  return g[GLOBAL_KEY];
}
```

`closeMongoClient()` es **solo para scripts**: si se llamara dentro de una
petición, la siguiente tendría que reconectar desde cero. Los tres scripts la
invocan en un `.finally()` para que el proceso termine.

**`src/lib/time.ts`** — única fuente de verdad temporal. API completa:

| Función | Para qué |
|---|---|
| `dayKey(date, tz)` | `"YYYY-MM-DD"` en la zona del usuario (vía `en-CA`, cuyo formato corto ya es ISO) |
| `isoWeekday(date, tz)` | 1..7 de un instante, en la zona del usuario |
| `isoWeekdayOfDayKey(key)` | 1..7 de un `dayKey` (no necesita zona) |
| `parseDayKey(key)` | `dayKey` → `Date` **a mediodía UTC**, inmune a desplazamientos de ±12 h |
| `addDays(key, n)` / `diffDays(from, to)` | aritmética de días |
| `weekKeyFromDayKey(key)` | `"YYYY-Www"` ISO-8601 |
| `startOfWeekDayKey(key)` | `dayKey` del lunes de esa semana |
| `dayKeysBetween(from, to)` | rango, `from` exclusivo y `to` inclusive (base de la reconciliación) |
| `lastNDayKeys(endKey, n)` | series de los gráficos, sin huecos |
| `formatDuration(seconds)` | `"MM:SS"` o `"H:MM:SS"` |
| `isValidTimezone(tz)` | validación para el endpoint de perfil |
| `WEEKDAY_LABELS` | etiquetas `L M X J V S D` para los chips de la Tanda 4 |

> `parseDayKey` interpreta a **mediodía** UTC a propósito: a medianoche, cualquier
> operación que reste horas movería la fecha al día anterior.
```ts
/** "YYYY-MM-DD" en la zona horaria del usuario. */
export function dayKey(date: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date); // en-CA ya produce YYYY-MM-DD
}

/** 1=lunes … 7=domingo, en la zona horaria del usuario. */
export function isoWeekday(date: Date, tz: string): number {
  const name = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' })
    .format(date);
  return { Mon:1, Tue:2, Wed:3, Thu:4, Fri:5, Sat:6, Sun:7 }[name as 'Mon']!;
}

/** "YYYY-Www" ISO-8601 a partir de un dayKey. */
export function weekKeyFromDayKey(k: string): string {
  const [y, m, d] = k.split('-').map(Number);
  const t = Date.UTC(y, m - 1, d);
  const dt = new Date(t);
  const wd = (dt.getUTCDay() + 6) % 7;            // 0=lunes
  dt.setUTCDate(dt.getUTCDate() - wd + 3);        // jueves de esa semana
  const jan4 = new Date(Date.UTC(dt.getUTCFullYear(), 0, 4));
  const jan4wd = (jan4.getUTCDay() + 6) % 7;
  const week = 1 + Math.round(((dt.getTime() - jan4.getTime()) / 86400000 - 3 + jan4wd) / 7);
  return `${dt.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** dayKeys desde `from` (exclusivo) hasta `to` (inclusive). Para reconciliar. */
export function dayKeysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  const cur = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (cur < end) {
    cur.setUTCDate(cur.getUTCDate() + 1);
    out.push(cur.toISOString().slice(0, 10));
  }
  return out;
}
export const addDays = (k: string, n: number) =>
  new Date(new Date(`${k}T00:00:00Z`).getTime() + n * 86400000).toISOString().slice(0, 10);
```

**`src/lib/db/types.ts`**
```ts
export type DayOutcome = 'pending' | 'completed' | 'missed' | 'rest';

// Ningún tipo incluye `_id`: usa `WithId<T>` del driver donde lo necesites.

export interface ProfileDoc {
  userId: string;
  timezone: string;            // IANA, ej. "America/Bogota"
  scheduledDays: number[];     // ISO 1..7, ej. [1,2,3,4,5]
  dailyGoalMinutes: number;    // meta personal, default 10
  currentBookTitle: string | null;
  onboardedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ReadingSessionDoc {
  userId: string;
  dayKey: string;
  bookTitle: string | null;
  status: 'running' | 'paused' | 'completed' | 'abandoned';
  startedAt: Date;
  lastResumedAt: Date | null;  // null si está en pausa
  accumulatedSeconds: number;  // tiempo consolidado (sin el tramo en curso)
  endedAt: Date | null;
  durationSeconds: number;     // definitivo al completar
  settledAt: Date | null;      // marca de liquidación: impide pagar dos veces
  createdAt: Date;
  updatedAt: Date;
}

export interface DailyProgressDoc {
  userId: string;
  dayKey: string;
  weekKey: string;
  scheduled: boolean;          // ¿era un día comprometido?
  totalSeconds: number;
  sessionsCount: number;
  dogsAwarded: number;         // total ya otorgado por este día (idempotencia)
  outcome: DayOutcome;
  updatedAt: Date;
}

export interface GameStateDoc {
  userId: string;
  dogs: number;                // perritos vivos en el refugio
  capacity: number;            // aforo actual del refugio
  adopted: number;             // score histórico (desbordes del refugio)
  weekKey: string;             // semana en curso
  weekStartDogs: number;       // perritos al abrir la semana (base del tope)
  weekLosses: number;          // perritos perdidos esta semana
  lastReconciledDay: string;   // último dayKey ya evaluado
  streak: number;
  bestStreak: number;
  updatedAt: Date;
}

export interface GameEventDoc {
  userId: string;
  dayKey: string;
  type: 'reward' | 'penalty' | 'week_rollover' | 'adoption';
  delta: number;               // + gana, − pierde
  reason: string;              // "25 min de lectura", "día programado sin leer"
  dogsAfter: number;
  createdAt: Date;
}
```

**`src/lib/db/collections.ts`**
```ts
import { getDb } from './client';
import type { ProfileDoc, ReadingSessionDoc, DailyProgressDoc, GameStateDoc, GameEventDoc } from './types';

export const col = {
  profiles:      async () => (await getDb()).collection<ProfileDoc>('profiles'),
  sessions:      async () => (await getDb()).collection<ReadingSessionDoc>('readingSessions'),
  dailyProgress: async () => (await getDb()).collection<DailyProgressDoc>('dailyProgress'),
  gameState:     async () => (await getDb()).collection<GameStateDoc>('gameState'),
  gameEvents:    async () => (await getDb()).collection<GameEventDoc>('gameEvents'),
};
```

**`scripts/db-init.ts`** — índices (idempotente, se puede correr N veces):
```ts
import 'dotenv/config';
import { getDb, getMongoClient } from '../src/lib/db/client';

const db = await getDb();
await db.collection('profiles').createIndex({ userId: 1 }, { unique: true });
await db.collection('gameState').createIndex({ userId: 1 }, { unique: true });
await db.collection('dailyProgress').createIndex({ userId: 1, dayKey: 1 }, { unique: true });
await db.collection('dailyProgress').createIndex({ userId: 1, weekKey: 1 });
await db.collection('readingSessions').createIndex({ userId: 1, dayKey: 1 });
await db.collection('readingSessions').createIndex({ userId: 1, status: 1 });
await db.collection('gameEvents').createIndex({ userId: 1, createdAt: -1 });
console.log('Índices creados.');
await (await getMongoClient()).close();
```
> El índice único `(userId, dayKey)` en `dailyProgress` es lo que hace seguro el
> `upsert` de la Tanda 7 frente a peticiones concurrentes.

**`scripts/db-reset.ts`** — vacía `profiles`, `readingSessions`, `dailyProgress`,
`gameState`, `gameEvents` (constante `APP_COLLECTIONS`) y `user`, `session`,
`account`, `verification` (constante `BETTER_AUTH_COLLECTIONS`, ambas exportadas
desde `db/types.ts`).

- **Aborta** si `process.env.ALLOW_DB_RESET !== 'yes'` e imprime el nombre de la
  base de datos antes de tocar nada.
- Usa `deleteMany({})`, **no `drop()`**: así conserva los índices creados por
  `db:init` y no hay que volver a ejecutarlo tras cada limpieza.

**`scripts/db-seed.ts`** — placeholder por ahora; se completa en la Tanda 9.

### Qué necesito de tu lado
1. `MONGODB_URI` y `MONGODB_DB_NAME` ya en `.env`.
2. En Atlas → **Network Access** → permitir `0.0.0.0/0` (Vercel no tiene IP fija).
3. Ejecutar `npm run db:init` y pegarme la salida.

### Criterio de aceptación
- `npm run db:init` lista los 7 índices y el proceso termina solo (sin `Ctrl+C`:
  prueba de que `closeMongoClient()` funciona).
- `npm run db:reset` **sin** `ALLOW_DB_RESET=yes` se niega a borrar.
- `npm run typecheck` sin errores.

---

# TANDA 2 · Autenticación (Better Auth)

### Objetivo
Registro y login con **email + password**, sesión persistente por cookie, rutas
protegidas mediante middleware. **Sin** verificación de email, **sin** 2FA,
**sin** recuperación de contraseña.

### Dependencias
```bash
npm install better-auth @better-auth/mongo-adapter
```

> Versiones instaladas (verificadas): `better-auth@1.7.6`,
> `@better-auth/mongo-adapter@1.7.6`.

### El adaptador hay que instalarlo aparte

`better-auth/adapters/mongodb` es **solo un re-export** de
`@better-auth/mongo-adapter`, que **no** se instala como dependencia transitiva:

```
// node_modules/better-auth/dist/adapters/mongodb-adapter/index.d.mts
export * from "@better-auth/mongo-adapter";
```

Sin instalarlo, el import falla en tiempo de ejecución. Se importa desde el
re-export del core (no desde el paquete directo, que sería una dependencia
implícita):

```ts
import { mongodbAdapter } from 'better-auth/adapters/mongodb';
```

Firma real: `mongodbAdapter(db: Db, config?: { client?, transaction?, usePlural?, debugLogs? })`.
**Pasar `client` habilita las transacciones**, que Atlas soporta al ser un
replica set. En un MongoDB standalone habría que poner `transaction: false`.

### Archivos

**`src/lib/auth.ts`** — instancia **perezosa y cacheada**, no `export const auth`.

`betterAuth()` necesita un `Db` ya conectado, así que un `await getDb()` en el
tope del módulo abriría una conexión a Mongo durante `astro build` (Astro carga
el entrypoint del servidor para prerenderizar). Con `getAuth()` la conexión solo
ocurre al atender la primera petición real; el prerender del build tarda ~150 ms
en vez de esperar a Atlas.

```ts
async function createAuth() {
  const [db, client] = await Promise.all([getDb(), getMongoClient()]);
  const secret = requireEnv('BETTER_AUTH_SECRET');
  const vercelUrl = readEnv('VERCEL_URL');

  return betterAuth({
    database: mongodbAdapter(db, { client }),   // `client` → transacciones
    secret,
    baseURL: readEnvOr('BETTER_AUTH_URL', 'http://localhost:4321'),

    emailAndPassword: {
      enabled: true,
      autoSignIn: true,              // tras registrarse, la sesión ya está abierta
      requireEmailVerification: false,
      minPasswordLength: 8,
    },
    session: {
      expiresIn: 60 * 60 * 24 * 30,  // 30 días
      updateAge: 60 * 60 * 24,       // refresca la cookie 1 vez al día como máximo
      // Evita un viaje a Mongo en cada request del middleware, que corre en
      // TODAS las rutas.
      cookieCache: { enabled: true, maxAge: 5 * 60 },
    },
    advanced: {
      defaultCookieAttributes: {
        sameSite: 'lax',
        secure: readEnv('NODE_ENV') === 'production',
      },
    },
    // Los previews de Vercel tienen un dominio distinto en cada build.
    trustedOrigins: vercelUrl ? [`https://${vercelUrl}`] : [],
  });
}

const GLOBAL_KEY = '__readingAppAuth__';

export function getAuth(): ReturnType<typeof createAuth> {
  const g = globalThis as GlobalWithAuth;
  if (!g[GLOBAL_KEY]) g[GLOBAL_KEY] = createAuth();
  return g[GLOBAL_KEY];
}

export type Auth = Awaited<ReturnType<typeof createAuth>>;
export type Session = Auth['$Infer']['Session'];
export type SessionUser = Session['user'];
```

Solo hay **dos** puntos de uso, así que el `await getAuth()` no molesta: el
middleware y la ruta `/api/auth/[...all].ts`.

**`src/lib/auth-client.ts`**
```ts
import { createAuthClient } from 'better-auth/react';

export const authClient = createAuthClient({
  baseURL: import.meta.env.PUBLIC_BETTER_AUTH_URL,
});
export const { signIn, signUp, signOut, useSession } = authClient;
```

**`src/pages/api/auth/[...all].ts`**
```ts
import type { APIRoute } from 'astro';
import { getAuth } from '@/lib/auth';

export const prerender = false;
export const ALL: APIRoute = async ({ request }) => {
  const auth = await getAuth();
  return auth.handler(request);
};
```

**`src/middleware.ts`** — resuelve la sesión una vez por request y protege rutas.

Dos cortocircuitos **obligatorios** antes de tocar la sesión:

1. **`context.isPrerendered`** → las rutas prerenderizadas se generan en
   `astro build`, cuando no existe petición ni usuario. Sin este guard, el build
   abriría una conexión a MongoDB.
2. **`/api/auth/*`** → el handler de Better Auth gestiona sus propias cookies;
   pedirle la sesión aquí sería trabajo duplicado en cada login.

```ts
export const onRequest = defineMiddleware(async (context, next) => {
  if (context.isPrerendered) {
    context.locals.user = null;
    context.locals.session = null;
    return next();
  }

  const path = context.url.pathname;
  if (path.startsWith('/api/auth/')) {
    context.locals.user = null;
    context.locals.session = null;
    return next();
  }

  const auth = await getAuth();
  const data = await auth.api.getSession({ headers: context.request.headers });
  context.locals.user = data?.user ?? null;
  context.locals.session = data?.session ?? null;

  if (!context.locals.user && PROTECTED_PREFIXES.some((p) => path.startsWith(p))) {
    return context.redirect(`/login?next=${encodeURIComponent(path)}`, 302);
  }
  if (context.locals.user && GUEST_ONLY_PATHS.includes(path)) {
    return context.redirect('/app', 302);
  }
  return next();
});
```

**`src/env.d.ts`** — los tipos de `Locals` se derivan de Better Auth, no se
escriben a mano. Como el archivo tiene `import`, es un módulo: el namespace `App`
tiene que ir dentro de `declare global` o TypeScript no lo verá.

```ts
/// <reference types="astro/client" />
import type { SessionUser, Session } from '@/lib/auth';

declare global {
  namespace App {
    interface Locals {
      user: SessionUser | null;
      session: Session['session'] | null;
    }
  }
}
```

**`src/components/auth/AuthForm.tsx`** — un único componente React con prop
`mode: 'login' | 'register'`:
- Campos: **`name` (solo en registro, obligatorio y primero del formulario)**,
  email y password. En login **no hay campo de nombre**.
- El nombre se valida con `checkName()` de `@/lib/name` antes de enviar, y el
  servidor lo revalida en `databaseHooks.user.create.before`:

  ```ts
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          const result = checkName(String(user.name ?? ''));
          if (!result.ok) throw new APIError('BAD_REQUEST', { message: result.error });
          return { data: { ...user, name: result.name } };
        },
      },
    },
  }
  ```

  `APIError` se importa de `better-auth/api`. El hook además **normaliza**:
  `"  Daniel   Vásquez  "` se guarda como `"Daniel Vásquez"`.
- `signUp.email({ email, password, name })` / `signIn.email({ email, password })`.
- Errores en español mapeados por **código**, no por mensaje. Los códigos reales
  están en `@better-auth/core/dist/error/codes.mjs`. Verificados contra el
  servidor:

  | Escenario | Código devuelto | HTTP |
  |---|---|---|
  | Contraseña incorrecta | `INVALID_EMAIL_OR_PASSWORD` | 401 |
  | Correo ya registrado | `USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL` | 422 |
  | Contraseña < 8 caracteres | `PASSWORD_TOO_SHORT` | 400 |

  > Ojo: en el registro duplicado Better Auth devuelve la variante
  > `..._USE_ANOTHER_EMAIL`, no `USER_ALREADY_EXISTS`. Mapea **las dos**.
- Al éxito: `window.location.href = next ?? '/app'` (recarga completa para que el
  middleware vea la cookie nueva).
- Se monta con `client:load`.

**Páginas** `src/pages/login.astro`, `src/pages/registro.astro`, y
`src/pages/app.astro` (por ahora solo saluda al usuario y tiene botón de
`signOut`).

### Qué necesito de tu lado
1. Generar el secreto: `openssl rand -base64 32` → pegarlo en `BETTER_AUTH_SECRET`.
2. Confirmar que `BETTER_AUTH_URL` y `PUBLIC_BETTER_AUTH_URL` valen
   `http://localhost:4321` en local.
3. Si la DB tiene datos previos de pruebas: `ALLOW_DB_RESET=yes npm run db:reset`.

### Criterio de aceptación
- Registrarse crea documentos en `user`, `account` (con hash de contraseña) y
  `session`.
- La cookie `better-auth.session_token` sale con `Max-Age=2592000` (30 días),
  `HttpOnly` y `SameSite=Lax`: es **persistente**, no de sesión de navegador.
- `/app`, `/progreso` y `/ajustes` sin sesión → 302 a `/login?next=…`.
- `/login` y `/registro` **con** sesión → 302 a `/app`.
- `npm run build` prerenderiza en milisegundos (prueba de que el guard
  `isPrerendered` evita conectar a Mongo en el build).
- `/registro` pide nombre, correo y contraseña; `/login` **solo** correo y
  contraseña.
- Un POST directo a `sign-up/email` con `name: "   "` o `"D"` devuelve 400 con el
  mensaje en español: la validación no depende del formulario.
- El nombre guardado aparece en el saludo (`firstName`) y en el título.

> **Si pruebas con `curl`**: Astro trae su propia protección CSRF y rechaza todo
> POST sin cabecera `Origin` con *"Cross-site POST form submissions are
> forbidden"*. Añade `-H "Origin: http://localhost:4321"` y, en `sign-out`, un
> cuerpo `-d '{}'`. Un navegador manda ambas cosas solo; no es un bug.

---

# TANDA 3 · Shell de la app, tema claro/oscuro y sistema visual

### Objetivo
Layout autenticado reutilizable, navegación, y el toggle Light/Dark persistente.
Todo lo visual posterior se construye sobre estas piezas.

### Dependencias
```bash
npm install clsx lucide-react
```

> Versiones instaladas (verificadas): `clsx@2.1.1`, `lucide-react@1.48.0`.

### Archivos

**`src/components/ThemeToggle.tsx`** (React, `client:load`)

El estado inicial ya lo fija el script `is:inline` de la Tanda 0; el `useEffect`
solo **lee** lo aplicado. Escribir la clase durante el render provocaría el
parpadeo que ese script evita.

Además escucha `prefers-color-scheme` en vivo, pero **solo mientras no haya
elección guardada**: en cuanto el usuario pulsa, su decisión manda para siempre.

```tsx
useEffect(() => {
  setIsDark(document.documentElement.classList.contains('dark'));

  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const onSystemChange = (event: MediaQueryListEvent) => {
    if (localStorage.getItem(STORAGE_KEY)) return; // elección explícita: no tocar
    document.documentElement.classList.toggle('dark', event.matches);
    setIsDark(event.matches);
  };
  media.addEventListener('change', onSystemChange);
  return () => media.removeEventListener('change', onSystemChange);
}, []);
```

Accesibilidad: `aria-pressed={isDark}` y un `aria-label` que describe la acción
("Cambiar a tema claro"), no el estado.

**El toggle se monta en los tres layouts**, no solo en el privado:

| Layout | Páginas | Qué lleva la cabecera |
|---|---|---|
| `BaseLayout` | — | solo el `<script is:inline>` del tema |
| `AuthLayout` | `/login`, `/registro` | logo + `ThemeToggle` |
| `AppLayout` | `/app`, `/progreso`, `/ajustes` | logo + nav + `ThemeToggle` + `SignOutButton` |
| `index.astro` | `/` | logo + `ThemeToggle` + `SignOutButton` si hay sesión |

**`src/layouts/AppLayout.astro`** — props `title`, `heading?`, `subheading?`.
Exige `Astro.locals.user` (el middleware ya lo garantiza) y pinta:

- Header con logo, nav (`/app` "Hoy", `/progreso` "Progreso", `/ajustes`
  "Ajustes"), `<ThemeToggle client:load />` y `<SignOutButton client:load />`.
- La página activa se marca con **`aria-current="page"`** además del color: el
  estado no puede comunicarse solo por color.
- `<main class="mx-auto w-full max-w-3xl grow px-6 py-10">` con el `<h1>` y el
  `<slot />`.
- El título del documento se compone como `` `${title} · ${firstName(user.name)}` ``.

**Crea también los marcadores de `/progreso` y `/ajustes`**: la navegación apunta
a ellos y sin las páginas daría 404. Cada uno con `AppLayout` + una `Card` que
diga en qué tanda llega su contenido.

`src/lib/game/preview.ts` mantiene las cifras que la interfaz ya menciona
(7 perritos, 10 min, −1) para no incrustar números sueltos en el marcado. **Se
borra en la Tanda 6**, cuando `game/config.ts` pase a ser la fuente de verdad:
busca `GAME_PREVIEW` y sustituye cada uso por la constante de `GAME`.

**Primitivas** — React solo donde hay interacción; lo demás, componentes Astro
(cero JavaScript en el cliente):

| Archivo | Tipo | Notas |
|---|---|---|
| `components/ui/Button.tsx` | React | variantes `primary` / `ghost` / `danger`, tamaños `sm` / `md` |
| `components/ui/Card.astro` | Astro | `rounded-card border border-border bg-surface` |
| `components/ui/Stat.astro` | Astro | cifra de 24 px con tono `neutral` / `primary` / `accent` / `alert` |

`Button` usa `text-on-primary` (nunca `text-white`) y `hover:bg-primary-hover`.
`Stat` usa `text-primary-bright` para el tono `primary`: su cifra es texto grande,
donde el teal de marca sí cumple el umbral de 3:1.

Refactoriza `AuthForm` y `SignOutButton` para que usen `Button` en vez de clases
sueltas: es el momento de unificar, antes de que existan más formularios.

> **Sobre los modificadores de opacidad** (`bg-alert/10`): Tailwind v4 emite dos
> reglas, un hex de respaldo y una `color-mix(… var(--color-alert) …)` dentro de
> un `@supports`. La segunda gana en cualquier navegador actual, así que **sí
> siguen el tema**. Solo un navegador sin `color-mix` se quedaría con el tinte
> del tema claro; es una degradación aceptable.

### Reglas de diseño (aplican a todas las tandas siguientes)
- Fondo de página `bg-base`; tarjetas `bg-surface`; separadores `border-border`.
- **Significado del color**: `primary` = acción, `accent` = información y series
  de datos, `alert` = pérdida o riesgo. Máximo **un** elemento en rosa por
  pantalla.
- **Texto pequeño → tokens `-text`** (`text-alert-text`, `text-accent-text`).
  **Cifras grandes y gráficos → tokens de marca** (`text-primary-bright`,
  `text-accent`, `text-alert`). Confundirlos rompe AA.
- Nunca `text-white` sobre un relleno de marca: usa `text-on-primary`.
- Cero degradados llamativos, cero sombras fuertes: el contenido manda.
- Tipografía de una sola familia, jerarquía por peso y tamaño.

### Qué necesito de tu lado
Nada. Opcional: si quieres otra tipografía distinta a Inter, dímelo ahora.

### Criterio de aceptación
- El toggle cambia el tema, sobrevive a un F5 y no produce parpadeo al cargar.
- `/app`, `/progreso` y `/ajustes` responden 200 y marcan su enlace de nav con
  `aria-current="page"`.
- Ninguna utilidad de color resuelve a un hex fijo en el CSS generado (salvo los
  respaldos de `@supports`): todas deben referenciar `var(--color-…)`, o el tema
  oscuro no las alcanzará.
- Todos los pares de contraste cumplen AA en los dos temas.

---

# TANDA 4 · Perfil y días comprometidos

### Objetivo
Que el usuario elija **qué días de la semana** se compromete a leer, su zona
horaria y su libro actual. Se crea el `ProfileDoc` y el `GameStateDoc` inicial.

### Dependencias
Ninguna nueva (usa `zod` de la Tanda 1).

### Archivos

**`src/lib/repos/profile.ts`** — exporta `ensureProfile`, `updateProfile`,
`PROFILE_DEFAULTS`, `GOAL_OPTIONS` y `defaultTimezone()`.

`ensureProfile` usa `$setOnInsert` + `upsert` en **una sola** operación: dos
peticiones simultáneas (dos pestañas abriendo `/app`) no pueden crear dos
perfiles, porque el índice único en `userId` lo impide. **Verificado**: 10
peticiones en paralelo a `GET /api/profile` dejan exactamente 1 documento.

```ts
export const PROFILE_DEFAULTS = {
  scheduledDays: [1, 2, 3, 4, 5] as IsoWeekday[],  // L–V, el compromiso típico
  dailyGoalMinutes: 10,
} as const;

/** Metas de la interfaz: coinciden con los escalones de recompensa. */
export const GOAL_OPTIONS = [10, 15, 20, 25, 30] as const;

/** La zona por defecto sale de PUBLIC_DEFAULT_TIMEZONE, validada. */
export function defaultTimezone(): string {
  const fromEnv = readEnvOr('PUBLIC_DEFAULT_TIMEZONE', 'America/Bogota');
  return isValidTimezone(fromEnv) ? fromEnv : 'UTC';
}
```

**`updateProfile` es lo que cierra el onboarding**: si `onboardedAt` es `null`,
lo pone en el primer guardado. Hasta entonces `/app` redirige a `/ajustes`,
porque sin días comprometidos la gamificación no puede penalizar ni recompensar
nada.

**`src/pages/api/profile.ts`** — `GET` devuelve el perfil; `PATCH` lo actualiza.
Ambos responden `401 {"error":"No autenticado."}` sin sesión.

**Todos los mensajes de Zod van en español, también los de límites.** Zod los
emite en inglés por defecto (`"Too small: expected number to be >=1"`), así que
hay que pasarlos explícitamente en cada `.min()` / `.max()` / `.int()`:

```ts
const PatchSchema = z.object({
  scheduledDays: z
    .array(
      z.number()
        .int('Los días deben ser números enteros.')
        .min(1, 'Día de la semana inválido: debe estar entre 1 (lunes) y 7 (domingo).')
        .max(7, 'Día de la semana inválido: debe estar entre 1 (lunes) y 7 (domingo).'),
    )
    .min(1, 'Elige al menos un día de la semana.')
    .max(7)
    .transform((days) => [...new Set(days)].sort((a, b) => a - b) as IsoWeekday[])
    .optional(),

  timezone: z.string().refine(isValidTimezone, 'Zona horaria no reconocida.').optional(),

  dailyGoalMinutes: z.number().int()
    .refine((m) => GOAL_OPTIONS.includes(m),
      `La meta debe ser una de: ${GOAL_OPTIONS.join(', ')} minutos.`)
    .optional(),

  currentBookTitle: z.string()
    .max(160, 'El título no puede pasar de 160 caracteres.')
    .transform((t) => t.trim())
    .transform((t) => (t.length === 0 ? null : t))   // "" y "   " → null
    .nullable().optional(),
});
```

> Exigir **al menos 1 día**: un usuario con `scheduledDays: []` nunca podría
> perder ni ganar por compromiso y rompería la narrativa del juego.
>
> El `transform` deduplica y ordena, así que `[3,1,7,3,1]` se guarda como
> `[1,3,7]`; el cliente no tiene que preocuparse por el orden.

**`src/components/ScheduleEditor.tsx`** (React, `client:load`)
- **Campo de nombre**, precargado con `user.name`. Es editable aquí porque el
  nombre gobierna toda la personalización y el usuario tiene que poder
  corregirlo sin borrar la cuenta. Se guarda con `authClient.updateUser({ name })`
  y se valida con el mismo `checkName()` de `@/lib/name`.
- 7 chips L–M–X–J–V–S–D (valores ISO 1..7), multiselección.
- Input de libro actual (placeholder: `Influencia: La Psicología de la Persuasión`).
- Select de meta diaria: 10 / 15 / 20 / 30 min.
- Detecta la zona horaria con `Intl.DateTimeFormat().resolvedOptions().timeZone`
  y **la envía en cada guardado**, no solo en el primero: si el usuario viaja o
  cambia el reloj del sistema, la contabilidad de días debe seguirle. Si difiere
  de la guardada, lo avisa antes de guardar.
- Guarda con `fetch('/api/profile', { method: 'PATCH', ... })`. El botón se
  etiqueta "Empezar a leer" durante el onboarding y "Guardar cambios" después.
- **Al guardar con éxito navega al inicio de la app (`/app`)**, tanto en el
  onboarding como en una edición normal: los ajustes no son un destino en sí,
  son un paso para volver a leer.

  ```ts
  const HOME_PATH = '/app';
  // …
  setStatus('saved');
  window.location.replace(HOME_PATH);
  ```

  Dos decisiones ahí:
  - **`replace`, no `href`**: sustituye la entrada del historial, así que pulsar
    "atrás" desde el inicio no devuelve al formulario que el usuario ya envió.
  - **Navegación completa, no `pushState`**: el servidor tiene que volver a
    renderizar con el perfil y el nombre nuevos.

  El botón queda inhabilitado mientras `status !== 'idle'` (evita doble envío
  durante la navegación) y muestra "Guardado ✓" con un "Volviendo al inicio…".
- Accesibilidad de los chips: `aria-pressed` + `aria-label` con el día completo
  ("miércoles"), porque la letra sola (`X`) no se entiende con lector de pantalla.

#### ⚠️ La caché de sesión en cookie deja el nombre obsoleto

`authClient.updateUser({ name })` escribe en MongoDB y responde `200`, pero la
sesión va **cacheada en la cookie** durante 5 minutos (`session.cookieCache`,
Tanda 2). El servidor sigue sirviendo el nombre anterior, así que recargar la
página muestra el viejo: parece que el guardado no funcionó.

Hay que forzar la relectura antes de recargar:

```ts
const nameChanged = nameCheck.name !== initialName;
if (nameChanged) {
  const { error } = await authClient.updateUser({ name: nameCheck.name });
  if (error) { /* … */ return; }

  // Relee de MongoDB y reescribe la cookie de caché.
  await authClient.getSession({ query: { disableCookieCache: true } });
}
// …guardar el perfil…
if (nameChanged) window.location.reload();
```

Comprobado: sin la llamada con `disableCookieCache`, `get-session` devuelve
`'Ana Torres'` aunque en MongoDB ya diga `'Ana María Torres'`. Con ella, el
cambio aparece en el saludo, el título y el layout de inmediato.

**`src/pages/ajustes.astro`** — usa `AppLayout`, llama a `ensureProfile` en el
frontmatter y pasa el perfil como prop al editor.

**Enganche en `/app`**: si `profile.onboardedAt === null`, `/app` redirige a
`/ajustes?onboarding=1` y el editor cambia su copy ("Prepara tu refugio",
"Empezar a leer"). Al guardar por primera vez se setea `onboardedAt`.

`/app` ya usa el perfil para orientar el día con `dayKey()` e `isoWeekday()` en
la zona del usuario: muestra el compromiso semanal, la meta, el libro actual y si
hoy es día de lectura o día libre.

### Documento de ejemplo
```json
{
  "userId": "kQ2v8ZpN3sJ1r5Yc",
  "timezone": "America/Bogota",
  "scheduledDays": [1, 2, 3, 4, 5],
  "dailyGoalMinutes": 10,
  "currentBookTitle": "Influencia: La Psicología de la Persuasión",
  "onboardedAt": "2026-09-21T14:03:11.000Z",
  "createdAt": "2026-09-21T14:01:47.000Z",
  "updatedAt": "2026-09-21T14:03:11.000Z"
}
```

### Qué necesito de tu lado
Confirmar tu zona horaria real para `PUBLIC_DEFAULT_TIMEZONE` (asumo
`America/Bogota`).

### Criterio de aceptación
- Usuario nuevo: `/app` → 302 a `/ajustes?onboarding=1`. Tras guardar, `/app` → 200.
- `PATCH` con `[3,1,7,3,1]` persiste `[1,3,7]`; con `"   "` en el título persiste
  `null`.
- Todos los rechazos del endpoint devuelven 400 con mensaje **en español**:
  sin días, día 0, día 8, día 1.5, meta 7 min, zona inventada, título de 200
  caracteres, JSON roto.
- `GET`/`PATCH` sin sesión → 401.
- 10 `GET /api/profile` en paralelo dejan **un solo** documento en `profiles`.
- Cambiar el nombre en `/ajustes` actualiza el saludo de `/app` y el título **en
  la primera recarga**, no cinco minutos después.
- Pulsar "Guardar cambios" (o "Empezar a leer") deja al usuario en `/app`, y
  "atrás" no vuelve al formulario.
- Un POST directo a `/api/auth/update-user` con `name: "D"` devuelve 400 y **no**
  corrompe el nombre guardado.

---

# TANDA 5 · Cronómetro de sesión de lectura

### Objetivo
Componente para **iniciar / pausar / reanudar / detener** una sesión, con el
tiempo autoritativo en el servidor. Todavía **no otorga perritos** (eso es la
Tanda 7): aquí solo se persisten sesiones y tiempo.

### Dependencias
Ninguna nueva.

### Modelo de tiempo (clave)
El navegador no es de fiar (pestaña dormida, reloj cambiado, F5). Por eso:
- El documento de sesión guarda `accumulatedSeconds` (tramos ya cerrados) y
  `lastResumedAt` (inicio del tramo en curso, o `null` si está en pausa).
- Tiempo real = `accumulatedSeconds + (lastResumedAt ? now - lastResumedAt : 0)`,
  **calculado en el servidor**.
- El cliente solo pinta un contador local que se **re-sincroniza** con cada
  respuesta del servidor.

```ts
// src/lib/repos/sessions.ts
export const MIN_SESSION_SECONDS = 60;
export const STALE_SESSION_HOURS = 6;

export function elapsedSeconds(session: ReadingSessionDoc, now = new Date()): number {
  const live = session.lastResumedAt
    ? Math.floor((now.getTime() - session.lastResumedAt.getTime()) / 1000)
    : 0;
  return session.accumulatedSeconds + Math.max(0, live);
}
```

El repo expone además `findOpenSession`, `abandonStaleSessions`, `startSession`,
`pauseSession`, `resumeSession`, `finishSession` y `completedSecondsForDay`.

**`pause` / `resume` / `finish` son idempotentes** y filtran por estado en el
propio `findOneAndUpdate` (`{ _id, status: 'running' }`): así dos pestañas
pulsando "Pausar" a la vez no pueden consolidar el tramo dos veces.

**Las sesiones viejas no regalan tiempo.** `abandonStaleSessions` cierra las
abiertas hace más de `STALE_SESSION_HOURS` acreditando **solo
`accumulatedSeconds`**, nunca el tramo en curso: el usuario cerró la pestaña y se
fue, no estuvo leyendo 8 horas. `/app` la llama antes de ofrecer retomar una
sesión.

**`src/lib/sessions-view.ts`** define `SessionView`, la forma que viaja al
navegador: `{ id, dayKey, bookTitle, status, elapsedSeconds, running, startedAt }`.
El cliente no recalcula nada, solo adopta lo que llega.

**`src/lib/api.ts`** centraliza `json()`, `unauthorized()`, `badRequest()`,
`notFound()` y `readJson()`, para que los endpoints no repitan cabeceras ni
literales de error.

### Endpoints

| Ruta | Método | Cuerpo | Efecto |
|---|---|---|---|
| `/api/sessions/start` | POST | `{ bookTitle? }` | Abandona cualquier sesión `running`/`paused` con más de 6 h de antigüedad; crea una nueva `running`. Si ya hay una activa reciente, la **devuelve** en vez de crear otra. |
| `/api/sessions/heartbeat` | POST | `{ sessionId, action: 'pause' \| 'resume' \| 'ping' }` | `pause`: suma el tramo a `accumulatedSeconds`, pone `lastResumedAt = null`. `resume`: `lastResumedAt = now`. `ping`: solo devuelve el estado (anti-desfase, cada 30 s). |
| `/api/sessions/finish` | POST | `{ sessionId }` | Cierra: `durationSeconds = elapsedSeconds()`, `status = 'completed'`, `endedAt = now`. **Devuelve el documento cerrado.** (En la Tanda 7 este endpoint además liquidará perritos.) |

Todos: `export const prerender = false;`, verifican `locals.user`, y **meten el
`userId` en el propio filtro de Mongo**:

```ts
const session = await sessions.findOne({
  _id: new ObjectId(parsed.data.sessionId),
  userId: locals.user.id,     // nunca confíes en el sessionId del cliente
});
if (!session) return notFound('No encontramos esa sesión.');
```

Así una sesión ajena es indistinguible de una inexistente: no se filtra si
existe. **Verificado**: un segundo usuario con el `sessionId` de la víctima recibe
404 en `heartbeat` y en `finish`, y la sesión de la víctima sigue corriendo.

Valida también que el `sessionId` sea un ObjectId (`ObjectId.isValid`) antes de
construirlo: con una cadena arbitraria, el constructor lanza y el endpoint
devolvería 500 en vez de 400.

**Regla anti-abuso**: en `finish`, si la duración es menor que
`MIN_SESSION_SECONDS` la sesión se marca `abandoned` y no cuenta para nada. La
respuesta incluye `counted: false` para que la UI lo explique.

### `src/components/ReadingTimer.tsx`
Máquina de estados explícita: `idle → running ⇄ paused → finished`.

- **El intervalo local solo pinta.** Cada tick suma 1 s al número mostrado; la
  única vía por la que el tiempo cambia de verdad es `adopt(serverSession)`.
- Re-sincroniza con `heartbeat: 'ping'` **cada 30 s y al volver a la pestaña**
  (`document.visibilitychange`): el `setInterval` del navegador se congela cuando
  la pestaña duerme, así que el contador local se desvía del tiempo real.
- El `sessionId` vive también en un `useRef`, porque los intervalos capturarían
  un valor obsoleto del estado.
- `beforeunload` **no** llama a `finish` (perdería tiempo válido); la sesión
  queda abierta y `start` la recupera.
- Muestra `MM:SS` dentro de un anillo SVG de progreso hacia la meta, y una fila
  con los cinco escalones de recompensa (10 / 15 / 20 / 25 / 30 min) que se
  encienden al alcanzarlos: es el "un bloque más" que alarga la sesión.
- El anillo usa `var(--color-primary-bright)` sobre `var(--color-muted)`, leídos
  del sistema de tokens, así que sigue el tema sin variantes `dark:`.
- `role="timer"` con **`aria-live="off"`**: anunciar un contador cada segundo
  sería insufrible con lector de pantalla. Los cambios de estado sí se anuncian,
  en un `role="status"` aparte.
- Botones: **Empezar a leer** (primary), **Pausar / Reanudar** (ghost),
  **Terminar sesión** (primary).

#### ⚠️ "Terminar sesión" NUNCA se deshabilita

Bloquearlo por debajo de `MIN_SESSION_SECONDS` es una **trampa sin salida**: en
pausa el reloj no avanza, así que una sesión pausada a los 2 s no alcanzaba nunca
el mínimo y el usuario se quedaba con «Reanudar» como única opción.

La regla la aplica **el servidor**, que marca la sesión `abandoned` y responde
`counted: false`. El trabajo de la interfaz es **avisar de la consecuencia**, no
impedir la acción:

```tsx
const secondsToCount = Math.max(0, minSessionSeconds - displaySeconds);
const willCount = secondsToCount === 0;

// El botón solo se bloquea mientras hay una petición en vuelo.
<Button onClick={handleFinish} disabled={busy}>Terminar sesión</Button>

{!willCount && (phase === 'running' || phase === 'paused') && (
  <p>Todavía no cuenta: faltan {secondsToCount} s para el mínimo de 1 min.</p>
)}
```

El aviso es **texto visible**, no un `title`: un tooltip exige pasar el ratón y no
existe en móvil.

> **Regla general para el resto de las tandas**: no deshabilites un control para
> hacer cumplir una regla que el servidor ya valida. Deja pulsar y explica el
> resultado. Un botón deshabilitado sin motivo visible parece una app rota.

`REWARD_STEPS` vive provisionalmente en `game/preview.ts` con los cinco escalones
y sus perritos; en la Tanda 6 pasa a derivarse de `dogsForMinutes()`.

### Ejemplo de documento de sesión
```json
{
  "userId": "kQ2v8ZpN3sJ1r5Yc",
  "dayKey": "2026-09-22",
  "bookTitle": "Influencia: La Psicología de la Persuasión",
  "status": "completed",
  "startedAt":     "2026-09-22T23:05:00.000Z",
  "lastResumedAt": null,
  "accumulatedSeconds": 1080,
  "endedAt":       "2026-09-22T23:25:40.000Z",
  "durationSeconds": 1080,
  "createdAt": "2026-09-22T23:05:00.000Z",
  "updatedAt": "2026-09-22T23:25:40.000Z"
}
```
> 1080 s = 18 min leyendo *Influencia* (hubo 2 min de pausa entre `startedAt` y
> `endedAt`: 20:40 de reloj, 18:00 de lectura). Con la curva de la Tanda 6, 18
> min caen en el bloque de 15 → **2 perritos**.

### Qué necesito de tu lado
Nada. Pruébalo iniciando una sesión, pausando 30 s y terminando: el tiempo
mostrado debe coincidir con `durationSeconds` en Mongo.

### Criterio de aceptación
Todo esto se comprueba contra el servidor, no por inspección del código:

- `start` dos veces devuelve **la misma** sesión con `resumed: true`.
- El tiempo avanza: dos `ping` separados 3 s dan +3 s.
- **La pausa no cuenta.** Medición limpia de 4 s leyendo + 5 s en pausa + 4 s
  leyendo: reloj de pared 14.1 s, tiempo registrado **8 s**.
- `pause` dos veces seguidas no pierde ni duplica tiempo.
- Una sesión de 300 s cierra como `completed` con `counted: true`, y
  `daySeconds` acumula 300.
- Una sesión de menos de 60 s cierra como `abandoned`, `counted: false`, y
  `daySeconds` sigue en 0.
- Una sesión abierta hace 8 h con 42 s acumulados se cierra como `abandoned`
  acreditando **42 s**, no 8 h; y el cronómetro arranca en reposo.
- El `sessionId` de otro usuario → 404 en `heartbeat` y `finish`.
- Los tres endpoints sin sesión → 401.
- Todos los errores de validación responden **en español** (ver convención 13).
- Recargar a mitad de sesión recupera el cronómetro: `/app` pasa la sesión
  abierta como prop con su `elapsedSeconds` y `running` correctos.
- **Pausar a los 2 s y pulsar "Terminar sesión" funciona**: cierra como
  `abandoned` y el estado dice "Sesión demasiado corta (menos de 1 min): no
  cuenta." Ningún botón queda bloqueado sin explicación visible.

---

# TANDA 6 · Motor de gamificación (lógica pura)

### Objetivo
Implementar **toda** la matemática de "Salvando a Peluche" como funciones puras,
sin tocar la base de datos. Esta tanda es 100 % testeable y es el corazón del
producto: si se equivoca, todo lo demás miente.

### Dependencias
```bash
npm install -D vitest
```

Scripts: `"test": "vitest run"` y `"test:watch": "vitest"`.

**Hace falta `vitest.config.ts`** para que los tests resuelvan el alias `@/*`:
Vitest no lee los `paths` de `tsconfig.json` por su cuenta.

```ts
import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: { include: ['src/**/*.test.ts'], environment: 'node' },
});
```

### 6.1 Constantes de balance — `src/lib/game/config.ts`

```ts
export const GAME = {
  /** Perritos con los que abre el refugio una cuenta nueva. */
  START_DOGS: 7,
  /** Aforo base del refugio. */
  BASE_CAPACITY: 7,
  /** El refugio jamás baja de aquí: siempre queda Peluche. */
  FLOOR_DOGS: 1,
  /** Cada N adopciones el refugio gana +1 de aforo. */
  ADOPTIONS_PER_CAPACITY: 10,
  MAX_CAPACITY: 21,

  /** Umbral mínimo para ganar el primer perrito. */
  BASE_MINUTES: 10,
  /** Tamaño de cada bloque adicional. */
  BLOCK_MINUTES: 5,
  /** Bloques adicionales que puntúan (4 → tope a los 30 min). */
  MAX_BLOCKS: 4,

  /** Perritos perdidos por cada día programado sin leer. */
  PENALTY_PER_MISS: 1,
  /** Tope de pérdida semanal, como fracción de los perritos al abrir la semana. */
  WEEKLY_LOSS_RATIO: 0.6,

  /** Bajo esto, una sesión no cuenta (anti-toque accidental). */
  MIN_SESSION_SECONDS: 60,
} as const;
```

### 6.2 Recompensas — `src/lib/game/rewards.ts`

> **Regla:** los primeros 10 minutos valen 1 perrito. Cada bloque extra de 5
> minutos vale **un perrito más que el bloque anterior** (curva ascendente).
> El cálculo se hace sobre el **total de minutos leídos en el día**, no por
> sesión: así tres sesiones de 7 min no valen 0.

```ts
import { GAME } from './config';

/** Perritos totales que corresponden a `minutes` leídos en un mismo día. */
export function dogsForMinutes(minutes: number): number {
  if (minutes < GAME.BASE_MINUTES) return 0;
  const blocks = Math.min(
    Math.floor((minutes - GAME.BASE_MINUTES) / GAME.BLOCK_MINUTES),
    GAME.MAX_BLOCKS,
  );
  return 1 + (blocks * (blocks + 1)) / 2;   // 1, 2, 4, 7, 11
}

/**
 * Los escalones de la curva, DERIVADOS de `dogsForMinutes`, no escritos a mano:
 * cambiar `config.ts` cambia la tabla de la interfaz sin tocar la UI.
 */
export const REWARD_STEPS: readonly { minutes: number; dogs: number }[] =
  Array.from({ length: GAME.MAX_BLOCKS + 1 }, (_, i) => {
    const minutes = GAME.BASE_MINUTES + i * GAME.BLOCK_MINUTES;
    return { minutes, dogs: dogsForMinutes(minutes) };
  });

/** Siguiente escalón por alcanzar, o `null` si ya está en el tope. */
export function nextRewardStep(
  minutes: number,
): { atMinutes: number; dogs: number; minutesAway: number } | null {
  const step = REWARD_STEPS.find((s) => minutes < s.minutes);
  if (!step) return null;
  return { atMinutes: step.minutes, dogs: step.dogs, minutesAway: step.minutes - minutes };
}
```

`dogsForMinutes` se blinda contra entradas basura (`NaN`, `Infinity`, negativos →
`0`), porque los minutos llegan de una división de segundos del cliente.

**Al terminar esta tanda se borra `src/lib/game/preview.ts`** y sus tres usos
pasan a las constantes reales: `ReadingTimer` importa `REWARD_STEPS` de
`game/rewards`, y la landing importa `GAME` de `game/config`.

**Tabla resultante (memorizar, es el contrato con la UI):**

| Minutos en el día | Bloques extra | Perritos totales | Ganancia del bloque |
|---:|---:|---:|---:|
| 0 – 9 | — | **0** | — |
| 10 | 0 | **1** | +1 |
| 15 | 1 | **2** | +1 |
| 20 | 2 | **4** | +2 |
| 25 | 3 | **7** | +3 |
| 30 o más | 4 (tope) | **11** | +4 |

### 6.3 Penalizaciones — `src/lib/game/penalties.ts`

```ts
import { GAME } from './config';

/** Máximo de perritos que se pueden perder en la semana en curso. */
export function weeklyLossCap(dogsAtWeekStart: number): number {
  return Math.max(1, Math.ceil(dogsAtWeekStart * GAME.WEEKLY_LOSS_RATIO));
}

/** Penalización efectiva de un día fallado, ya recortada por los dos topes. */
export function effectivePenalty(
  dogs: number, dogsAtWeekStart: number, weekLosses: number,
): number {
  const remainingWeekly = Math.max(0, weeklyLossCap(dogsAtWeekStart) - weekLosses);
  const remainingFloor  = Math.max(0, dogs - GAME.FLOOR_DOGS);
  return Math.min(GAME.PENALTY_PER_MISS, remainingWeekly, remainingFloor);
}
```

**Dos frenos, no uno:**
1. **Tope semanal** (60 % de los perritos al abrir la semana). Empezando con 7:
   `ceil(7 × 0.6) = 5` → aunque falles los 7 días, la semana cierra con **2**
   perritos, no con 0.
2. **Piso absoluto** `FLOOR_DOGS = 1`: Peluche nunca muere. Es el ancla emocional
   y el punto desde el que siempre se puede remontar (10 min → +1).

### 6.4 Reducer de estado — `src/lib/game/engine.ts`

Función **pura**: mismo estado + misma acción ⇒ mismo resultado. No lee reloj ni
DB; todo entra por parámetros.

```ts
import { GAME } from './config';
import { dogsForMinutes } from './rewards';
import { effectivePenalty } from './penalties';
import type { GameEventDoc, GameStateDoc } from '@/lib/db/types';

export type GameState = Omit<GameStateDoc, 'userId' | 'updatedAt'>;
export type NewEvent = Omit<GameEventDoc, 'userId' | 'createdAt'>;

export type GameAction =
  /** Cambio de semana: reinicia topes de pérdida. */
  | { kind: 'rollover'; weekKey: string; dayKey: string }
  /** Día programado que terminó sin lectura suficiente. */
  | { kind: 'miss'; dayKey: string }
  /** Día no programado: no penaliza, no rompe racha. */
  | { kind: 'rest'; dayKey: string }
  /** Liquidación del día: `minutesToday` es el acumulado del día completo. */
  | { kind: 'settle'; dayKey: string; minutesToday: number; alreadyAwarded: number };

const capacityFor = (adopted: number) => Math.min(
  GAME.BASE_CAPACITY + Math.floor(adopted / GAME.ADOPTIONS_PER_CAPACITY),
  GAME.MAX_CAPACITY,
);

export function applyAction(state: GameState, action: GameAction): {
  state: GameState; events: NewEvent[];
} {
  const s: GameState = { ...state };
  const events: NewEvent[] = [];

  switch (action.kind) {
    case 'rollover': {
      s.weekKey = action.weekKey;
      s.weekStartDogs = s.dogs;
      s.weekLosses = 0;
      events.push({ dayKey: action.dayKey, type: 'week_rollover', delta: 0,
        reason: `Nueva semana ${action.weekKey}`, dogsAfter: s.dogs });
      break;
    }

    case 'rest': {
      s.lastReconciledDay = action.dayKey;
      break;
    }

    case 'miss': {
      const loss = effectivePenalty(s.dogs, s.weekStartDogs, s.weekLosses);
      if (loss > 0) {
        s.dogs -= loss;
        s.weekLosses += loss;
        events.push({ dayKey: action.dayKey, type: 'penalty', delta: -loss,
          reason: 'Día programado sin lectura', dogsAfter: s.dogs });
      }
      s.streak = 0;
      s.lastReconciledDay = action.dayKey;
      break;
    }

    case 'settle': {
      // Idempotencia: solo se entrega la DIFERENCIA con lo ya otorgado hoy.
      const target = dogsForMinutes(action.minutesToday);
      const delta = target - action.alreadyAwarded;
      if (delta > 0) {
        const cap = capacityFor(s.adopted);
        const placed = Math.min(s.dogs + delta, cap);
        const overflow = s.dogs + delta - placed;
        s.dogs = placed;
        events.push({ dayKey: action.dayKey, type: 'reward', delta,
          reason: `${action.minutesToday} min de lectura`, dogsAfter: s.dogs });
        if (overflow > 0) {
          s.adopted += overflow;
          events.push({ dayKey: action.dayKey, type: 'adoption', delta: overflow,
            reason: 'Refugio lleno: perritos adoptados', dogsAfter: s.dogs });
        }
        s.capacity = capacityFor(s.adopted);
      }
      break;
    }
  }
  return { state: s, events };
}

export function initialState(weekKey: string, dayKey: string): GameState {
  return {
    dogs: GAME.START_DOGS,
    capacity: GAME.BASE_CAPACITY,
    adopted: 0,
    weekKey,
    weekStartDogs: GAME.START_DOGS,
    weekLosses: 0,
    lastReconciledDay: dayKey,   // el día de alta NO se penaliza
    streak: 0,
    bestStreak: 0,
  };
}
```

> **Nota sobre el desborde**: si el refugio está lleno, los perritos extra pasan a
> `adopted` (encontraron casa). Es el score histórico y además hace crecer el
> aforo (+1 cada 10 adopciones, hasta 21). Así leer mucho nunca se "desperdicia".

### 6.5 Reconciliación de días pasados — `src/lib/game/engine.ts`

No hay cron en Vercel Hobby, y no hace falta: las penalizaciones se liquidan
**de forma perezosa** la próxima vez que el usuario entra.

```ts
import { dayKeysBetween, weekKeyFromDayKey } from '@/lib/time';

/**
 * Evalúa todos los días cerrados entre `state.lastReconciledDay` (exclusivo)
 * y `todayKey` (EXCLUSIVO: el día en curso nunca se penaliza).
 *
 * No recibe `weekdayOf`: usa `isoWeekdayOfDayKey()` de `@/lib/time`, que no
 * necesita zona horaria porque un `dayKey` ya es una fecha civil.
 */
export function reconcile(
  state: GameState,
  todayKey: string,
  scheduledDays: readonly IsoWeekday[],
  completedDays: ReadonlySet<string>,
): ApplyResult {
  let s = state;
  const all: NewEvent[] = [];
  let streakAlive = true;

  for (const day of dayKeysBetween(s.lastReconciledDay, todayKey)) {
    if (day >= todayKey) break;                       // hoy no se juzga

    const wk = weekKeyFromDayKey(day);
    if (wk !== s.weekKey) {
      const r = applyAction(s, { kind: 'rollover', weekKey: wk, dayKey: day });
      s = r.state; all.push(...r.events);
    }

    const isScheduled = scheduledDays.includes(weekdayOf(day));
    const didRead = completedDays.has(day);

    if (didRead) {
      s = { ...s, lastReconciledDay: day, streak: streakAlive ? s.streak + 1 : 1 };
      s.bestStreak = Math.max(s.bestStreak, s.streak);
    } else if (isScheduled) {
      const r = applyAction(s, { kind: 'miss', dayKey: day });
      s = r.state; all.push(...r.events); streakAlive = false;
    } else {
      const r = applyAction(s, { kind: 'rest', dayKey: day });
      s = r.state;
    }
  }
  return { state: s, events: all };
}
```

**Invariantes que deben cumplirse siempre**, comprobados tras cada acción en
`invariants.test.ts`:

```
GAME.FLOOR_DOGS <= dogs <= capacity <= GAME.MAX_CAPACITY
capacity === capacityFor(adopted)          // el aforo nunca se desincroniza
weekLosses <= weeklyLossCap(weekStartDogs)
adopted >= 0 · streak >= 0 · bestStreak >= streak
dogs y adopted son enteros
evento.dogsAfter === estado.dogs           // el historial no miente
lastReconciledDay < todayKey               // tras reconciliar
reconcile(reconcile(s, T, …).state, T, …)   // no produce eventos nuevos
```

### 6.6 Tests obligatorios — `src/lib/game/__tests__/`

**42 tests en 4 archivos.** Los tres primeros cubren el contrato; el cuarto es el
que de verdad da garantías.

`rewards.test.ts` (12)
- La tabla completa: 0→0, 9→0, 10→1, 14→1, 15→2, 20→4, 25→7, 30→11, 600→11.
- Monotonía en 0..240 y **curva ascendente**: las ganancias por bloque son
  `[1, 1, 2, 3, 4]`, estrictamente crecientes desde el segundo.
- Entradas basura (`-5`, `NaN`, `Infinity`) → `0`. Salida siempre entera.
- `REWARD_STEPS` coincide con la curva (prueba de que no está escrita a mano).

`penalties.test.ts` (9)
- `weeklyLossCap(7) = 5`, y nunca 0 ni con `dogsAtWeekStart = 0`.
- **Semana desastrosa**: 7 de 7 fallados desde 7 perritos da
  `[1,1,1,1,1,0,0]` ⇒ termina en **2**, nunca en 0.
- Empezando con 1, 2, 3, 7, 12 o 21 perritos y fallando **30 días**, nunca baja
  del piso.

`engine.test.ts` (19)
- **Pureza**: `applyAction` no muta el estado recibido (comparado con
  `structuredClone`).
- Doble `settle` con los mismos minutos no duplica recompensa; seguir leyendo
  paga **solo la diferencia** (10 min → +1, luego 20 min → +3, no +4).
- Desborde: con `dogs = 7, capacity = 7`, 30 min ⇒ `dogs = 7`, `adopted = 11`,
  `capacity = 8`. Y `dogs + adopted` crece exactamente lo ganado: leer mucho
  nunca se desperdicia.
- `reconcile` **no juzga el día en curso**, es **idempotente**, no penaliza días
  libres, cuenta la racha conservando el récord, cruza el cambio de semana y
  aguanta un mes entero sin entrar.
- **Escenario narrativo del Apéndice B** reproducido paso a paso.

`invariants.test.ts` (2) — **prueba de fuzz**
- **2000 secuencias de 40 acciones aleatorias** (`rollover` / `miss` / `rest` /
  `settle` con 15 duraciones distintas), verificando los invariantes tras cada
  paso y que todo evento registre el saldo correcto en `dogsAfter`.
- **300 reconciliaciones** con huecos de 1 a 120 días, 6 horarios distintos
  (solo lunes, solo domingo, L–V, fines de semana, todos los días, M+V) y días
  leídos al azar; comprobando invariantes, que `lastReconciledDay < hoy` y la
  idempotencia.
- Generador determinista (mulberry32 con semilla) para que un fallo sea
  reproducible, y mensajes de error que imprimen semilla, paso y estado.

### Qué necesito de tu lado
Validar el balance antes de seguir. Si te parece duro o blando, los únicos
números que hay que tocar son los de `config.ts` — nada más cambia.

### Criterio de aceptación
- `npm test` en verde: **42 tests, 4 archivos**.
- Cero imports de `mongodb` dentro de `src/lib/game/*` excepto en `service.ts`
  (Tanda 7). Compruébalo con
  `grep -rn "mongodb" src/lib/game/ | grep -v service`.
- `src/lib/game/preview.ts` **ya no existe** y nada lo referencia.
- La interfaz muestra las cifras del motor: la landing lee `GAME` y el cronómetro
  pinta `REWARD_STEPS` (`10→1, 15→2, 20→4, 25→7, 30→11`), verificado en navegador.

---

# TANDA 7 · Integración: sesiones → progreso → perritos

### Objetivo
Conectar el motor puro con la base de datos y con la UI. Aquí es donde terminar
una sesión realmente resucita perritos y donde entrar a la app liquida los días
fallados.

### Dependencias
Ninguna nueva.

### 7.1 `src/lib/repos/progress.ts`

```ts
/** Suma la sesión al día y devuelve el progreso actualizado. Atómico. */
export async function addSessionToDay(
  userId: string, dayKey: string, weekKey: string,
  seconds: number, scheduled: boolean,
) {
  const c = await col.dailyProgress();
  const r = await c.findOneAndUpdate(
    { userId, dayKey },
    {
      $inc: { totalSeconds: seconds, sessionsCount: 1 },
      $set: { weekKey, scheduled, updatedAt: new Date() },
      $setOnInsert: { dogsAwarded: 0, outcome: 'pending' },
    },
    { upsert: true, returnDocument: 'after' },
  );
  return r!;
}

/** Marca cuántos perritos lleva otorgados el día. Base de la idempotencia. */
export async function setDogsAwarded(userId: string, dayKey: string, total: number) {
  const c = await col.dailyProgress();
  await c.updateOne({ userId, dayKey },
    { $set: { dogsAwarded: total, outcome: total > 0 ? 'completed' : 'pending', updatedAt: new Date() } });
}
```

### 7.2 `src/lib/game/service.ts` — la única puerta a la gamificación

```ts
/**
 * Se llama al ENTRAR a cualquier vista de la app.
 * 1. Garantiza profile + gameState.
 * 2. Reconcilia días cerrados (penalizaciones diferidas).
 * 3. Persiste estado y eventos.
 */
export async function syncOnVisit(userId: string, now = new Date()): Promise<GameSnapshot>;

/**
 * Se llama SOLO desde /api/sessions/finish, después de cerrar la sesión.
 * 1. Suma segundos al dailyProgress de hoy.
 * 2. `settle` con los minutos TOTALES del día y `alreadyAwarded`.
 * 3. Persiste gameState + eventos + nuevo `dogsAwarded`.
 * Devuelve `{ dogsGained, dogsTotal, adopted, minutesToday, nextStep }`
 * para que la UI pueda animar la ganancia.
 */
export async function settleSession(userId: string, sessionId: string): Promise<SettleResult>;
```

**Orden de operaciones en `settleSession` (no lo cambies):**
1. Cargar sesión → validar `userId` y `status === 'completed'`.
2. Si `durationSeconds < GAME.MIN_SESSION_SECONDS` → salir sin tocar nada.
3. `addSessionToDay(...)` → obtiene `totalSeconds` del día.
4. `minutesToday = Math.floor(totalSeconds / 60)`.
5. `applyAction(state, { kind: 'settle', minutesToday, alreadyAwarded: progress.dogsAwarded })`.
6. Persistir `gameState` (`updateOne` con `$set`), insertar eventos,
   `setDogsAwarded(userId, dayKey, dogsForMinutes(minutesToday))`.
7. Marcar la sesión con `settledAt: new Date()` y **rechazar** liquidar dos veces
   la misma sesión (`if (session.settledAt) return cached`).

> Los pasos 3–7 no son una transacción. Con Atlas (replica set) puedes envolverlos
> en `withTransaction`; si el cluster no lo soporta, el orden anterior garantiza
> que en el peor caso se otorgue **de menos**, nunca de más — y la siguiente
> sesión del día corrige la diferencia sola, porque `settle` siempre apunta al
> total del día.

### 7.3 Cambios en endpoints existentes
- `/api/sessions/finish`: tras cerrar la sesión, llama a `settleSession` y
  devuelve `{ session, reward }`.
- Middleware **no** llama a `syncOnVisit` (encarecería cada request). Lo llaman
  los frontmatter de `/app`, `/progreso` y `/ajustes`.

### 7.4 UI — `src/components/Shelter.tsx`
- Rejilla de `capacity` casillas: perrito vivo (ilustración a color) vs. hueco
  vacío (silueta gris `--color-muted`).
- Al ganar: las casillas entran con un `scale/fade` escalonado (50 ms de desfase)
  y un contador `+N` en `--color-primary`.
- Al perder (mostrado al entrar, tras la reconciliación): la casilla se apaga en
  `--color-alert` **una sola vez**, con un texto sobrio:
  *"El martes no leíste. Un perrito se fue."* Sin dramatismo excesivo, sin sonido,
  sin bloquear la pantalla.
- Respeta `prefers-reduced-motion`: sin animación, solo el estado final.
- Muestra bajo la rejilla: `Adoptados: 23` y `Aforo: 9`.

**Accesibilidad**: la rejilla lleva `role="img"` y un
`aria-label="Refugio: 5 de 8 perritos"`; el detalle textual vive en una lista
visualmente oculta. Nunca comuniques el estado solo por color.

### 7.5 Enganche en `/app`
```astro
---
import { syncOnVisit } from '@/lib/game/service';
const snapshot = await syncOnVisit(Astro.locals.user!.id);
---
<AppLayout title="Hoy">
  <Shelter client:load snapshot={snapshot} />
  <ReadingTimer client:load profile={snapshot.profile} todaySeconds={snapshot.today.totalSeconds} />
</AppLayout>
```

### Qué necesito de tu lado
1. Ilustraciones/sprites en `public/dogs/` (`dog.svg`, `dog-empty.svg`). Si no
   los tienes, se usan emojis 🐶 / 🕳️ como placeholder y se sustituyen después.
2. Prueba manual: cambia a mano `lastReconciledDay` en Mongo a hace 3 días,
   recarga `/app` y verifica que descuenta exactamente los días programados.

### Criterio de aceptación
- Leer 10 min ⇒ +1 perrito. Seguir hasta 20 min totales ⇒ +3 más (4 en total en
  el día), no +4 extra.
- Recargar `/app` cinco veces seguidas no cambia el número de perritos.

---

# TANDA 8 · Dashboard de progreso (`/progreso`)

### Objetivo
Vista analítica: días leídos, tiempo acumulado y evolución de la gamificación.

### Dependencias
```bash
npm install recharts
```

### 8.1 Endpoint `src/pages/api/progress/summary.ts`
`GET ?range=30` devuelve, en **una sola respuesta** (nada de N peticiones):
```ts
{
  totals: { minutesAllTime, minutesThisWeek, sessionsAllTime,
            daysCompleted, adherenceRate },     // adherencia = cumplidos / programados
  game:   { dogs, capacity, adopted, streak, bestStreak,
            weekLosses, weeklyLossCap },
  daily:  [{ dayKey, minutes, scheduled, outcome, dogsAwarded }],   // últimos `range` días
  dogsTimeline: [{ dayKey, dogs }],             // saldo al cierre de cada día
  events: [{ dayKey, type, delta, reason }],    // últimos 20
}
```
Se construye con una agregación sobre `dailyProgress` + lectura de `gameEvents`.
Rellena con ceros los días sin documento (`dayKeysBetween`) para que las series
no tengan huecos.

### 8.2 Componentes `src/components/charts/`

| Componente | Tipo | Datos | Color |
|---|---|---|---|
| `MinutesBarChart` | `BarChart` | minutos/día, 14 días | barra `--color-accent`; día programado incumplido en `--color-alert`; día libre en `--color-muted` |
| `DogsAreaChart` | `AreaChart` | `dogsTimeline`, 30 días | línea + relleno al 15 % en `--color-primary` |
| `AdherenceRing` | `RadialBarChart` | % adherencia semanal | `--color-primary` sobre pista `--color-muted` |
| `WeekHeatmap` | grid propio (sin Recharts) | 8 semanas × 7 días | escala de teal por minutos; ✕ rosa en incumplidos |
| `EventTimeline` | lista | `events` | `+` teal / `−` rosa |

**Reglas de las gráficas:**
- Los colores salen de las **variables CSS**, leídas en runtime
  (`getComputedStyle(document.documentElement).getPropertyValue('--color-accent')`)
  dentro de un `useEffect` que re-lee al cambiar de tema; así las gráficas
  cambian con el toggle sin duplicar paletas.
- `<ResponsiveContainer width="100%" height={220}>` siempre; nada de anchos fijos.
- Sin `CartesianGrid` vertical; horizontal a 1 px en `--color-border`.
- Ejes sin línea (`axisLine={false} tickLine={false}`), tipografía 12 px
  `--color-text-soft`.
- Tooltip propio (`content={<ChartTooltip />}`) con `bg-surface`, borde y radio de
  tarjeta — el de Recharts por defecto ignora el tema oscuro.
- Todas las gráficas se montan con `client:visible` (no `client:load`): Recharts
  pesa y no hace falta antes del scroll.
- Estado vacío explícito: usuario sin datos ve una tarjeta con
  *"Empieza tu primera sesión para ver tu progreso"*, no un lienzo en blanco.

### 8.3 Página `src/pages/progreso.astro`
Orden de lectura: **estado ahora → semana → historia**.
1. Fila de 4 `Stat`: perritos vivos, racha, minutos esta semana, adherencia.
2. `AdherenceRing` + resumen del compromiso semanal.
3. `MinutesBarChart` (14 días).
4. `DogsAreaChart` (30 días).
5. `WeekHeatmap` (8 semanas).
6. `EventTimeline`.

### Qué necesito de tu lado
Tener al menos ~5 días de datos. Si no, ejecuta `npm run db:seed` (Tanda 9).

### Criterio de aceptación
Cambiar de tema con el toggle re-colorea las gráficas sin recargar la página.

---

# TANDA 9 · Semilla de datos, pulido y despliegue

### Objetivo
Datos de demo reproducibles, revisión final de calidad y app en producción.

### Dependencias
Ninguna nueva.

### 9.1 `scripts/db-seed.ts`
Crea (vía la API de Better Auth, no insertando a mano en `user`) el usuario de
`SEED_USER_EMAIL` / `SEED_USER_PASSWORD` y genera 21 días de historia realista
leyendo **"Influencia: La Psicología de la Persuasión"**:
- `scheduledDays: [1,2,3,4,5]`, `timezone` de `.env`.
- Días cumplidos con minutos variados (12, 18, 22, 31, 9…) y 3 días programados
  fallados repartidos, para que se vean penalizaciones reales en las gráficas.
- Debe pasar por `settleSession` y `reconcile` —**no** escribir `gameState` a
  mano: así el seed también actúa como test de integración del motor.

### 9.2 Pulido
- **SEO/meta**: título, descripción y `og:image` en `BaseLayout`.
- **Estados de carga**: skeletons en `Shelter` y gráficas; nunca layout shift.
- **Errores**: `src/pages/404.astro` y `500.astro` con la identidad visual.
- **Manejo de fallo de red** en el timer: si `finish` falla, reintento con
  backoff y aviso "No pudimos guardar tu sesión, reintentando…". La sesión sigue
  abierta en el servidor, así que no se pierde tiempo.
- **Accesibilidad**: foco visible (`focus-visible:ring-2 ring-primary`), contraste
  AA verificado en ambos temas, todo operable con teclado.
- **Zona horaria**: si `Intl...timeZone` del navegador difiere del perfil, ofrecer
  actualizarla (un viaje no debe romper la contabilidad de días).

### 9.3 `npm run preview` no funciona con el adaptador de Vercel

`astro preview` aborta con *"Preview server process exited before becoming
ready"*: el adaptador de Vercel no trae servidor de previsualización. Para
probar un build de producción en local hace falta `vercel dev`
(`npm i -g vercel`). El día a día se verifica con `npm run dev`.

### 9.4 Despliegue en Vercel
```bash
npm i -g vercel
vercel link
vercel --prod
```
Checklist antes de publicar:
- [ ] Variables del `.env.example` cargadas en Vercel (Production + Preview).
- [ ] `BETTER_AUTH_URL`, `PUBLIC_BETTER_AUTH_URL`, `PUBLIC_SITE_URL` con el
      dominio `https://` real.
- [ ] Atlas: Network Access `0.0.0.0/0`.
- [ ] Runtime de Node: Vercel Functions no soporta Node 26 (versión local). El
      adaptador cae automáticamente a **Node 24**; si quieres paridad exacta,
      usa Node 24 en local (`nvm use 24`).
- [ ] `npm run db:init` ejecutado **contra la base de producción**.
- [ ] `ALLOW_DB_RESET` **ausente o `no`** en Vercel.
- [ ] Registro + login probados en el dominio de producción (las cookies
      `secure` no funcionan en http).

### Qué necesito de tu lado
1. Crear el proyecto en Vercel y conectar el repositorio.
2. Cargar las variables de entorno en el panel.
3. Confirmarme el dominio final para fijar las URLs.

### Criterio de aceptación
Registro, sesión de lectura y `/progreso` funcionando en producción; los
perritos persisten tras cerrar el navegador.

---

# Apéndice A · Resumen del balance

```
Refugio inicial ................ 7 perritos (aforo 7)
Piso absoluto .................. 1 perrito (Peluche nunca muere)
Pérdida por día programado ..... −1
Tope de pérdida semanal ........ 60 % de los perritos al abrir la semana
  → peor semana posible desde 7: −5 ⇒ quedan 2
Recompensa (minutos del DÍA) ... 10→1 · 15→2 · 20→4 · 25→7 · 30+→11
Desborde del aforo ............. pasa a "adoptados" (score histórico)
Crecimiento del aforo .......... +1 cada 10 adopciones, máximo 21
```

**Por qué funciona**: la penalización es lineal y acotada; la recompensa es
convexa. Recuperarse siempre es más rápido que caer — una sola sesión de 20 min
repone cuatro días fallados. El castigo crea urgencia; la curva ascendente crea
el "un bloque más" que alarga la sesión. Y el piso de 1 garantiza que abandonar
una semana nunca deje la partida en un estado sin retorno.

---

# Apéndice B · Escenario narrativo de referencia

Usuario `kQ2v8ZpN3sJ1r5Yc`, `scheduledDays: [1,2,3,4,5]`, `America/Bogota`,
libro *Influencia: La Psicología de la Persuasión*. Estado inicial: 7 perritos.

| Día | Fecha | Prog. | Lectura | Acción del motor | Perritos | Nota |
|---|---|---|---|---|---|---|
| Lun | 2026-09-21 | ✔ | 12 min | `settle(12)` → +1 | **7** (aforo 7, +1 adoptado) | Refugio lleno: el extra se adopta |
| Mar | 2026-09-22 | ✔ | 18 min | `settle(18)` → +2 | **7** (3 adoptados) | 1080 s de la Tanda 5 |
| Mié | 2026-09-23 | ✔ | — | `miss` → −1 | **6** | `weekLosses = 1` |
| Jue | 2026-09-24 | ✔ | — | `miss` → −1 | **5** | `weekLosses = 2` |
| Vie | 2026-09-25 | ✔ | 26 min | `settle(26)` → +7 | **7** (aforo 7, +5 adoptados = 8) | Remonta dos días en una sesión |
| Sáb | 2026-09-26 | ✖ | — | `rest` | **7** | Día libre: no penaliza |
| Dom | 2026-09-27 | ✖ | 8 min | `settle(8)` → +0 | **7** | Bajo el umbral de 10 min |

Cierre de semana (`rollover` el lunes 28): `weekStartDogs = 7`, `weekLosses = 0`,
`adopted = 8`, `capacity = 7` (aún faltan 2 adopciones para el +1).

**Caso límite — semana perdida completa** (7 días programados, 0 lecturas, desde
7 perritos): `weeklyLossCap = ceil(7 × 0.6) = 5`. Se aplican penalizaciones los
días 1–5; los días 6 y 7 registran `miss` **sin pérdida** (tope alcanzado). Cierre:
**2 perritos**. El lunes siguiente, 20 minutos de lectura devuelven el refugio a 6.

---

# Apéndice C · Orden de ejecución y control de calidad

| Tanda | Entrega | Verificación |
|---|---|---|
| 0 | Proyecto arranca | `npm run build` |
| 1 | DB + índices | `npm run db:init` |
| 2 | Auth funcional | registro → cookie persistente |
| 3 | Shell + tema | toggle sin flash |
| 4 | Días comprometidos | persisten en Mongo |
| 5 | Cronómetro | sobrevive a un F5 |
| 6 | Motor puro | `npm test` en verde |
| 7 | Integración | recargar no duplica perritos |
| 8 | `/progreso` | gráficas siguen el tema |
| 9 | Producción | flujo completo en el dominio |

### Verificar en un navegador de verdad

`curl` no ejecuta JavaScript, así que no puede comprobar hidratación, clics ni
cambios de tema. Para eso, un Chrome headless **aislado del proyecto** (no añadas
la dependencia al `package.json` de la app):

```bash
mkdir -p /tmp/bt && cd /tmp/bt && npm init -y && npm install playwright-core
```

```js
import { chromium } from 'playwright-core';
const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('pageerror:', e.message));
page.on('console', (m) => m.type() === 'error' && console.log('console:', m.text()));
```

Comprueba el tema por el **color computado**, no por la clase: que `<html>` tenga
`dark` no demuestra que la paleta cambie.

```js
await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
// claro: rgb(250, 250, 250)   oscuro: rgb(11, 17, 32)
```

**Regla para la IA desarrolladora:** no empieces una tanda sin que la anterior
cumpla su criterio de aceptación. Si una tanda te obliga a modificar código de
una anterior, hazlo, pero vuelve a validar el criterio de aquella antes de
continuar. Y ante cualquier duda de balance o de negocio, **pregunta en vez de
inventar un número**: los valores viven todos en `src/lib/game/config.ts`.
