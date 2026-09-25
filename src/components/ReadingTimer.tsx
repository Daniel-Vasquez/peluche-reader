import { useCallback, useEffect, useRef, useState } from 'react';
import { clsx } from 'clsx';
import Button from '@/components/ui/Button';
import { REWARD_STEPS } from '@/lib/game/rewards';
import type { SessionView } from '@/lib/sessions-view';
import { formatDuration } from '@/lib/time';

/** Cada cuánto se resincroniza con el servidor mientras el reloj corre. */
const PING_INTERVAL_MS = 30_000;

interface Props {
  /** Sesión abierta que el servidor encontró al renderizar, si había alguna. */
  initialSession: SessionView | null;
  bookTitle: string | null;
  dailyGoalMinutes: number;
  minSessionSeconds: number;
  /** Segundos ya completados hoy en sesiones anteriores. */
  initialDaySeconds: number;
}

type Phase = 'idle' | 'running' | 'paused' | 'finished';

function phaseOf(session: SessionView | null): Phase {
  if (!session) return 'idle';
  if (session.status === 'running') return 'running';
  if (session.status === 'paused') return 'paused';
  return 'finished';
}

export default function ReadingTimer({
  initialSession,
  bookTitle,
  dailyGoalMinutes,
  minSessionSeconds,
  initialDaySeconds,
}: Props) {
  const [session, setSession] = useState<SessionView | null>(initialSession);
  const [displaySeconds, setDisplaySeconds] = useState(initialSession?.elapsedSeconds ?? 0);
  const [daySeconds, setDaySeconds] = useState(initialDaySeconds);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<{ counted: boolean; seconds: number } | null>(null);

  const phase = phaseOf(session);
  const running = phase === 'running';

  /** El id vive también en un ref para que los intervalos no capturen uno viejo. */
  const sessionIdRef = useRef<string | null>(initialSession?.id ?? null);
  useEffect(() => {
    sessionIdRef.current = session?.id ?? null;
  }, [session]);

  /**
   * Adopta lo que dice el servidor. Es la ÚNICA vía por la que el tiempo cambia
   * de verdad; el intervalo local solo pinta entre sincronizaciones.
   */
  const adopt = useCallback((next: SessionView) => {
    setSession(next);
    setDisplaySeconds(next.elapsedSeconds);
  }, []);

  const post = useCallback(
    async (url: string, body: Record<string, unknown>): Promise<unknown | null> => {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const parsed = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(parsed?.error ?? 'No pudimos contactar con el servidor.');
        return null;
      }
      setError(null);
      return response.json();
    },
    [],
  );

  // Reloj de pintado. No acumula verdad: cada tick suma 1 s al número mostrado,
  // y el siguiente `ping` corrige cualquier desvío.
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setDisplaySeconds((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, [running]);

  const ping = useCallback(async () => {
    const id = sessionIdRef.current;
    if (!id) return;
    const data = (await post('/api/sessions/heartbeat', { sessionId: id, action: 'ping' })) as
      | { session: SessionView }
      | null;
    if (data) adopt(data.session);
  }, [post, adopt]);

  // Resincronización periódica y al volver a la pestaña: `setInterval` se congela
  // cuando el navegador duerme la pestaña, así que el contador local se desvía.
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(ping, PING_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void ping();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [running, ping]);

  async function handleStart() {
    setBusy(true);
    setLastResult(null);
    const data = (await post('/api/sessions/start', { bookTitle })) as
      | { session: SessionView }
      | null;
    if (data) adopt(data.session);
    setBusy(false);
  }

  async function handleToggle() {
    const id = sessionIdRef.current;
    if (!id) return;
    setBusy(true);
    const data = (await post('/api/sessions/heartbeat', {
      sessionId: id,
      action: running ? 'pause' : 'resume',
    })) as { session: SessionView } | null;
    if (data) adopt(data.session);
    setBusy(false);
  }

  async function handleFinish() {
    const id = sessionIdRef.current;
    if (!id) return;
    setBusy(true);
    const data = (await post('/api/sessions/finish', { sessionId: id })) as
      | { session: SessionView; counted: boolean; daySeconds: number }
      | null;
    if (data) {
      setSession(null);
      setDisplaySeconds(0);
      setDaySeconds(data.daySeconds);
      setLastResult({ counted: data.counted, seconds: data.session.elapsedSeconds });
    }
    setBusy(false);
  }

  const goalSeconds = dailyGoalMinutes * 60;
  const progress = Math.min(1, goalSeconds > 0 ? displaySeconds / goalSeconds : 0);
  const canFinish = displaySeconds >= minSessionSeconds;
  const minutesNow = Math.floor(displaySeconds / 60);

  // Anillo de progreso: circunferencia = 2πr, con r = 54.
  const radius = 54;
  const circumference = 2 * Math.PI * radius;

  return (
    <div className="flex flex-col items-center">
      <div className="relative grid place-items-center">
        <svg width="140" height="140" viewBox="0 0 140 140" aria-hidden className="-rotate-90">
          <circle
            cx="70"
            cy="70"
            r={radius}
            fill="none"
            stroke="var(--color-muted)"
            strokeWidth="8"
          />
          <circle
            cx="70"
            cy="70"
            r={radius}
            fill="none"
            stroke="var(--color-primary-bright)"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - progress)}
            className="transition-[stroke-dashoffset] duration-1000 ease-linear"
          />
        </svg>

        <div className="absolute grid place-items-center">
          {/* aria-live apagado a propósito: anunciar cada segundo sería insufrible. */}
          <p role="timer" aria-live="off" className="text-3xl font-semibold tabular-nums">
            {formatDuration(displaySeconds)}
          </p>
          <p className="text-sm text-text-soft">de {dailyGoalMinutes} min</p>
        </div>
      </div>

      <ol className="mt-6 flex flex-wrap justify-center gap-2" aria-label="Escalones de recompensa">
        {REWARD_STEPS.map((step) => {
          const reached = minutesNow >= step.minutes;
          return (
            <li
              key={step.minutes}
              className={clsx(
                'rounded-card border px-2.5 py-1 text-sm tabular-nums transition',
                reached
                  ? 'border-primary bg-primary-soft font-medium text-primary'
                  : 'border-border text-text-soft',
              )}
            >
              {step.minutes} min
              <span className="ml-1 text-xs">
                {reached ? `· ${step.dogs} 🐶` : `→ ${step.dogs}`}
              </span>
            </li>
          );
        })}
      </ol>

      <p role="status" className="mt-4 min-h-6 text-sm text-text-soft">
        {phase === 'idle' && lastResult === null && 'Cuando quieras, empieza a leer.'}
        {phase === 'running' && 'Leyendo…'}
        {phase === 'paused' && 'En pausa. El tiempo no corre.'}
        {lastResult !== null &&
          (lastResult.counted
            ? `Sesión guardada: ${formatDuration(lastResult.seconds)}.`
            : `Sesión demasiado corta (menos de ${Math.floor(minSessionSeconds / 60)} min): no cuenta.`)}
      </p>

      {error && (
        <p
          role="alert"
          className="mt-3 rounded-card border border-alert/40 bg-alert/10 px-3.5 py-2.5 text-sm text-alert-text"
        >
          {error}
        </p>
      )}

      <div className="mt-5 flex flex-wrap justify-center gap-3">
        {phase === 'idle' ? (
          <Button onClick={handleStart} disabled={busy}>
            {busy ? 'Abriendo…' : 'Empezar a leer'}
          </Button>
        ) : (
          <>
            <Button variant="ghost" onClick={handleToggle} disabled={busy}>
              {running ? 'Pausar' : 'Reanudar'}
            </Button>
            <Button
              onClick={handleFinish}
              disabled={busy || !canFinish}
              title={canFinish ? undefined : `Necesitas al menos ${minSessionSeconds} segundos`}
            >
              Terminar sesión
            </Button>
          </>
        )}
      </div>

      {daySeconds > 0 && (
        <p className="mt-5 text-sm text-text-soft">
          Hoy llevas <span className="font-medium text-text">{formatDuration(daySeconds)}</span> de
          lectura.
        </p>
      )}
    </div>
  );
}
