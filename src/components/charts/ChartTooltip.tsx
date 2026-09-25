import type { ReactNode } from 'react';

/**
 * Tooltip propio: el de Recharts ignora los tokens del tema y se vería blanco
 * sobre fondo oscuro.
 *
 * Jerarquía invertida respecto a la leyenda: aquí **el valor manda** y la
 * etiqueta es secundaria, porque el lector ya sabe qué serie mira y lo que
 * quiere es el número.
 */
interface Props {
  title: string;
  rows: { key: string; value: ReactNode; color?: string; note?: string }[];
}

export default function ChartTooltip({ title, rows }: Props) {
  return (
    <div className="rounded-card border border-border bg-surface px-3 py-2 shadow-sm">
      <p className="text-sm text-text-soft">{title}</p>
      {rows.map((row) => (
        <div key={row.key} className="mt-1 flex items-center gap-2">
          {row.color && (
            // Clave de línea, no caja: a esta densidad un bloque relleno es
            // tinta con peso de dato haciendo el trabajo de una etiqueta.
            <span
              aria-hidden
              className="inline-block h-0.5 w-3 rounded-full"
              style={{ backgroundColor: row.color }}
            />
          )}
          <span className="font-semibold text-text">{row.value}</span>
          {row.note && <span className="text-sm text-text-soft">{row.note}</span>}
        </div>
      ))}
    </div>
  );
}
