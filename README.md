# Peluche Reader

App web para crear el hábito de la lectura mediante gamificación.

El usuario elige **qué días de la semana se compromete a leer** y cuida un refugio
de perritos. Cada día comprometido que no lee, un perrito se va. Cada sesión de
lectura los trae de vuelta, con una curva de recompensa que crece cuanto más
larga es la sesión.

La idea es que el castigo cree urgencia y la curva ascendente cree el «un bloque
más» que alarga la sesión — y que recuperarse siempre sea más rápido que caer.

---

## Cómo funciona el juego

Todos los números viven en [`src/lib/game/config.ts`](./src/lib/game/config.ts),
que es la **única fuente de verdad del balance**. Si una cifra aparece en otro
sitio, es un error.

### Recompensa

Se calcula sobre los **minutos del día**, no por sesión: tres sesiones de 7
minutos no valen 0. Los primeros 10 minutos dan 1 perrito, y cada bloque extra de
5 minutos vale **uno más que el bloque anterior**.

| Minutos en el día | 10 | 15 | 20 | 25 | 30 o más |
|---|---:|---:|---:|---:|---:|
| **Perritos** | 1 | 2 | 4 | 7 | 11 |
| Gana el bloque | +1 | +1 | +2 | +3 | +4 |

A partir de 30 minutos la recompensa no crece. Si el refugio está lleno, los
perritos extra pasan a **adoptados** (marcador histórico) y cada 10 adopciones
amplían el aforo en 1, hasta 21.

### Penalización

Cada día comprometido sin leer cuesta 1 perrito, con **dos frenos deliberados**:

- **Tope semanal**: como máximo se pierde el 60 % de los perritos que había al
  abrir la semana. Empezando con 7 → `ceil(7 × 0.6) = 5`, así que fallar los siete
  días deja el refugio en **2**, no en 0.
- **Piso absoluto de 1**: Peluche nunca muere. Es el punto desde el que siempre se
  puede remontar, porque 10 minutos bastan para +1.

Una sola sesión de 20 minutos repone cuatro días fallados.

### Cuándo se cobran las penalizaciones

No hay cron. Los días cerrados se liquidan **de forma perezosa** la próxima vez
que el usuario entra a la app (`syncOnVisit`). El día en curso **nunca se juzga**:
siempre se puede salvar.

---

## Stack

| Capa | Elección | Por qué |
|---|---|---|
| Framework | **Astro 7** (`output: 'server'`) | Islas: React solo donde hay interacción |
| UI | **React 19** + **Tailwind 4** | |
| Base de datos | **MongoDB**, driver nativo | Better Auth necesita un `Db` nativo; mongoose implicaría un segundo pool en serverless |
| Auth | **Better Auth** + `@better-auth/mongo-adapter` | Correo + contraseña, sin verificación ni 2FA |
| Gráficas | **Recharts** | 95 KB gzip, cargado solo en `/progreso` |
| Despliegue | **Vercel** | |

---

## Puesta en marcha

Requiere **Node 24** (`engines.node: "24.x"`), la misma versión con la que Vercel
construye y ejecuta las funciones. Con otra, `npm install` avisa `EBADENGINE` pero
el proyecto funciona.

```bash
cp .env.example .env     # rellena los valores, SIN comillas
npm install
npm run db:init          # crea los 7 índices de MongoDB
npm run dev              # http://localhost:4321
```

> ⚠️ **Los valores del `.env` van sin comillas.** El panel de Vercel no limpia lo
> que pegas: unas comillas dentro del valor hacen que `new URL()` lance
> «Invalid URL» (tumba el build y la autenticación) y que el driver no reconozca el
> esquema `mongodb+srv://`. La única excepción es un valor con `#` o espacios, que
> sí necesita comillas **en el `.env` local**, porque dotenv trataría el `#` como
> comentario; el código las quita al leer.

---

## Scripts

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Build de producción (salida en `.vercel/output`) |
| `npm run typecheck` | `tsc --noEmit` sobre todo el proyecto |
| `npm test` | Vitest: **45 tests** del motor de gamificación |
| `npm run db:init` | Crea los índices de MongoDB (idempotente) |
| `npm run db:reset` | Vacía las colecciones; exige `ALLOW_DB_RESET=yes` |
| `npm run db:seed` | Crea un usuario de demo con 8 semanas de historia |
| `npm run preview` | **No funciona** con el adaptador de Vercel; usa `vercel dev` |

