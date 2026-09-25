# Planificación técnica · **Peluche Reader**

> App web de hábito de lectura con gamificación ("Salvando a Peluche").
> Documento de ejecución para una IA desarrolladora. Cada **Tanda** es un paso
> atómico: al terminarla el proyecto debe compilar (`npm run build`) y quedar
> funcional, sin romper lo construido en tandas anteriores.

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

### 0.3 Convenciones no negociables

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

### 0.4 Mapa de archivos final (referencia)

```
reading-app/
├── .env                          # (lo crea el usuario)
├── .env.example
├── astro.config.mjs
├── tsconfig.json
├── package.json
├── planificacion.md
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
    │   ├── time.ts               # dayKey / weekKey / ISO weekday
    │   ├── db/
    │   │   ├── client.ts         # conexión cacheada
    │   │   ├── collections.ts    # accesores tipados
    │   │   └── types.ts          # tipos de documento
    │   ├── game/
    │   │   ├── config.ts         # constantes de balance
    │   │   ├── rewards.ts        # curva de recompensa (puro)
    │   │   ├── penalties.ts      # penalización + tope semanal (puro)
    │   │   ├── engine.ts         # reducer de estado (puro)
    │   │   └── service.ts        # orquesta engine + MongoDB (impuro)
    │   └── repos/
    │       ├── profile.ts
    │       ├── sessions.ts
    │       ├── progress.ts
    │       └── gameState.ts
    ├── components/
    │   ├── ui/                   # Button, Card, Toggle…
    │   ├── auth/AuthForm.tsx
    │   ├── ThemeToggle.tsx
    │   ├── ScheduleEditor.tsx
    │   ├── ReadingTimer.tsx
    │   ├── Shelter.tsx
    │   └── charts/
    ├── layouts/
    │   ├── BaseLayout.astro
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

```css
@import "tailwindcss";

/* dark mode por clase en <html>, no por media query */
@custom-variant dark (&:where(.dark, .dark *));

@theme {
  --color-base:        #fafafa;
  --color-surface:     #ffffff;
  --color-muted:       #eaedf2;
  --color-border:      #dfe3ea;
  --color-text:        #16202e;
  --color-text-soft:   #5b6675;

  --color-primary:     #0d9488;
  --color-primary-700: #0f766e;
  --color-primary-50:  #edfbf8;

  --color-accent:      #0284c7;  /* datos, enlaces, gráficas */
  --color-alert:       #e9437c;  /* pérdida de perritos */

  --radius-card: 14px;
  --font-sans: "Inter", ui-sans-serif, system-ui, sans-serif;
}

/* Overrides de tema oscuro: mismo contrato de nombres */
.dark {
  --color-base:        #0b1120;
  --color-surface:     #131a2a;
  --color-muted:       #1b2436;
  --color-border:      #26314a;
  --color-text:        #e6ebf3;
  --color-text-soft:   #96a2b5;

  --color-primary:     #14b8a6;
  --color-primary-700: #2dd4bf;
  --color-primary-50:  #0f2b2a;

  --color-accent:      #38bdf8;
  --color-alert:       #f472a3;
}

html, body { background: var(--color-base); color: var(--color-text); }
/* evita el flash de tema al hidratar */
html { color-scheme: light; }
html.dark { color-scheme: dark; }
```

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

**`src/pages/index.astro`** — landing mínima con `export const prerender = true;`.

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
npm install better-auth
```

### Nota de implementación (importante)
El adaptador oficial de MongoDB vive **dentro del paquete core**:
`import { mongodbAdapter } from 'better-auth/adapters/mongodb'`.
Si al instalar resulta que tu versión lo expone como paquete aparte
(`@better-auth/mongo-adapter`), instala ese e intercambia **solo la línea de
import** — la firma `mongodbAdapter(db)` es la misma. Verifica con:
```bash
node -e "console.log(Object.keys(require('better-auth/adapters/mongodb')))"
```

### Archivos

**`src/lib/auth.ts`**
```ts
import { betterAuth } from 'better-auth';
import { mongodbAdapter } from 'better-auth/adapters/mongodb';
import { getDb } from '@/lib/db/client';

const db = await getDb();

export const auth = betterAuth({
  database: mongodbAdapter(db),
  secret: process.env.BETTER_AUTH_SECRET!,
  baseURL: process.env.BETTER_AUTH_URL!,
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,            // tras registrarse, sesión iniciada
    requireEmailVerification: false,
    minPasswordLength: 8,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30,   // 30 días
    updateAge: 60 * 60 * 24,        // refresca la cookie 1 vez/día
    cookieCache: { enabled: true, maxAge: 5 * 60 },
  },
  advanced: {
    defaultCookieAttributes: { sameSite: 'lax', secure: import.meta.env.PROD },
  },
});

export type Session = typeof auth.$Infer.Session;
```

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
import { auth } from '@/lib/auth';

