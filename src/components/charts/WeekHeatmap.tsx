import { useState } from 'react';
import { RAMP_BUCKETS, rampStep, useChartTheme } from '@/lib/chart-theme';
import type { DayPoint, WeekRow } from '@/lib/progress-summary';
import { WEEKDAY_LABELS, type IsoWeekday } from '@/lib/time';

interface Props {
  weeks: WeekRow[];
}

const DAYS: IsoWeekday[] = [1, 2, 3, 4, 5, 6, 7];

/**
 * Ocho semanas de lectura en rejilla.
 *
 * Aquí el color **es** el dato, así que usa la rampa secuencial de verdad: un
 * solo tono, más magnitud = más oscuro (más claro en tema oscuro). La leyenda
 * de tramos es obligatoria porque nada más comunica la escala.
 *
 * Se construye con CSS en vez de Recharts: es una rejilla, no un sistema de ejes.
 */
export default function WeekHeatmap({ weeks }: Props) {
  const theme = useChartTheme();
  const [hovered, setHovered] = useState<DayPoint | null>(null);

  return (
    <div>
      <div className="overflow-x-auto">
        <div className="inline-grid grid-cols-[auto_repeat(7,minmax(0,1fr))] gap-1">
          <span aria-hidden />
          {DAYS.map((d) => (
            <span key={d} className="pb-1 text-center text-xs text-text-soft">
              {WEEKDAY_LABELS[d].short}
            </span>
          ))}

          {weeks.map((week) => (
            <div key={week.weekKey} className="contents">
              <span className="pr-2 text-right text-xs text-text-soft tabular-nums">
                {week.label}
              </span>
              {week.days.map((day, i) => {
                if (!day) {
                  return <span key={i} aria-hidden className="h-7 w-7 sm:h-8 sm:w-8" />;
                }
                const fill = rampStep(day.minutes, theme.ramp);
                const missed = day.outcome === 'missed';
                return (
                  <button
                    key={day.dayKey}
                    type="button"
                    onMouseEnter={() => setHovered(day)}
                    onMouseLeave={() => setHovered(null)}
                    onFocus={() => setHovered(day)}
                    onBlur={() => setHovered(null)}
                    // El nombre accesible lleva el dato completo: el color nunca
                    // es el único canal.
                    aria-label={`${day.dayKey}: ${day.minutes} minutos${
                      missed ? ', día programado sin leer' : ''
                    }`}
                    className="grid h-7 w-7 place-items-center rounded-[4px] text-[10px] leading-none transition sm:h-8 sm:w-8"
                    style={{
                      backgroundColor: fill ?? theme.empty,
                      // `alertText`, no `alert`: el ✕ es un símbolo pequeño y
                      // sobre la celda vacía el tono de marca solo daba 3.22:1.
                      color: missed ? theme.alertText : 'transparent',
                      // Anillo del color de la superficie: separa sin añadir
                      // tinta con peso de dato.
                      boxShadow: `0 0 0 2px ${theme.surface}`,
                    }}
                  >
                    {missed ? '✕' : ''}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-text-soft">
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="inline-block h-3 w-3 rounded-[3px]"
            style={{ backgroundColor: theme.empty }}
          />
          Sin leer
        </span>
        {theme.ramp.map((color, i) => (
          <span key={color} className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="inline-block h-3 w-3 rounded-[3px]"
              style={{ backgroundColor: color }}
            />
            {RAMP_BUCKETS[i]}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <span aria-hidden style={{ color: theme.alertText }}>
            ✕
          </span>
          Día programado sin leer
        </span>
      </div>

      <p role="status" className="mt-2 min-h-5 text-sm text-text-soft">
        {hovered
          ? `${hovered.dayKey}: ${hovered.minutes} min${
              hovered.dogsAwarded > 0 ? ` · ${hovered.dogsAwarded} 🐶` : ''
            }${hovered.outcome === 'missed' ? ' · día programado sin leer' : ''}`
          : ''}
      </p>
    </div>
  );
}