### Datos de demostración

```bash
npm run db:seed
```

Simula 8 semanas día a día llamando a las mismas funciones que usa la app, así que
además sirve de test de integración del motor. Apunta `SEED_USER_EMAIL` a un correo
que **no** sea el tuyo y usa una contraseña de 8 caracteres o más: el script aborta
sin escribir nada si el correo ya está registrado, porque **nunca borra cuentas**.

---

## Mapa del proyecto

```
src/
├── middleware.ts            resuelve la sesión y protege /app, /progreso, /ajustes
├── lib/
│   ├── auth.ts              instancia de Better Auth (perezosa y cacheada)
│   ├── env.ts               lector de variables de entorno  ← lee siempre por aquí
│   ├── name.ts              reglas del nombre (cliente + servidor)
│   ├── time.ts              dayKey / weekKey / día ISO      ← única verdad temporal
│   ├── chart-theme.ts       colores de gráfica leídos de los tokens en runtime
│   ├── api.ts               helpers de respuesta JSON de los endpoints
│   ├── auth-client.ts       cliente de Better Auth para React
│   ├── sessions-view.ts     forma de la sesión que viaja al navegador
│   ├── shelter-events.ts    puente por evento DOM entre cronómetro y refugio
│   ├── progress-summary.ts  tipos del dashboard
│   ├── db/                  conexión, tipos de documento, accesores
│   ├── game/
│   │   ├── config.ts        constantes de balance  ← única fuente de verdad
│   │   ├── rewards.ts       curva de recompensa      (puro)
│   │   ├── penalties.ts     topes de penalización    (puro)
│   │   ├── engine.ts        reducer + reconciliación (puro)
│   │   ├── service.ts       orquesta el motor con MongoDB (impuro)
│   │   └── __tests__/       45 tests, incluida una prueba de fuzz
│   └── repos/               profile · sessions · progress · gameState · summary
├── components/              ui/ · auth/ · charts/ · icons/
│                            ReadingTimer · Shelter · ScheduleEditor · ThemeToggle
├── layouts/                 BaseLayout · AuthLayout · AppLayout
├── styles/global.css        tokens de color de los dos temas
├── env.d.ts                 tipos de Astro.locals
└── pages/
    ├── index.astro          landing (reconoce si hay sesión)
    ├── login · registro
    ├── app.astro            cronómetro + refugio
    ├── progreso.astro       dashboard
    ├── ajustes.astro        nombre, días, meta, libro
    ├── 404 · 500
    └── api/                 auth/[...all] · profile · sessions/* · progress/summary
```

### Colecciones de MongoDB

| Colección | Qué guarda | Índice |
|---|---|---|
| `user` · `account` · `session` | Better Auth | — |
| `profiles` | zona horaria, días comprometidos, meta, libro | `userId` único |
| `readingSessions` | cada sesión del cronómetro | `userId+dayKey`, `userId+status` |
| `dailyProgress` | agregado por día | **`userId+dayKey` único** |
| `gameState` | refugio, racha, semana en curso | `userId` único |
| `gameEvents` | historial de movimientos | `userId+createdAt` |

El índice único en `dailyProgress` es lo que hace seguro el `upsert` bajo
peticiones concurrentes.

---

## Decisiones que conviene conocer antes de tocar el código

**El servidor manda en el tiempo.** El cronómetro del navegador solo pinta. La
sesión guarda los tramos cerrados en `accumulatedSeconds` y el inicio del tramo en
curso en `lastResumedAt`; el tiempo real lo deriva el servidor. El cliente se
resincroniza cada 30 s y al volver a la pestaña, porque una pestaña dormida congela
`setInterval`.

**Todo lo que mueve perritos es idempotente.** `settleSession` paga solo la
diferencia contra lo ya otorgado ese día, así que liquidar dos veces la misma
sesión da 0. Entrar cien veces en un día no genera ni una escritura si no hay nada
que reconciliar.

**Las variables de entorno solo por `@/lib/env`**, nunca `process.env.X` directo:
`astro dev` carga el `.env` en `import.meta.env` y deja `process.env` vacío. La
única excepción es `astro.config.mjs`, que corre en Node puro antes de Vite.

