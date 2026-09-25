import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import ChartTooltip from '@/components/charts/ChartTooltip';
import { useChartTheme } from '@/lib/chart-theme';
import type { DogsPoint } from '@/lib/progress-summary';

interface Props {
  data: DogsPoint[];
  capacity: number;
}

/**
 * Evolución del refugio. Una sola serie, así que sin leyenda.
 *
 * Línea de 2 px y relleno al 10 % —un lavado, no un bloque saturado—, con
 * crucero vertical: el lector apunta a una fecha, nunca a una línea de 2 px.
 */
export default function DogsAreaChart({ data, capacity }: Props) {
  const theme = useChartTheme();

  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -20 }}>
        <defs>
          <linearGradient id="dogsWash" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={theme.mark} stopOpacity={0.16} />
            <stop offset="100%" stopColor={theme.mark} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke={theme.grid} strokeWidth={1} />
        <XAxis
          dataKey="label"
          axisLine={false}
          tickLine={false}
          interval="preserveStartEnd"
          minTickGap={24}
          tick={{ fill: theme.textSoft, fontSize: 12 }}
        />
        <YAxis
          axisLine={false}
          tickLine={false}
          width={44}
          domain={[0, Math.max(capacity, 7)]}
          allowDecimals={false}
          tick={{ fill: theme.textSoft, fontSize: 12 }}
        />
        <Tooltip
          cursor={{ stroke: theme.grid, strokeWidth: 1 }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const point = payload[0]?.payload as DogsPoint;
            return (
              <ChartTooltip
                title={point.dayKey}
                rows={[
                  {
                    key: 'dogs',
                    value: `${point.dogs} 🐶`,
                    color: theme.mark,
                    note: 'en el refugio',
                  },
                ]}
              />
            );
          }}
        />
        <Area
          type="monotone"
          dataKey="dogs"
          stroke={theme.mark}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          fill="url(#dogsWash)"
          // Punto final de ≥8 px con anillo de 2 px del color de la superficie,
          // para que siga legible donde cruza la línea.
          dot={false}
          activeDot={{ r: 4, fill: theme.mark, stroke: theme.surface, strokeWidth: 2 }}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
