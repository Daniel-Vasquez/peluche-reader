import type { ReactNode } from 'react';

/**
 * Un campo de formulario: etiqueta, texto de ayuda, control y el cableado de
 * accesibilidad que los une.
 *
 * Existe porque ese cableado es fácil de olvidar y aburrido de repetir: cada
 * campo necesita `htmlFor`, un `id` para la ayuda, `aria-invalid` cuando el
 * error le señala y un `aria-describedby` que enlace ayuda y error a la vez.
 * Estaba copiado en los dos formularios de la app, y cada corrección había que
 * acordarse de aplicarla dos veces.
 *
 * El control lo rinde quien llama, mediante una función: así `Field` no necesita
 * saber si es un `<input type="email">` o un `<select>`, ni recibir por props
 * `value`, `onChange`, `minLength` y todo lo demás.
 *
 *     <Field id="email" label="Correo electrónico" invalid={…} errorId="auth-error">
 *       {(props) => <input {...props} type="email" value={email} onChange={…} />}
 *     </Field>
 */

/** Props que `Field` calcula y el control debe aplicar tal cual. */
export interface FieldControlProps {
  id: string;
  className: string;
  'aria-invalid': true | undefined;
  'aria-describedby': string | undefined;
}

interface Props {
  id: string;
  label: string;
  /** Texto de ayuda bajo la etiqueta. Se enlaza solo por `aria-describedby`. */
  hint?: ReactNode;
  /** `true` cuando el mensaje de error del formulario señala a este campo. */
  invalid?: boolean;
  /** `id` del mensaje de error del formulario, para enlazarlo cuando aplique. */
  errorId?: string;
  children: (props: FieldControlProps) => ReactNode;
}

/**
 * Estilo compartido de los controles.
 *
 * Sin `focus:outline-none`: esa clase gana en especificidad a la regla global
 * `:focus-visible` y dejaría el campo sin ningún indicador de foco. El borde
 * teal es un extra, no el sustituto del anillo.
 */
export const FIELD_CONTROL_CLASS =
  'w-full rounded-card border border-border bg-surface px-3.5 py-2.5 text-text ' +
  'placeholder:text-text-soft transition focus:border-primary';

export default function Field({ id, label, hint, invalid, errorId, children }: Props) {
  const hintId = hint ? `${id}-hint` : null;

  // El orden importa: primero el error, que es lo que el usuario necesita oír.
  const describedBy = [invalid && errorId ? errorId : null, hintId]
    .filter(Boolean)
    .join(' ');

  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>

      {/* La ayuda va ANTES del control: se lee mientras se decide qué escribir. */}
      {hint && (
        <p id={hintId ?? undefined} className="mt-1 mb-2 text-sm text-text-soft">
          {hint}
        </p>
      )}

      <div className={hint ? undefined : 'mt-1.5'}>
        {children({
          id,
          className: FIELD_CONTROL_CLASS,
          'aria-invalid': invalid || undefined,
          'aria-describedby': describedBy || undefined,
        })}
      </div>
    </div>
  );
}
