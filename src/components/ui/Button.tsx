import { clsx } from 'clsx';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'ghost';
export type ButtonSize = 'sm' | 'md';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
}

/**
 * Uso del color (ver el sistema en `src/styles/global.css`):
 *  - `primary` → la acción principal de la pantalla. Solo una.
 *  - `ghost`   → acciones secundarias.
 *
 * No hay variante `danger`: existía sin un solo uso, así que nadie la había
 * visto renderizada ni sabía si sus contrastes aguantaban el tema oscuro. Cuando
 * haga falta una acción destructiva —un «Eliminar cuenta» en /ajustes—, se añade
 * entonces y se verifica con ella delante.
 */
const VARIANTS: Record<ButtonVariant, string> = {
  // `text-on-primary` en vez de `text-white`: en tema oscuro el relleno es un
  // teal claro y el blanco daría 2.49:1. El token ya resuelve cada tema.
  primary: 'bg-primary text-on-primary hover:bg-primary-hover',
  ghost: 'border border-border bg-surface text-text hover:border-primary hover:text-primary',
};

/**
 * Estado inactivo, con su propio color para que se vea a simple vista que el
 * botón no acepta clics.
 *
 * Se aplica **sustituyendo** las clases de la variante, no encima de ellas:
 * apilar `disabled:bg-…` sobre `bg-…` deja la resolución en manos del orden de
 * la cascada, y basta una variante de hover para que el resultado deje de ser
 * predecible. Como el componente ya conoce `disabled`, decidirlo aquí es
 * determinista.
 *
 * Los colores salen de los tokens (`muted` / `text-soft`), no de la paleta por
 * defecto de Tailwind: un gris fijo quedaría fuera de lugar en tema oscuro,
 * mientras que estos dos se invierten solos con el tema.
 */
const DISABLED = 'cursor-not-allowed border border-border bg-muted text-text-soft opacity-75';

const SIZES: Record<ButtonSize, string> = {
  sm: 'px-3.5 py-2 text-sm',
  md: 'px-5 py-2.5',
};

export default function Button({
  variant = 'primary',
  size = 'md',
  className,
  children,
  disabled,
  ...rest
}: Props) {
  return (
    <button
      disabled={disabled}
      className={clsx(
        'rounded-card font-medium transition',
        disabled ? DISABLED : VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
