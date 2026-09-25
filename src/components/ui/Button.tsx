import { clsx } from 'clsx';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'ghost' | 'danger';
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
 *  - `danger`  → destructivo o de riesgo. Rosa; como máximo uno por pantalla.
 */
const VARIANTS: Record<ButtonVariant, string> = {
  // `text-on-primary` en vez de `text-white`: en tema oscuro el relleno es un
  // teal claro y el blanco daría 2.49:1. El token ya resuelve cada tema.
  primary: 'bg-primary text-on-primary hover:bg-primary-hover',
  ghost: 'border border-border bg-surface text-text hover:border-primary hover:text-primary',
  danger: 'border border-alert/40 bg-alert/10 text-alert-text hover:bg-alert/20',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'px-3.5 py-2 text-sm',
  md: 'px-5 py-2.5',
};

export default function Button({
  variant = 'primary',
  size = 'md',
  className,
  children,
  ...rest
}: Props) {
  return (
    <button
      className={clsx(
        'rounded-card font-medium transition',
        'disabled:cursor-not-allowed disabled:opacity-60',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
