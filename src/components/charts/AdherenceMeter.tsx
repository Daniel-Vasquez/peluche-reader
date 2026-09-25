import { useChartTheme } from '@/lib/chart-theme';

interface Props {
  /** Proporción 0..1, o `null` si todavía no hay días programados cerrados. */
  adherence: number | null;
  completed: number;
  total: number;
}

/**
 * Adherencia al compromiso.
 *
 * Es **una sola razón contra un límite**, así que va como medidor, no como
 * gráfica circular: un donut de dos porciones es más tinta para el mismo dato.
 * La pista sin rellenar es un paso más claro de la misma rampa, para que el
 * estado se lea a lo largo de toda la barra.
 */
export default function AdherenceMeter({ adherence, completed, total }: Props) {
  const theme = useChartTheme();

  if (adherence === null) {
    return (
      <p className="text-sm text-text-soft">
        Todavía no ha cerrado ningún día programado: la adherencia aparece mañana.
      </p>
    );
  }

  const percent = Math.round(adherence * 100);

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        {/* Cifra grande: figuras proporcionales, no tabulares. */}
        <p className="text-2xl font-semibold text-text">{percent}%</p>
        <p className="text-sm text-text-soft">
          {completed} de {total} días cumplidos
        </p>
      </div>

      <div
        role="meter"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Adherencia: ${percent} por ciento, ${completed} de ${total} días programados`}
        className="mt-2 h-2.5 w-full overflow-hidden rounded-full"
        style={{ backgroundColor: theme.ramp[0], opacity: 0.35 }}
      >
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{ width: `${percent}%`, backgroundColor: theme.ramp[2] }}
        />
      </div>
    </div>
  );
}