export const prerender = false;
export const ALL: APIRoute = ({ request }) => auth.handler(request);
```

**`src/middleware.ts`** — resuelve la sesión una vez por request y protege rutas.
```ts
import { defineMiddleware } from 'astro:middleware';
import { auth } from '@/lib/auth';

const PROTECTED = ['/app', '/progreso', '/ajustes'];
const GUEST_ONLY = ['/login', '/registro'];

export const onRequest = defineMiddleware(async (ctx, next) => {
  const data = await auth.api.getSession({ headers: ctx.request.headers });
  ctx.locals.user = data?.user ?? null;
  ctx.locals.session = data?.session ?? null;

  const path = ctx.url.pathname;
  if (!ctx.locals.user && PROTECTED.some((p) => path.startsWith(p))) {
    return ctx.redirect(`/login?next=${encodeURIComponent(path)}`, 302);
  }
  if (ctx.locals.user && GUEST_ONLY.includes(path)) {
    return ctx.redirect('/app', 302);
  }
  return next();
});
```

**`src/env.d.ts`**
```ts
/// <reference types="astro/client" />
declare namespace App {
  interface Locals {
    user: { id: string; email: string; name: string } | null;
    session: { id: string; userId: string; expiresAt: Date } | null;
  }
}
```

**`src/components/auth/AuthForm.tsx`** — un único componente React con prop
`mode: 'login' | 'register'`:
- Campos: email, password (y `name` opcional en registro; si se omite, usar la
  parte previa a la `@` del email, porque Better Auth lo exige).
- `signUp.email({ email, password, name })` / `signIn.email({ email, password })`.
- Errores en español mapeados desde el código de Better Auth
  (`INVALID_EMAIL_OR_PASSWORD` → "Correo o contraseña incorrectos",
  `USER_ALREADY_EXISTS` → "Ya existe una cuenta con ese correo").
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
- Registrarse crea documentos en las colecciones `user` y `account`.
- Cerrar y reabrir el navegador mantiene la sesión.
- Visitar `/app` sin sesión redirige a `/login?next=%2Fapp`.

---

# TANDA 3 · Shell de la app, tema claro/oscuro y sistema visual

### Objetivo
Layout autenticado reutilizable, navegación, y el toggle Light/Dark persistente.
Todo lo visual posterior se construye sobre estas piezas.

### Dependencias
```bash
npm install clsx lucide-react
```

### Archivos

**`src/components/ThemeToggle.tsx`** (React, `client:load`)
```tsx
import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

