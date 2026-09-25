import { useEffect, useRef, useState, type FormEvent } from 'react';
import { signIn, signUp } from '@/lib/auth-client';
import Button from '@/components/ui/Button';
import Field from '@/components/ui/Field';
import { checkName, NAME_MAX_LENGTH, NAME_MIN_LENGTH } from '@/lib/name';

type Mode = 'login' | 'register';

interface Props {
  mode: Mode;
  /** Ruta a la que volver tras autenticarse (viene de `?next=`). */
  next?: string;
}

/**
 * Códigos de error de Better Auth → mensajes en español.
 * Los códigos están en `@better-auth/core/dist/error/codes.mjs`.
 */
const ERROR_MESSAGES: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: 'Correo o contraseña incorrectos.',
  INVALID_EMAIL: 'Ese correo no parece válido.',
  INVALID_PASSWORD: 'Contraseña incorrecta.',
  USER_NOT_FOUND: 'No existe ninguna cuenta con ese correo.',
  CREDENTIAL_ACCOUNT_NOT_FOUND: 'No existe ninguna cuenta con ese correo.',
  USER_ALREADY_EXISTS: 'Ya existe una cuenta con ese correo.',
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: 'Ya existe una cuenta con ese correo.',
  PASSWORD_TOO_SHORT: 'La contraseña debe tener al menos 8 caracteres.',
  PASSWORD_TOO_LONG: 'La contraseña es demasiado larga.',
  FAILED_TO_CREATE_USER: 'No pudimos crear la cuenta. Inténtalo de nuevo.',
  VALIDATION_ERROR: 'Revisa los datos introducidos.',
};

/** `id` del mensaje de error, compartido con el `aria-describedby` de los campos. */
const ERROR_ID = 'auth-error';

const COPY = {
  login: {
    submit: 'Entrar',
    submitting: 'Entrando…',
    switchText: '¿Aún no tienes cuenta?',
    switchLabel: 'Crear una',
    switchHref: '/registro',
  },
  register: {
    submit: 'Crear cuenta',
    submitting: 'Creando cuenta…',
    switchText: '¿Ya tienes cuenta?',
    switchLabel: 'Entrar',
    switchHref: '/login',
  },
} as const;

export default function AuthForm({ mode, next }: Props) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const copy = COPY[mode];

  /**
   * El mensaje de error recibe el foco al aparecer. Sin esto el foco se quedaba
   * en `<body>` tras un envío fallido y había que recorrer la página entera con
   * el teclado para volver al campo y corregir.
   */
  const errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  /** Campo al que apunta el error, para marcarlo con `aria-invalid`. */
  const invalidField: 'name' | 'credentials' | null = !error
    ? null
    : /nombre/i.test(error)
      ? 'name'
      : 'credentials';

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    // Mismas reglas que aplica el servidor en el hook de Better Auth.
    let cleanName = '';
    if (mode === 'register') {
      const nameCheck = checkName(name);
      if (!nameCheck.ok) {
        setError(nameCheck.error);
        return;
      }
      cleanName = nameCheck.name;
    }

    setPending(true);
    setError(null);

    const result =
      mode === 'register'
        ? await signUp.email({ email, password, name: cleanName })
        : await signIn.email({ email, password });

    if (result.error) {
      const code = result.error.code ?? '';
      setError(
        ERROR_MESSAGES[code] ??
          result.error.message ??
          'Algo falló. Inténtalo de nuevo.',
      );
      setPending(false);
      return;
    }

    // Recarga completa (no history.pushState) para que el middleware del
    // servidor vea la cookie de sesión recién creada.
    window.location.href = next && next.startsWith('/') ? next : '/app';
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      {mode === 'register' && (
        <Field
          id="name"
          label="¿Cómo te llamas?"
          hint="Así te llamaremos en la app y en tu refugio."
          invalid={invalidField === 'name'}
          errorId={ERROR_ID}
        >
          {(field) => (
            <input
              {...field}
              name="name"
              type="text"
              autoComplete="name"
              required
              minLength={NAME_MIN_LENGTH}
              maxLength={NAME_MAX_LENGTH}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Tu nombre"
            />
          )}
        </Field>
      )}

      <Field
        id="email"
        label="Correo electrónico"
        invalid={invalidField === 'credentials'}
        errorId={ERROR_ID}
      >
        {(field) => (
          <input
            {...field}
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tu@correo.com"
          />
        )}
      </Field>

      <Field
        id="password"
        label="Contraseña"
        hint={
          mode === 'register'
            ? 'No hay verificación por correo ni recuperación: guarda bien tu contraseña.'
            : undefined
        }
        invalid={invalidField === 'credentials'}
        errorId={ERROR_ID}
      >
        {(field) => (
          <input
            {...field}
            name="password"
            type="password"
            autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Mínimo 8 caracteres"
          />
        )}
      </Field>

      {error && (
        // `tabIndex={-1}` lo hace enfocable por programa sin meterlo en el orden
        // de tabulación.
        <p
          id={ERROR_ID}
          ref={errorRef}
          tabIndex={-1}
          role="alert"
          className="rounded-card border border-alert/40 bg-alert/10 px-3.5 py-2.5 text-sm text-alert-text"
        >
          {error}
        </p>
      )}

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? copy.submitting : copy.submit}
      </Button>

      <p className="text-center text-sm text-text-soft">
        {copy.switchText}{' '}
        <a href={copy.switchHref} className="font-medium text-primary hover:underline">
          {copy.switchLabel}
        </a>
      </p>
    </form>
  );
}
