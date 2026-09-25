import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { clsx } from 'clsx';
import Button from '@/components/ui/Button';
import { authClient } from '@/lib/auth-client';
import { checkName, NAME_MAX_LENGTH, NAME_MIN_LENGTH } from '@/lib/name';
import { WEEKDAY_LABELS, type IsoWeekday } from '@/lib/time';

const ISO_DAYS: IsoWeekday[] = [1, 2, 3, 4, 5, 6, 7];

interface Props {
  initialName: string;
  initialScheduledDays: IsoWeekday[];
  initialDailyGoalMinutes: number;
  initialBookTitle: string | null;
  initialTimezone: string;
  goalOptions: readonly number[];
  /** `true` cuando el usuario aún no ha guardado nunca sus ajustes. */
  onboarding: boolean;
}

/* Sin `focus:outline-none`: anulaba el anillo global de `:focus-visible`. */
const inputClass =
  'w-full rounded-card border border-border bg-surface px-3.5 py-2.5 text-text ' +
  'placeholder:text-text-soft transition focus:border-primary';

/** Inicio de la app con sesión. Solo se usa al terminar el onboarding. */
const HOME_PATH = '/app';

export default function ScheduleEditor({
  initialName,
  initialScheduledDays,
  initialDailyGoalMinutes,
  initialBookTitle,
  initialTimezone,
  goalOptions,
  onboarding,
}: Props) {
  const [isSaving, setIsSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  /**
   * Últimos valores confirmados por el servidor. Se actualizan al guardar con
   * éxito, y son contra lo que se compara `dirty`: así el aviso de "cambios sin
   * guardar" desaparece solo, sin recargar la página.
   */
  const [saved, setSaved] = useState({
    name: initialName,
    days: initialScheduledDays,
    goal: initialDailyGoalMinutes,
    book: initialBookTitle ?? '',
  });

  const [name, setName] = useState(initialName);
  const [days, setDays] = useState<IsoWeekday[]>(initialScheduledDays);
  const [goal, setGoal] = useState(initialDailyGoalMinutes);
  const [book, setBook] = useState(initialBookTitle ?? '');
  const [error, setError] = useState<string | null>(null);

  /**
   * Zona horaria real del navegador. Se envía siempre: si el usuario viaja o
   * cambia el reloj del sistema, la contabilidad de días debe seguirle.
   */
  const browserTimezone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || initialTimezone,
    [initialTimezone],
  );
  const timezoneChanged = browserTimezone !== initialTimezone;

  /** Punto 4: el error toma el foco al aparecer. */
  const errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  /**
   * Punto 8: ¿hay trabajo sin guardar?
   *
   * Se compara con los valores que rindió el servidor. El libro se normaliza a
   * cadena vacía porque el perfil lo guarda como `null`, y los días se comparan
   * por contenido, no por identidad del array.
   */
  const dirty =
    !isSaving &&
    (name.trim() !== saved.name.trim() ||
      goal !== saved.goal ||
      book.trim() !== saved.book.trim() ||
      days.length !== saved.days.length ||
      days.some((d, i) => d !== saved.days[i]));

  /*
   * Aviso del navegador al cerrar o recargar con cambios pendientes. No cubre la
   * navegación interna por enlaces —eso lo dice el indicador junto al botón—,
   * pero sí el caso más costoso: perder el trabajo al cerrar la pestaña.
   */
  useEffect(() => {
    if (!dirty) return;
    const avisar = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', avisar);
    return () => window.removeEventListener('beforeunload', avisar);
  }, [dirty]);

  function toggleDay(day: IsoWeekday) {
    setJustSaved(false);
    setDays((current) =>
      current.includes(day)
        ? current.filter((d) => d !== day)
        : [...current, day].sort((a, b) => a - b),
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSaving) return;

    const nameCheck = checkName(name);
    if (!nameCheck.ok) {
      setError(nameCheck.error);
      return;
    }
    if (days.length === 0) {
      setError('Elige al menos un día de la semana.');
      return;
    }

    setIsSaving(true);
    setJustSaved(false);
    setError(null);

    try {
      // El nombre vive en la colección de Better Auth, no en el perfil: se
      // actualiza por su API y solo si de verdad cambió.
      const nameChanged = nameCheck.name !== saved.name;
      if (nameChanged) {
        const { error: nameError } = await authClient.updateUser({ name: nameCheck.name });
        if (nameError) {
          setError(nameError.message ?? 'No pudimos guardar tu nombre.');
          return;
        }

        // La sesión va cacheada en la cookie durante 5 minutos, así que
        // `updateUser` por sí solo NO refresca lo que ve el servidor: sin esta
        // llamada, recargar seguiría mostrando el nombre anterior. Pedir la
        // sesión con `disableCookieCache` la relee de MongoDB y reescribe la
        // cookie.
        await authClient.getSession({ query: { disableCookieCache: true } });
      }

      const response = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scheduledDays: days,
          dailyGoalMinutes: goal,
          currentBookTitle: book,
          timezone: browserTimezone,
        }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? 'No pudimos guardar tus ajustes.');
        return;
      }

      // Guardado. El usuario se queda en /ajustes: editar no debería expulsarle
      // de la pantalla que estaba usando.
      setSaved({ name: nameCheck.name, days, goal, book });
      setName(nameCheck.name);
      setJustSaved(true);

      if (onboarding) {
        // Única excepción: al terminar el onboarding el usuario no tiene todavía
        // ningún camino a la app, así que se le lleva. `replace` evita que
        // "atrás" devuelva al formulario ya enviado.
        window.location.replace(HOME_PATH);
        return;
      }

      if (nameChanged) {
        // El saludo y el pie los rinde el servidor. Se vuelve a pedir la misma
        // ruta para que se actualicen, sin sacar al usuario de /ajustes.
        const { navigate } = await import('astro:transitions/client');
        void navigate(window.location.pathname);
      }
    } catch {
      setError('No pudimos contactar con el servidor. Inténtalo de nuevo.');
    } finally {
      // Pase lo que pase, el botón vuelve a su estado original.
      setIsSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <fieldset>
        <label htmlFor="name" className="block text-sm font-medium">
          Tu nombre
        </label>
        <p id="name-hint" className="mt-1 mb-2 text-sm text-text-soft">
          Con esto te saludamos y así se llama tu refugio.
        </p>
        <input
          id="name"
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
          aria-invalid={(error !== null && /nombre/i.test(error)) || undefined}
          aria-describedby={
            [error && /nombre/i.test(error) ? 'ajustes-error' : null, 'name-hint']
              .filter(Boolean)
              .join(' ')
          }
          className={inputClass}
        />
      </fieldset>

      <fieldset>
        <legend className="text-sm font-medium">Días que te comprometes a leer</legend>
        <p className="mt-1 mb-3 text-sm text-text-soft">
          Cada día elegido en el que no leas te cuesta un perrito. Los días libres
          no penalizan.
        </p>

        <div
          className="flex flex-wrap gap-2"
          aria-describedby={error && /día/i.test(error) ? 'ajustes-error' : undefined}
        >
          {ISO_DAYS.map((day) => {
            const selected = days.includes(day);
            return (
              <button
                key={day}
                type="button"
                onClick={() => toggleDay(day)}
                aria-pressed={selected}
                aria-label={WEEKDAY_LABELS[day].long}
                className={clsx(
                  'h-11 w-11 rounded-card border font-medium transition',
                  selected
                    ? 'border-primary bg-primary text-on-primary'
                    : 'border-border bg-surface text-text-soft hover:border-primary hover:text-primary',
                )}
              >
                {WEEKDAY_LABELS[day].short}
              </button>
            );
          })}
        </div>

        <p className="mt-3 text-sm text-text-soft">
          {days.length === 0
            ? 'Sin días elegidos.'
            : `${days.length} día${days.length === 1 ? '' : 's'} a la semana: ` +
              days.map((d) => WEEKDAY_LABELS[d].long).join(', ')}
        </p>
      </fieldset>

      <fieldset>
        <label htmlFor="goal" className="block text-sm font-medium">
          Meta por sesión
        </label>
        <p className="mt-1 mb-2 text-sm text-text-soft">
          Solo orienta el cronómetro; no cambia las recompensas.
        </p>
        <select
          id="goal"
          value={goal}
          onChange={(e) => {
            setGoal(Number(e.target.value));
            setJustSaved(false);
          }}
          className={inputClass}
        >
          {goalOptions.map((minutes) => (
            <option key={minutes} value={minutes}>
              {minutes} minutos
            </option>
          ))}
        </select>
      </fieldset>

      <fieldset>
        <label htmlFor="book" className="block text-sm font-medium">
          Libro actual
        </label>
        <p className="mt-1 mb-2 text-sm text-text-soft">Opcional.</p>
        <input
          id="book"
          type="text"
          maxLength={160}
          value={book}
          onChange={(e) => {
            setBook(e.target.value);
            setJustSaved(false);
          }}
          placeholder="Influencia: La Psicología de la Persuasión"
          className={inputClass}
        />
      </fieldset>

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
          id="ajustes-error"
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
          {isSaving
            ? 'Guardando cambios...'
            : onboarding
              ? 'Empezar a leer'
              : 'Guardar cambios'}
        </Button>

        {/* Un solo mensaje a la vez, en orden de relevancia. */}
        {justSaved && !dirty && (
          <p role="status" className="text-sm font-medium text-primary">
            Guardado ✓
          </p>
        )}
        {dirty && (
          <p role="status" className="text-sm text-text-soft">
            Tienes cambios sin guardar.
          </p>
        )}
      </div>
    </form>
  );
}