export default function ThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => setDark(document.documentElement.classList.contains('dark')), []);
  const toggle = () => {
    const next = !dark;
    document.documentElement.classList.toggle('dark', next);
    localStorage.setItem('theme', next ? 'dark' : 'light');
    setDark(next);
  };
  return (
    <button onClick={toggle} aria-label="Cambiar tema"
      className="rounded-full border border-border bg-surface p-2 text-text-soft hover:text-primary transition">
      {dark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}
```
> El estado inicial ya lo fija el script inline de la Tanda 0; el `useEffect`
> solo **lee** lo aplicado. No escribas la clase en el render: causaría flash.

**`src/layouts/AppLayout.astro`** — recibe `title`, exige `Astro.locals.user`
(el middleware ya lo garantiza) y pinta:
- Header: logo, nav (`/app` "Hoy", `/progreso` "Progreso", `/ajustes` "Ajustes"),
  `<ThemeToggle client:load />`, menú de usuario con cerrar sesión.
- `<main class="mx-auto w-full max-w-3xl px-4 py-8">` + `<slot />`.

**`src/components/ui/`** — primitivas sin dependencias externas:
`Button.tsx` (variantes `primary` teal / `ghost` / `danger` rosa),
`Card.tsx` (`bg-surface border border-border rounded-card`),
`Stat.tsx`, `Toggle.tsx`.

### Reglas de diseño (aplican a todas las tandas siguientes)
- Fondo de página `bg-base`; tarjetas `bg-surface`; separadores `border-border`.
- `#0d9488` (primary) = acción. `#0284c7` (accent) = información y series de
  datos. `#e9437c` (alert) = pérdida/riesgo. Máximo **un** elemento en rosa por
  pantalla.
- Cero degradados llamativos, cero sombras fuertes: el contenido manda.
- Tipografía de una sola familia, jerarquía por peso y tamaño.

### Qué necesito de tu lado
Nada. Opcional: si quieres otra tipografía distinta a Inter, dímelo ahora.

### Criterio de aceptación
El toggle cambia el tema, sobrevive a un F5 y no produce parpadeo al cargar.

---

# TANDA 4 · Perfil y días comprometidos

### Objetivo
Que el usuario elija **qué días de la semana** se compromete a leer, su zona
horaria y su libro actual. Se crea el `ProfileDoc` y el `GameStateDoc` inicial.

### Dependencias
Ninguna nueva (usa `zod` de la Tanda 1).

### Archivos

**`src/lib/repos/profile.ts`**
```ts
import { col } from '@/lib/db/collections';
import type { ProfileDoc } from '@/lib/db/types';

const DEFAULTS = {
  timezone: import.meta.env.PUBLIC_DEFAULT_TIMEZONE ?? 'America/Bogota',
  scheduledDays: [1, 2, 3, 4, 5],
  dailyGoalMinutes: 10,
};

/** Crea el perfil si no existe. Idempotente. */
export async function ensureProfile(userId: string, tz?: string): Promise<ProfileDoc> {
  const c = await col.profiles();
  const now = new Date();
  await c.updateOne(
    { userId },
    {
      $setOnInsert: {
        userId,
        timezone: tz ?? DEFAULTS.timezone,
        scheduledDays: DEFAULTS.scheduledDays,
        dailyGoalMinutes: DEFAULTS.dailyGoalMinutes,
        currentBookTitle: null,
        onboardedAt: null,
        createdAt: now,
        updatedAt: now,
      },
    },
    { upsert: true },
  );
  return (await c.findOne({ userId }))!;
}
```

**`src/pages/api/profile.ts`** — `GET` devuelve el perfil; `PATCH` lo actualiza.
Validación Zod:
```ts
const PatchSchema = z.object({
  scheduledDays: z.array(z.number().int().min(1).max(7)).min(1).max(7)
    .transform((d) => [...new Set(d)].sort()),
  timezone: z.string().refine((tz) => {
    try { new Intl.DateTimeFormat('en', { timeZone: tz }); return true; } catch { return false; }
  }, 'Zona horaria inválida').optional(),
  dailyGoalMinutes: z.number().int().min(5).max(180).optional(),
  currentBookTitle: z.string().trim().max(160).nullable().optional(),
});
```
> Exigir **al menos 1 día**: un usuario con `scheduledDays: []` nunca podría
> perder ni ganar por compromiso y rompería la narrativa del juego.

**`src/components/ScheduleEditor.tsx`** (React, `client:load`)
- 7 chips L–M–X–J–V–S–D (valores ISO 1..7), multiselección.
- Input de libro actual (placeholder: `Influencia: La Psicología de la Persuasión`).
- Select de meta diaria: 10 / 15 / 20 / 30 min.
- Detecta la zona horaria con `Intl.DateTimeFormat().resolvedOptions().timeZone`
  y la envía en el primer `PATCH`.
- Guarda con `fetch('/api/profile', { method: 'PATCH', ... })`, muestra estado
  "Guardado ✓".

**`src/pages/ajustes.astro`** — usa `AppLayout`, llama a `ensureProfile` en el
frontmatter y pasa el perfil como prop al editor.

**Enganche en `/app`**: si `profile.onboardedAt === null`, `/app` redirige a
`/ajustes?onboarding=1` y el editor muestra copy de bienvenida. Al guardar por
primera vez se setea `onboardedAt`.

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
Cambiar los días en `/ajustes`, recargar, y ver la selección persistida en Mongo.

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
export function elapsedSeconds(s: ReadingSessionDoc, now = new Date()): number {
  const live = s.lastResumedAt ? Math.floor((+now - +s.lastResumedAt) / 1000) : 0;
  return s.accumulatedSeconds + Math.max(0, live);
}
```

### Endpoints

| Ruta | Método | Cuerpo | Efecto |
|---|---|---|---|
| `/api/sessions/start` | POST | `{ bookTitle? }` | Abandona cualquier sesión `running`/`paused` con más de 6 h de antigüedad; crea una nueva `running`. Si ya hay una activa reciente, la **devuelve** en vez de crear otra. |
| `/api/sessions/heartbeat` | POST | `{ sessionId, action: 'pause' \| 'resume' \| 'ping' }` | `pause`: suma el tramo a `accumulatedSeconds`, pone `lastResumedAt = null`. `resume`: `lastResumedAt = now`. `ping`: solo devuelve el estado (anti-desfase, cada 30 s). |
| `/api/sessions/finish` | POST | `{ sessionId }` | Cierra: `durationSeconds = elapsedSeconds()`, `status = 'completed'`, `endedAt = now`. **Devuelve el documento cerrado.** (En la Tanda 7 este endpoint además liquidará perritos.) |

Todos: `export const prerender = false;`, verifican `locals.user`, y comprueban
que `session.userId === locals.user.id` (nunca confíes en el `sessionId` del
cliente sin validar pertenencia).

**Regla anti-abuso**: en `finish`, si `durationSeconds < 60` la sesión se marca
`abandoned` y no cuenta para nada.

### `src/components/ReadingTimer.tsx`
Máquina de estados explícita: `idle → running ⇄ paused → finished`.
- `useRef` + `setInterval(1000)` solo para pintar; nunca para acumular verdad.
- Re-sincroniza con `heartbeat: 'ping'` cada 30 s y al volver a la pestaña
  (`document.visibilitychange`).
- `beforeunload` **no** llama a `finish` (perdería tiempo válido); la sesión
  queda abierta y `start` la recupera.
- Muestra `MM:SS`, un anillo de progreso hacia la meta diaria, y marcas visuales
  en 10 / 15 / 20 / 25 / 30 min (los umbrales de recompensa de la Tanda 6).
- Botones: **Empezar** (primary), **Pausar / Reanudar** (ghost),
  **Terminar sesión** (primary, deshabilitado bajo 60 s).

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
Recargar la página a mitad de sesión recupera el cronómetro en curso con el
tiempo correcto.

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
`package.json`: `"test": "vitest run"`.

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

/** Minutos que faltan para el siguiente escalón (null si ya está en el tope). */
export function nextRewardStep(minutes: number): { atMinutes: number; dogs: number } | null {
  const steps = [10, 15, 20, 25, 30];
  const next = steps.find((s) => minutes < s);
  return next ? { atMinutes: next, dogs: dogsForMinutes(next) } : null;
}
```

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
 * @param scheduledDays  ISO 1..7 comprometidos.
 * @param completedDays  Set de dayKeys con lectura suficiente (dogsAwarded > 0).
 * @param weekdayOf      dayKey -> ISO weekday.
 */
export function reconcile(
  state: GameState,
  todayKey: string,
  scheduledDays: number[],
  completedDays: Set<string>,
  weekdayOf: (dayKey: string) => number,
): { state: GameState; events: NewEvent[] } {
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

**Invariantes que deben cumplirse siempre** (afírmalos en los tests):
- `GAME.FLOOR_DOGS <= dogs <= capacity`
- `weekLosses <= weeklyLossCap(weekStartDogs)`
- `reconcile(reconcile(s, T, …).state, T, …)` no produce eventos nuevos.
- `lastReconciledDay < todayKey` siempre tras reconciliar.

### 6.6 Tests obligatorios — `src/lib/game/__tests__/`

`rewards.test.ts`
- `dogsForMinutes`: 0→0, 9→0, 10→1, 14→1, 15→2, 20→4, 25→7, 30→11, 90→11.
- Monotonía: `dogsForMinutes(n) <= dogsForMinutes(n+1)` para n en 0..120.

`penalties.test.ts`
- Semana desastrosa: 7 de 7 días fallados desde 7 perritos ⇒ termina en **2**
  (5 pérdidas, tope semanal), nunca en 0.
- Desde `dogs = 1`, un `miss` no baja de 1.

`engine.test.ts`
- Doble `settle` con los mismos minutos no duplica recompensa.
- Desborde: con `dogs = 7, capacity = 7`, leer 30 min ⇒ `dogs = 7`, `adopted = 11`,
  `capacity = 8`.
- **Escenario narrativo completo** (ver Apéndice B) reproducido paso a paso.

### Qué necesito de tu lado
Validar el balance antes de seguir. Si te parece duro o blando, los únicos
números que hay que tocar son los de `config.ts` — nada más cambia.

### Criterio de aceptación
`npm test` en verde. Cero imports de `mongodb` dentro de `src/lib/game/*`
excepto en `service.ts` (Tanda 7).

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

### 9.3 Despliegue en Vercel
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

**Regla para la IA desarrolladora:** no empieces una tanda sin que la anterior
cumpla su criterio de aceptación. Si una tanda te obliga a modificar código de
una anterior, hazlo, pero vuelve a validar el criterio de aquella antes de
continuar. Y ante cualquier duda de balance o de negocio, **pregunta en vez de
inventar un número**: los valores viven todos en `src/lib/game/config.ts`.
