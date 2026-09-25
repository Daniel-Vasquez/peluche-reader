import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import ChartTooltip from '@/components/charts/ChartTooltip';
import { useChartTheme } from '@/lib/chart-theme';
import type { DayPoint } from '@/lib/progress-summary';

interface Props {
  data: DayPoint[];
  goalMinutes: number;
}

/**
 * Minutos leídos por día.
 *
 * **Una sola serie**, así que no lleva leyenda: el título ya dice qué se pinta.
 * Las barras van todas del mismo color —no un degradado por valor— porque
 * colorear por magnitud gastaría el canal de identidad en re-codificar lo que la
 * altura de la barra ya dice.
 *
 * Los días programados sin leer se marcan con el color de estado, que **nunca va
 * solo**: llevan etiqueta en la leyenda de estado y el dato en el tooltip.
 */
export default function MinutesBarChart({ data, goalMinutes }: Props) {
  const theme = useChartTheme();
  const missed = data.filter((d) => d.outcome === 'missed').length;

  return (
    <div>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -20 }}>
          {/* Rejilla horizontal, hairline y sólida. Nunca vertical ni discontinua. */}
          <CartesianGrid vertical={false} stroke={theme.grid} strokeWidth={1} />
          <XAxis
            dataKey="label"
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
            tick={{ fill: theme.textSoft, fontSize: 12 }}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            width={44}
            tick={{ fill: theme.textSoft, fontSize: 12 }}
            allowDecimals={false}
          />
          <Tooltip
            cursor={{ fill: theme.grid, opacity: 0.5 }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const point = payload[0]?.payload as DayPoint;
              return (
                <ChartTooltip
                  title={point.dayKey}
                  rows={[
                    {
                      key: 'min',
                      value: `${point.minutes} min`,
                      color: point.outcome === 'missed' ? theme.alert : theme.mark,
                      note:
                        point.outcome === 'missed'
                          ? 'día programado sin leer'
                          : point.dogsAwarded > 0
                            ? `${point.dogsAwarded} 🐶`
                            : point.scheduled
                              ? 'día programado'
                              : 'día libre',
                    },
                  ]}
                />
              );
            }}
          />
          {/* ≤24px de grosor y extremo superior redondeado 4px, cuadrado en la base. */}
          <Bar dataKey="minutes" maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false}>
            {data.map((point) => (
              <Cell
                key={point.dayKey}
                fill={point.outcome === 'missed' ? theme.alert : theme.mark}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-text-soft">
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="inline-block h-2.5 w-2.5 rounded-sm"
            style={{ backgroundColor: theme.mark }}
          />
          Minutos leídos
        </span>
        {missed > 0 && (
          <span className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="inline-block h-2.5 w-2.5 rounded-sm"
              style={{ backgroundColor: theme.alert }}
            />
            <span aria-hidden>✕</span> {missed} día{missed === 1 ? '' : 's'} programado
            {missed === 1 ? '' : 's'} sin leer
          </span>
        )}
        <span>Meta: {goalMinutes} min</span>
      </p>
    </div>
  );
}
