import { useEffect, useRef, useState, type FormEvent } from 'react';
import { clsx } from 'clsx';
import Button from '@/components/ui/Button';
import Field from '@/components/ui/Field';
import type { GoalMetadata, GoalType } from '@/lib/db/types';
import { WEEKDAY_LABELS, type IsoWeekday } from '@/lib/time';

const ISO_DAYS: IsoWeekday[] = [1, 2, 3, 4, 5, 6, 7];

interface Props {
  goalId: string;
  type: GoalType;
  label: string;
  scheduledDays: IsoWeekday[];
  dailyGoalMinutes: number;
  metadata: GoalMetadata;
  goalOptions: readonly number[];
}

/**
 * Ajustes de UN objetivo.
 *
 * Antes esto vivía dentro de `ScheduleEditor` mezclado con el nombre del usuario
 * y la zona horaria, que son de la cuenta y no de ningún objetivo. Separarlos es
 * lo que permite repetir este formulario una vez por acordeón.
 */
export default function GoalSettingsForm({
  goalId,
  type,
  label: initialLabel,
  scheduledDays: initialDays,
  dailyGoalMinutes: initialGoal,
  metadata: initialMetadata,
  goalOptions,
}: Props) {
  const [label, setLabel] = useState(initialLabel);
  const [days, setDays] = useState<IsoWeekday[]>(initialDays);
  const [goal, setGoal] = useState(initialGoal);
  const [metadata, setMetadata] = useState<GoalMetadata>(initialMetadata);

  const [isSaving, setIsSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const errorId = `${goalId}-error`;
  const errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  const tocar = () => setJustSaved(false);

  function toggleDay(day: IsoWeekday) {
    tocar();
    setDays((actual) =>
      actual.includes(day)
        ? actual.filter((d) => d !== day)
        : [...actual, day].sort((a, b) => a - b),
    );
  }

  /** Actualiza un campo del metadato conservando el discriminante `type`. */
  function setMeta(campo: string, valor: string) {
    tocar();
    setMetadata((actual) => ({ ...actual, [campo]: valor.trim() || null }) as GoalMetadata);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSaving) return;

    if (label.trim().length === 0) {
      setError('El objetivo necesita un nombre.');
      return;
    }

    setIsSaving(true);
    setJustSaved(false);
    setError(null);

    try {
      const response = await fetch(`/api/goals/${goalId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: label.trim(),
          scheduledDays: days,
          dailyGoalMinutes: goal,
          metadata,
        }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? 'No pudimos guardar este objetivo.');
        return;
      }
      setJustSaved(true);
    } catch {
      setError('No pudimos contactar con el servidor. Inténtalo de nuevo.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-6">
      <Field id={`${goalId}-label`} label="Nombre del objetivo" errorId={errorId}>
        {(field) => (
          <input
            {...field}
            type="text"
            maxLength={60}
            value={label}
            onChange={(e) => {
              setLabel(e.target.value);
              tocar();
            }}
          />
        )}
      </Field>

      <fieldset>
        <legend className="text-sm font-medium">Días comprometidos</legend>
        <p className="mt-1 mb-3 text-sm text-text-soft">
          Cada día elegido en el que no cumplas te cuesta un perrito de este refugio.
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
            ? 'Sin días: este objetivo queda inactivo y no te costará perritos.'
            : `${days.length} día${days.length === 1 ? '' : 's'}: ` +
              days.map((d) => WEEKDAY_LABELS[d].long).join(', ')}
        </p>
      </fieldset>

      <Field
        id={`${goalId}-goal`}
        label="Meta por sesión"
        hint="Solo orienta el cronómetro; no cambia las recompensas."
      >
        {(field) => (
          <select
            {...field}
            value={goal}
            onChange={(e) => {
              setGoal(Number(e.target.value));
              tocar();
            }}
          >
            {goalOptions.map((minutes) => (
              <option key={minutes} value={minutes}>
                {minutes} minutos
              </option>
            ))}
          </select>
        )}
      </Field>

      {/*
        Los campos dependen del tipo, y los `id` llevan el `goalId` por delante:
        con tres acordeones en la misma página, tres campos `id="book"` romperían
        todas las etiquetas y los `aria-describedby`.
      */}
      {metadata.type === 'reading' && (
        <>
          <Field id={`${goalId}-book`} label="Libro actual" hint="Opcional.">
            {(field) => (
              <input
                {...field}
                type="text"
                maxLength={160}
                value={metadata.bookTitle ?? ''}
                onChange={(e) => setMeta('bookTitle', e.target.value)}
                placeholder="Influencia: La Psicología de la Persuasión"
              />
            )}
          </Field>
          <Field id={`${goalId}-author`} label="Autor" hint="Opcional.">
            {(field) => (
              <input
                {...field}
                type="text"
                maxLength={120}
                value={metadata.author ?? ''}
                onChange={(e) => setMeta('author', e.target.value)}
              />
            )}
          </Field>
        </>
      )}

      {metadata.type === 'english' && (
        <>
          <Field id={`${goalId}-course`} label="Curso o plataforma" hint="Opcional.">
            {(field) => (
              <input
                {...field}
                type="text"
                maxLength={160}
                value={metadata.courseName ?? ''}
                onChange={(e) => setMeta('courseName', e.target.value)}
                placeholder="Duolingo, Cambridge B2…"
              />
            )}
          </Field>
          <Field id={`${goalId}-level`} label="Nivel" hint="Opcional.">
            {(field) => (
              <input
                {...field}
                type="text"
                maxLength={40}
                value={metadata.level ?? ''}
                onChange={(e) => setMeta('level', e.target.value)}
                placeholder="B2"
              />
            )}
          </Field>
        </>
      )}

      {metadata.type === 'study' && (
        <>
          <Field id={`${goalId}-subject`} label="Materia" hint="Opcional.">
            {(field) => (
              <input
                {...field}
                type="text"
                maxLength={120}
                value={metadata.subject ?? ''}
                onChange={(e) => setMeta('subject', e.target.value)}
                placeholder="Cálculo II"
              />
            )}
          </Field>
          <Field id={`${goalId}-topic`} label="Tema actual" hint="Opcional.">
            {(field) => (
              <input
                {...field}
                type="text"
                maxLength={160}
                value={metadata.topic ?? ''}
                onChange={(e) => setMeta('topic', e.target.value)}
              />
            )}
          </Field>
        </>
      )}

      {error && (
        <p
          id={errorId}
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