**Better Auth guarda `userId` como `ObjectId`** en `user`, `session` y `account`;
nuestras colecciones lo guardan como `string`. Un `deleteMany({ userId: "..." })`
sobre las de Better Auth no borra nada y no avisa.

**El nombre manda en la personalización.** Se pide solo al registrarse (el login es
correo + contraseña). Se usa `firstName()` para saludos y el nombre completo para
títulos; el correo nunca aparece donde quepa el nombre.

---

## Sistema de diseño

Los colores se usan **siempre por token** (`bg-surface`, `text-text-soft`…), nunca
con hexadecimales ni con la paleta por defecto de Tailwind. Están en
[`src/styles/global.css`](./src/styles/global.css); el tema oscuro redefine los
mismos nombres bajo `.dark`, así que ningún componente conoce dos paletas ni
escribe variantes `dark:`.

Cada color de marca tiene **dos tokens**, y confundirlos rompe WCAG AA:

- **Texto pequeño** → `text-primary`, `text-accent-text`, `text-alert-text`
- **Cifras grandes (≥ 24 px) y gráficos** → `text-primary-bright`, `text-accent`, `text-alert`
- **Etiqueta sobre un relleno de marca** → `text-on-primary`, nunca `text-white`
- **Hover de relleno** → `hover:bg-primary-hover`, que oscurece en claro y aclara en oscuro

Los 26 pares de contraste (13 × 2 temas) están verificados en AA. La rampa
secuencial del mapa de calor (`--color-chart-1..4`) está validada aparte
(monotonía de luminosidad, ΔL ≥ 0.06, extremo claro ≥ 2:1, un solo matiz) en los
dos temas: **si cambias un paso, hay que revalidarla**.

Más convenciones en [`AGENTS.md`](./AGENTS.md) (`CLAUDE.md` es un enlace al mismo
archivo).

---

## Despliegue en Vercel

```bash
npm i -g vercel && vercel link && vercel --prod
```

Antes de publicar:

- [ ] Todas las variables del `.env.example` cargadas en Vercel (Production y
      Preview), **sin comillas**.
- [ ] `BETTER_AUTH_URL`, `PUBLIC_BETTER_AUTH_URL` y `PUBLIC_SITE_URL` con el
      dominio real y `https://`, no `localhost`.
- [ ] `ALLOW_DB_RESET` ausente o en `no`.
- [ ] MongoDB Atlas → Network Access con `0.0.0.0/0` (las funciones de Vercel no
      tienen IP fija).
- [ ] `npm run db:init` ejecutado **contra la base de producción**.
- [ ] Registro y login probados en el dominio final: las cookies `secure` no
      funcionan sobre `http`.

---

## Estado

Las diez tandas del plan están completas.

- [x] **Tanda 0** · Scaffolding, adaptador de Vercel y sistema de diseño
- [x] **Tanda 1** · Capa de datos: conexión, tipos, índices y scripts
- [x] **Tanda 2** · Autenticación con Better Auth
- [x] **Tanda 3** · Shell de la app, tema claro/oscuro y primitivas de UI
- [x] **Tanda 4** · Perfil, días comprometidos y edición del nombre
- [x] **Tanda 5** · Cronómetro con tiempo autoritativo en el servidor
- [x] **Tanda 6** · Motor de gamificación (lógica pura + 45 tests)
- [x] **Tanda 7** · Integración: las sesiones mueven perritos, refugio visual
- [x] **Tanda 8** · Dashboard de progreso con rampa de color validada
- [x] **Tanda 9** · Semilla de datos, páginas de error y despliegue

El plan técnico completo, con el detalle de cada tanda y las trampas encontradas
al ejecutarlas, está en [`planificacion.md`](./planificacion.md).

### Ideas para después

- Cambiar el aforo inicial para que la primera recompensa se vea en la rejilla: hoy
  `START_DOGS === BASE_CAPACITY`, así que un usuario nuevo empieza con el refugio
  lleno y sus primeros perritos van directos a «adoptados».
- Recuperación de contraseña (deliberadamente fuera del alcance inicial).
- Ilustraciones propias en `public/dogs/` en lugar del emoji.
