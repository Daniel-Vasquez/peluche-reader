import { useMemo, useState, type FormEvent } from 'react';
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

const inputClass =
  'w-full rounded-card border border-border bg-surface px-3.5 py-2.5 text-text ' +
  'placeholder:text-text-soft transition focus:border-primary focus:outline-none';

type Status = 'idle' | 'saving' | 'saved';

/** Inicio de la app con sesión. Destino tras guardar. */
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
  const [name, setName] = useState(initialName);
  const [days, setDays] = useState<IsoWeekday[]>(initialScheduledDays);
  const [goal, setGoal] = useState(initialDailyGoalMinutes);
  const [book, setBook] = useState(initialBookTitle ?? '');
  const [status, setStatus] = useState<Status>('idle');
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

  function toggleDay(day: IsoWeekday) {
    setStatus('idle');
    setDays((current) =>
      current.includes(day)
        ? current.filter((d) => d !== day)
        : [...current, day].sort((a, b) => a - b),
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === 'saving') return;

    const nameCheck = checkName(name);
    if (!nameCheck.ok) {
      setError(nameCheck.error);
      return;
    }
    if (days.length === 0) {
      setError('Elige al menos un día de la semana.');
      return;
    }

    setStatus('saving');
    setError(null);

    // El nombre vive en la colección de Better Auth, no en el perfil: se
    // actualiza por su API y solo si de verdad cambió.
    const nameChanged = nameCheck.name !== initialName;
    if (nameChanged) {
      const { error: nameError } = await authClient.updateUser({ name: nameCheck.name });
      if (nameError) {
        setError(nameError.message ?? 'No pudimos guardar tu nombre.');
        setStatus('idle');
        return;
      }

      // La sesión va cacheada en la cookie durante 5 minutos, así que
      // `updateUser` por sí solo NO refresca lo que ve el servidor: sin esta
      // llamada, recargar seguiría mostrando el nombre anterior. Pedir la sesión
      // con `disableCookieCache` la relee de MongoDB y reescribe la cookie.
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
      setStatus('idle');
      return;
    }

    setStatus('saved');

    // Navegación completa (no history.pushState) para que el servidor vuelva a
    // renderizar con el perfil y el nombre nuevos. Sustituye la entrada en el
    // historial: pulsar "atrás" desde el inicio no debe devolver al formulario
    // que el usuario ya envió.
    window.location.replace(HOME_PATH);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <fieldset>
        <label htmlFor="name" className="block text-sm font-medium">
          Tu nombre
        </label>
        <p className="mt-1 mb-2 text-sm text-text-soft">
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
            setStatus('idle');
          }}
          className={inputClass}
        />
      </fieldset>

      <fieldset>
        <legend className="text-sm font-medium">Días que te comprometes a leer</legend>
        <p className="mt-1 mb-3 text-sm text-text-soft">
          Cada día elegido en el que no leas te cuesta un perrito. Los días libres
          no penalizan.
        </p>

        <div className="flex flex-wrap gap-2">
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
            setStatus('idle');
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
            setStatus('idle');
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
          role="alert"
          className="rounded-card border border-alert/40 bg-alert/10 px-3.5 py-2.5 text-sm text-alert-text"
        >
          {error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={status !== 'idle'}>
          {status === 'saving'
            ? 'Guardando…'
            : status === 'saved'
              ? 'Guardado ✓'
              : onboarding
                ? 'Empezar a leer'
                : 'Guardar cambios'}
        </Button>
        {status === 'saved' && (
          <p role="status" className="text-sm text-text-soft">
            Volviendo al inicio…
          </p>
        )}
      </div>
    </form>
  );
}
