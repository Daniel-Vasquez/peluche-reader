# Peluche Reader

App web para crear el hábito de la lectura mediante gamificación: el usuario se
compromete a leer ciertos días de la semana y mantiene vivo un refugio de
perritos. Cada día programado sin leer cuesta un perrito; cada bloque de lectura
los recupera con una curva de recompensa ascendente.

La planificación técnica completa, dividida en tandas ejecutables, está en
[`planificacion.md`](./planificacion.md).

## Stack

- **Astro 7** (`output: 'server'`) + adaptador de **Vercel**
- **React 19** para los componentes interactivos
- **Tailwind CSS 4** (plugin de Vite)
- **MongoDB** con el driver nativo (sin mongoose)
- **Better Auth** para email + contraseña

## Puesta en marcha

```bash
cp .env.example .env     # y rellena los valores
npm install
npm run dev              # http://localhost:4321
```

## Scripts

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Build de producción (salida en `.vercel/output`) |
| `npm run typecheck` | `tsc --noEmit` sobre todo el proyecto |
| `npm test` | Vitest: 42 tests del motor de gamificación |
| `npm run preview` | **No funciona** con el adaptador de Vercel; usa `vercel dev` |
| `npm run db:init` | Crea los índices de MongoDB |
| `npm run db:reset` | Limpia las colecciones (requiere `ALLOW_DB_RESET=yes`) |
| `npm run db:seed` | Genera datos de demostración |

## Estado

- [x] **Tanda 0** · Scaffolding, adaptador de Vercel y sistema de diseño
- [x] **Tanda 1** · Capa de datos (MongoDB): conexión, tipos, índices y scripts
- [x] **Tanda 2** · Autenticación (Better Auth, email + contraseña)
- [x] **Tanda 3** · Shell de la app, tema claro/oscuro y primitivas de UI
- [x] **Tanda 4** · Perfil, días comprometidos y edición del nombre
- [x] **Tanda 5** · Cronómetro de sesión (tiempo autoritativo en el servidor)
- [x] **Tanda 6** · Motor de gamificación (lógica pura + 42 tests)
- [ ] Tanda 7 · Integración
- [ ] Tanda 8 · Dashboard de progreso
- [ ] Tanda 9 · Semilla, pulido y despliegue
