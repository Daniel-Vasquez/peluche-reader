import { useEffect, useState } from 'react';

/**
 * Colores de las gráficas, leídos de los tokens CSS en tiempo de ejecución.
 *
 * Recharts necesita valores concretos, no `var(--…)`, así que hay que
 * resolverlos. Leerlos del sistema de diseño —en vez de duplicar hexadecimales
 * en el código de las gráficas— es lo que hace que el toggle de tema las
 * recolore sin que ningún componente conozca dos paletas.
 */

export interface ChartTheme {
  /** Rampa secuencial, magnitud baja → alta. Cuatro pasos validados. */
  ramp: [string, string, string, string];
  /** Marca de una sola serie (barras, línea). */
  mark: string;
  /** Estado: día programado sin leer. Siempre acompañado de icono y etiqueta. */
  alert: string;
  /** Misma familia, con contraste de TEXTO: para símbolos y cifras pequeñas. */
  alertText: string;
  /** Celda sin lectura: ausencia de dato, no un valor bajo. */
  empty: string;
  grid: string;
  text: string;
  textSoft: string;
  surface: string;
}

const TOKENS = {
  ramp1: '--color-chart-1',
  ramp2: '--color-chart-2',
  ramp3: '--color-chart-3',
  ramp4: '--color-chart-4',
  mark: '--color-primary-bright',
  alert: '--color-alert',
  alertText: '--color-alert-text',
  empty: '--color-chart-empty',
  grid: '--color-chart-grid',
  text: '--color-text',
  textSoft: '--color-text-soft',
  surface: '--color-surface',
} as const;

function read(): ChartTheme {
  const styles = getComputedStyle(document.documentElement);
  const get = (name: string) => styles.getPropertyValue(name).trim();
  return {
    ramp: [get(TOKENS.ramp1), get(TOKENS.ramp2), get(TOKENS.ramp3), get(TOKENS.ramp4)],
    mark: get(TOKENS.mark),
    alert: get(TOKENS.alert),
    alertText: get(TOKENS.alertText),
    empty: get(TOKENS.empty),
    grid: get(TOKENS.grid),
    text: get(TOKENS.text),
    textSoft: get(TOKENS.textSoft),
    surface: get(TOKENS.surface),
  };
}

/** Valores del tema claro, para el primer render en servidor. */
const SERVER_FALLBACK: ChartTheme = {
  ramp: ['#21c6b0', '#0d9488', '#0f766e', '#115e59'],
  mark: '#0d9488',
  alert: '#e9437c',
  alertText: '#c02258',
  empty: '#eaedf2',
  grid: '#e6e9ef',
  text: '#16202e',
  textSoft: '#5b6675',
  surface: '#ffffff',
};

/**
 * Relee los tokens cuando cambia el tema. El toggle alterna la clase `dark` en
 * `<html>`, así que basta observar ese atributo.
 */
export function useChartTheme(): ChartTheme {
  const [theme, setTheme] = useState<ChartTheme>(SERVER_FALLBACK);

  useEffect(() => {
    setTheme(read());
    const observer = new MutationObserver(() => setTheme(read()));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });
    return () => observer.disconnect();
  }, []);

  return theme;
}

/** Paso de la rampa que corresponde a unos minutos leídos. */
export function rampStep(minutes: number, ramp: ChartTheme['ramp']): string | null {
  if (minutes <= 0) return null;
  if (minutes < 10) return ramp[0];
  if (minutes < 20) return ramp[1];
  if (minutes < 30) return ramp[2];
  return ramp[3];
}

/** Etiquetas de los tramos de la rampa, para la leyenda del mapa de calor. */
export const RAMP_BUCKETS = ['1–9 min', '10–19 min', '20–29 min', '30+ min'] as const;
