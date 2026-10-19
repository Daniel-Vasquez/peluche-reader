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
  /**
   * Encabezado del refugio. Por defecto "Tu refugio": en la pantalla de sesión
   * el `<h1>` ya dice de qué objetivo se trata, así que repetirlo sobra.
   */
  title?: string;
}

/**
 * El refugio: una casilla por plaza del aforo, más los que se fueron.
 *
 * Tres estados, y cada uno responde a una pregunta distinta: cuántos tengo
 * (ocupadas), cuánto me cabe (libres) y qué me ha costado la semana (perdidos).
 *
 * **Los perdidos no se deducen restando.** `capacity - dogs` son plazas vacías,
 * que pueden estarlo por una pérdida o porque el aforo acaba de crecer; y un
 * refugio lleno puede haber perdido dos y haberlos recuperado leyendo. La cifra
 * buena es `weekLosses`, que el motor acota con el tope semanal.
 *
 * Los **adoptados** son un cuarto grupo: perritos que desbordaron el aforo y
 * encontraron casa. Ya no ocupan plaza, así que van aparte y cierran la fila —el
 * recorrido va de lo que tienes, a lo que perdiste, a lo que diste en adopción—.
 * `adopted` es acumulado de toda la vida del objetivo y puede crecer sin límite,
 * por eso se conserva además la cifra en la lista de abajo: con cien iconos, el
 * número sigue siendo la lectura rápida.
 *
 * El estado **nunca** se comunica solo por color: hay leyenda con texto, `title`
 * en cada casilla, un `aria-label` con el recuento y una lista oculta.
 */
export default function Shelter({
  shelter: initialShelter,
  freshPenalties = [],
  title = 'Tu refugio',
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

  const CASILLA = 'grid h-11 w-11 place-items-center rounded-card border text-xl transition';

  return (
    <div>
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="font-semibold">{title}</h2>
        <p className="text-sm text-text-soft tabular-nums">
          {dogs} de {capacity}
        </p>
      </div>

      <div
        role="img"
        aria-label={
          `Refugio: ${dogs} perritos de ${capacity} plazas.` +
          (weekLosses > 0
            ? ` ${weekLosses} ${weekLosses === 1 ? 'se fue' : 'se fueron'} esta semana.`
            : '') +
          (adopted > 0 ? ` ${adopted} adoptados en total.` : '')
        }
        className="mt-4 flex flex-wrap items-center gap-2"
      >
        {slots.map((occupied, i) => {
          const isNew = occupied && i >= dogs - justGained;
          return (
            <span
              key={i}
              aria-hidden
              title={occupied ? 'En refugio' : 'Plaza libre'}
              style={isNew ? { animationDelay: `${(i - (dogs - justGained)) * 60}ms` } : undefined}
              className={clsx(
                CASILLA,
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

        {/*
          Los que se fueron esta semana, separados del aforo por un filete: no
          ocupan plaza, así que mezclarlos con la rejilla haría que las cuentas
          no cuadrasen a simple vista.

          Se apagan con `grayscale` y opacidad, no con el token `alert`: ese se
          reserva para el aviso de penalización de más abajo, y el sistema de
          diseño admite un solo elemento de alerta por pantalla.
        */}
        {weekLosses > 0 && (
          <>
            <span aria-hidden className="mx-1 w-px self-stretch bg-border" />
            {Array.from({ length: weekLosses }).map((_, i) => (
              <span
                key={`perdido-${i}`}
                aria-hidden
                title="Pasó a mejor vida"
                className={clsx(CASILLA, 'border-border bg-transparent opacity-50 grayscale')}
              >
                🐶
              </span>
            ))}
          </>
        )}

        {/*
          Los adoptados, uno por perrito. El icono es un perrito y no una casa:
          esta fila es la lista de los perritos, y la casa ya resume el total en
          las cifras de abajo.

          Fondo propio con el token `accent`: ni el relleno de marca de las
          plazas ocupadas —no están en el refugio— ni el apagado de los
          perdidos, porque esto es una recompensa.

          Cierran la fila a propósito: el recorrido va de lo que tienes, a lo que
          perdiste, a lo que diste en adopción, y termina en lo bueno.
        */}
        {adopted > 0 && (
          <>
            <span aria-hidden className="mx-1 w-px self-stretch bg-border" />
            {Array.from({ length: adopted }).map((_, i) => (
              <span
                key={`adoptado-${i}`}
                aria-hidden
                title="Adoptado"
                className={clsx(CASILLA, 'border-accent/40 bg-accent/10')}
              >
                🐶
              </span>
            ))}
          </>
        )}
      </div>

      {/* Leyenda: el color y la opacidad no pueden ser el único canal. */}
      <ul className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-soft">
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="h-3 w-3 rounded-[4px] border border-primary/40 bg-primary-soft" />
          En refugio ({dogs})
        </li>
        {capacity > dogs && (
          <li className="flex items-center gap-1.5">
            <span aria-hidden className="h-3 w-3 rounded-[4px] border border-dashed border-border bg-muted" />
            Plaza libre ({capacity - dogs})
          </li>
        )}
        {weekLosses > 0 && (
          <li className="flex items-center gap-1.5">
            <span aria-hidden className="h-3 w-3 rounded-[4px] border border-border opacity-50 grayscale" />
            Se {weekLosses === 1 ? 'fue' : 'fueron'} esta semana ({weekLosses})
          </li>
        )}
        {adopted > 0 && (
          <li className="flex items-center gap-1.5">
            <span aria-hidden className="h-3 w-3 rounded-[4px] border border-accent/40 bg-accent/10" />
            {adopted === 1 ? 'Adoptado' : 'Adoptados'} ({adopted})
          </li>
        )}
      </ul>

      {/* Detalle textual para lectores de pantalla: el color no basta. */}
      <ul className="sr-only">
        {slots.map((occupied, i) => (
          <li key={i}>{occupied ? `Plaza ${i + 1}: ocupada` : `Plaza ${i + 1}: vacía`}</li>
        ))}
        {Array.from({ length: weekLosses }).map((_, i) => (
          <li key={`perdido-${i}`}>Perrito {i + 1} que se fue esta semana</li>
        ))}
        {Array.from({ length: adopted }).map((_, i) => (
          <li key={`adoptado-${i}`}>Perrito {i + 1} adoptado</li>
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
        {/*
          Los adoptados son la recompensa acumulada, no una cifra más: llevan
          icono y el token `accent`, que el sistema reserva para información.
        */}
        <div className="flex justify-between gap-2 sm:block">
          <dt className="text-text-soft">Adoptados</dt>
          <dd className="font-medium text-accent-text tabular-nums">
            <span aria-hidden className="mr-1">
              🏡
            </span>
            {adopted}
          </dd>
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
