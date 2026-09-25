## Development

When starting the dev server, use background mode:

```
astro dev --background
```

Manage the background server with `astro dev stop`, `astro dev status`, and `astro dev logs`.

## Documentation

Full documentation: https://docs.astro.build

Consult these guides before working on related tasks:

- [Adding pages, dynamic routes, or middleware](https://docs.astro.build/en/guides/routing/)
- [Working with Astro components](https://docs.astro.build/en/basics/astro-components/)
- [Using React, Vue, Svelte, or other framework components](https://docs.astro.build/en/guides/framework-components/)
- [Adding or managing content](https://docs.astro.build/en/guides/content-collections/)
- [Adding styles or using Tailwind](https://docs.astro.build/en/guides/styling/)
- [Supporting multiple languages](https://docs.astro.build/en/guides/internationalization/)

## Este proyecto

Sigue [`planificacion.md`](./planificacion.md) tanda por tanda. No empieces una
tanda sin que la anterior cumpla su criterio de aceptación.

### Convenciones no negociables

1. **Alias de import**: `@/*` → `src/*`. Nunca rutas relativas largas (`../../`).
2. **`dayKey`**: toda fecha de negocio es un `string` `"YYYY-MM-DD"` calculado en
   la zona horaria del usuario. Única fuente de verdad: `src/lib/time.ts`.
   Nunca uses `new Date()` crudo para decidir "qué día es".
3. **Días de la semana**: ISO, `1 = lunes … 7 = domingo`. Nunca el `0..6` de
   `Date.getDay()`.
4. **Duraciones**: se persisten en **segundos** (entero). Los minutos solo
   existen en presentación y en el motor de recompensas.
5. **El servidor manda**: el cronómetro del navegador es solo UI. Los perritos se
   calculan exclusivamente en el servidor.
6. **Idempotencia**: toda función que otorgue o quite perritos debe poder
   ejecutarse dos veces con el mismo resultado.
7. **Balance del juego**: todos los números viven en `src/lib/game/config.ts`.
   Si dudas de un valor, pregunta en vez de inventarlo.
8. Nada de `any`; `strict: true`.

### Sistema de diseño

Los colores se usan **siempre** por token (`bg-surface`, `text-text-soft`,
`border-border`…), nunca con hex literales ni con colores de la paleta por
defecto de Tailwind. Los tokens están en `src/styles/global.css`; el tema oscuro
redefine los mismos nombres bajo `.dark`, por lo que ningún componente necesita
conocer dos paletas ni escribir variantes `dark:`.

- `primary` (teal) → acción: botones, foco, progreso.
- `accent` (azul) → información: enlaces, series de gráficas.
- `alert` (rosa) → pérdida o riesgo. Máximo **un** elemento por pantalla.
