import { useEffect, useRef, useState } from 'react';
import { clsx } from 'clsx';
import type { FreshPenalty, ShelterView } from '@/lib/game/service';
import { onShelterUpdate } from '@/lib/shelter-events';
import { WEEKDAY_LABELS, isoWeekdayOfDayKey } from '@/lib/time';

interface Props {
  /** Estado inicial que rindió el servidor. Luego lo actualiza el cronómetro. */
  shelter: ShelterView;
  /** Penalizaciones de esta visita. Se muestran una vez, sin dramatismo. */
  freshPenalties?: FreshPenalty[];
  ownerName: string;
}

/**
 * El refugio: una casilla por plaza del aforo, ocupada o vacía.
 *
 * El estado **nunca** se comunica solo por color: la rejilla lleva un
 * `aria-label` con el recuento y una lista oculta describe cada plaza.
 */
export default function Shelter({
  shelter: initialShelter,
  freshPenalties = [],
  ownerName,
}: Props) {
  const [shelter, setShelter] = useState(initialShelter);

  // El cronómetro avisa cuando una sesión liquida perritos.
  useEffect(() => onShelterUpdate((detail) => setShelter(detail.shelter)), []);

  const { dogs, capacity, adopted, streak, bestStreak, weekLosses, weeklyLossCap } = shelter;

  /**
   * Casillas que acaban de llenarse, para animarlas al entrar. Se calcula
   * comparando con el render anterior: así una recompensa nueva se nota y una
   * recarga normal no repite la animación.
   */
  const previousDogs = useRef(dogs);
  const [justGained, setJustGained] = useState(0);
  useEffect(() => {
    if (dogs > previousDogs.current) setJustGained(dogs - previousDogs.current);
    previousDogs.current = dogs;
    const id = window.setTimeout(() => setJustGained(0), 1600);
    return () => window.clearTimeout(id);
  }, [dogs]);

  const slots = Array.from({ length: capacity }, (_, i) => i < dogs);
  const lossesLeft = Math.max(0, weeklyLossCap - weekLosses);

  return (
    <div>
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="font-semibold">El refugio de {ownerName}</h2>
        <p className="text-sm text-text-soft tabular-nums">
          {dogs} de {capacity}
        </p>
      </div>

      <div
        role="img"
        aria-label={`Refugio: ${dogs} perritos de ${capacity} plazas.`}
        className="mt-4 flex flex-wrap gap-2"
      >
        {slots.map((occupied, i) => {
          const isNew = occupied && i >= dogs - justGained;
          return (
            <span
              key={i}
              aria-hidden
              style={isNew ? { animationDelay: `${(i - (dogs - justGained)) * 60}ms` } : undefined}
              className={clsx(
                'grid h-11 w-11 place-items-center rounded-card border text-xl transition',
                occupied
                  ? 'border-primary/40 bg-primary-soft'
                  : 'border-dashed border-border bg-muted',
                isNew && 'motion-safe:animate-[shelter-pop_500ms_ease-out_both]',
              )}
            >
              {occupied ? '🐶' : ''}
            </span>
          );
        })}
      </div>

      {/* Detalle textual para lectores de pantalla: el color no basta. */}
      <ul className="sr-only">
        {slots.map((occupied, i) => (
          <li key={i}>{occupied ? `Plaza ${i + 1}: ocupada` : `Plaza ${i + 1}: vacía`}</li>
        ))}
      </ul>

      {justGained > 0 && (
        <p role="status" className="mt-3 text-sm font-medium text-primary">
          +{justGained} {justGained === 1 ? 'perrito' : 'perritos'} a casa.
        </p>
      )}

      {freshPenalties.length > 0 && (
        <div className="mt-4 rounded-card border border-alert/40 bg-alert/10 px-3.5 py-3">
          <p className="text-sm font-medium text-alert-text">
            {freshPenalties.length === 1
              ? 'Un perrito se fue.'
              : `${freshPenalties.length} perritos se fueron.`}
          </p>
          <ul className="mt-1 space-y-0.5 text-sm text-text-soft">
            {freshPenalties.map((penalty) => (
              <li key={penalty.dayKey}>
                El {WEEKDAY_LABELS[isoWeekdayOfDayKey(penalty.dayKey)].long} no leíste.
              </li>
            ))}
          </ul>
        </div>
      )}

      <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
        <div className="flex justify-between gap-2 sm:block">
          <dt className="text-text-soft">Adoptados</dt>
          <dd className="font-medium tabular-nums">{adopted}</dd>
        </div>
        <div className="flex justify-between gap-2 sm:block">
          <dt className="text-text-soft">Aforo</dt>
          <dd className="font-medium tabular-nums">{capacity}</dd>
        </div>
        <div className="flex justify-between gap-2 sm:block">
          <dt className="text-text-soft">Racha</dt>
          <dd className="font-medium tabular-nums">
            {streak}
            {bestStreak > streak && (
              <span className="ml-1 font-normal text-text-soft">(récord {bestStreak})</span>
            )}
          </dd>
        </div>
        <div className="flex justify-between gap-2 sm:block">
          <dt className="text-text-soft">Margen semanal</dt>
          <dd className="font-medium tabular-nums">{lossesLeft}</dd>
        </div>
      </dl>
    </div>
  );
}
