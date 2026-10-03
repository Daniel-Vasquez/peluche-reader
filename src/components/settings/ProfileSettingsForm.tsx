import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import Button from '@/components/ui/Button';
import Field from '@/components/ui/Field';
import { authClient } from '@/lib/auth-client';
import { checkName, NAME_MAX_LENGTH, NAME_MIN_LENGTH } from '@/lib/name';

interface Props {
  initialName: string;
  initialTimezone: string;
}

const ERROR_ID = 'perfil-error';

/**
 * Ajustes de la CUENTA: nombre y zona horaria.
 *
 * Fuera de los acordeones, porque no son de ningún objetivo. Antes vivían dentro
 * del formulario de días, lo que hacía imposible repetir ese formulario por
 * objetivo sin duplicar también el nombre del usuario.
 */
export default function ProfileSettingsForm({ initialName, initialTimezone }: Props) {
  const [name, setName] = useState(initialName);
  const [savedName, setSavedName] = useState(initialName);
  const [isSaving, setIsSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  /** Zona horaria real del navegador: si el usuario viaja, la cuenta le sigue. */
  const browserTimezone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || initialTimezone,
    [initialTimezone],
  );
  const timezoneChanged = browserTimezone !== initialTimezone;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSaving) return;

    const nameCheck = checkName(name);
    if (!nameCheck.ok) {
      setError(nameCheck.error);
      return;
    }

    setIsSaving(true);
    setJustSaved(false);
    setError(null);

    try {
      const nameChanged = nameCheck.name !== savedName;
      if (nameChanged) {
        const { error: nameError } = await authClient.updateUser({ name: nameCheck.name });
        if (nameError) {
          setError(nameError.message ?? 'No pudimos guardar tu nombre.');
          return;
        }
        // La sesión va cacheada en la cookie 5 minutos: sin esta llamada el
        // servidor seguiría sirviendo el nombre anterior.
        await authClient.getSession({ query: { disableCookieCache: true } });
      }

      const response = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timezone: browserTimezone }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? 'No pudimos guardar tus ajustes.');
        return;
      }

      setSavedName(nameCheck.name);
      setName(nameCheck.name);
      setJustSaved(true);

      if (nameChanged) {
        // El saludo y la cabecera los rinde el servidor; se reponen sin sacar al
        // usuario de /ajustes.
        const { navigate } = await import('astro:transitions/client');
        void navigate(window.location.pathname);
      }
    } catch {
      setError('No pudimos contactar con el servidor. Inténtalo de nuevo.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-6">
      <Field
        id="perfil-name"
        label="Tu nombre"
        hint="Con esto te saludamos en toda la app."
        invalid={error !== null && /nombre/i.test(error)}
        errorId={ERROR_ID}
      >
        {(field) => (
          <input
            {...field}
            type="text"
            autoComplete="name"
            required
            minLength={NAME_MIN_LENGTH}
            maxLength={NAME_MAX_LENGTH}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setJustSaved(false);
            }}
          />
        )}
      </Field>

      <div className="rounded-card border border-border bg-muted px-3.5 py-2.5 text-sm">
        <p className="text-text-soft">
          Zona horaria: <span className="font-medium text-text">{browserTimezone}</span>
        </p>
        {timezoneChanged && (
          <p className="mt-1 text-text-soft">
            Distinta de la guardada ({initialTimezone}). Se actualizará al guardar.
          </p>
        )}
      </div>

      {error && (
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

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={isSaving}>
          {isSaving ? 'Guardando cambios...' : 'Guardar cambios'}
        </Button>
        {justSaved && (
          <p role="status" className="text-sm font-medium text-primary">
            Guardado ✓
          </p>
        )}
      </div>
    </form>
  );
}
