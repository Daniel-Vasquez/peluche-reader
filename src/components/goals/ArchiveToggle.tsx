import { useState } from 'react';
import Button from '@/components/ui/Button';

interface Props {
  goalId: string;
  /** Nombre del objetivo: entra en el texto de confirmación. */
  label: string;
  /** Estado actual. Decide si el botón archiva o reactiva. */
  archived: boolean;
}

type Estado = 'idle' | 'confirmando' | 'trabajando';

/**
 * Archivar o reactivar un objetivo. El mismo componente sirve en los dos
 * sentidos porque la operación es simétrica: `PATCH { archived }`.
 *
 * **Variante `ghost`, no una `danger`.** Archivar no borra nada —las sesiones y
 * los eventos siguen donde estaban, y `/progreso` los sigue mostrando—, así que
 * pintarlo como destructivo mentiría. Además el sistema de diseño admite un solo
 * elemento `alert` por pantalla, y en Ajustes hay un acordeón por objetivo: tres
 * botones de alerta serían tres incumplimientos de la misma regla.
 *
 * La confirmación es en dos pasos **en línea**, sin `confirm()`. Un diálogo del
 * navegador bloquea el hilo, no se puede estilar y un lector de pantalla lo
 * anuncia fuera del contexto del objetivo que se está archivando. Reactivar no
 * confirma: no se pierde nada al reactivar por error.
 */
export default function ArchiveToggle({ goalId, label, archived }: Props) {
  const [estado, setEstado] = useState<Estado>('idle');
  const [error, setError] = useState<string | null>(null);

  async function enviar() {
    setEstado('trabajando');
    setError(null);

    try {
      const response = await fetch(`/api/goals/${goalId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived: !archived }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? 'No pudimos cambiar el estado de este objetivo.');
        setEstado('idle');
        return;
      }
      /*
       * Recarga en vez de actualizar el estado local. Archivar cambia las
       * pestañas de Progreso, los acordeones de Ajustes y la Vista de Hoy, y
       * todo eso se renderiza en el servidor: sincronizarlo a mano desde una
       * isla sería reimplementar la página en el cliente.
       */
      window.location.reload();
    } catch {
      setError('No pudimos contactar con el servidor. Inténtalo de nuevo.');
      setEstado('idle');
    }
  }

  if (archived) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={estado === 'trabajando'}
          onClick={enviar}
        >
          {estado === 'trabajando' ? 'Reactivando...' : 'Reactivar objetivo'}
        </Button>
        {error && (
          <p role="alert" className="text-sm text-alert-text">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div>
      {estado === 'confirmando' ? (
        <div>
          <p className="mb-3 text-sm text-text-soft">
            <span className="font-medium text-text">{label}</span> saldrá de la Vista de Hoy y
            dejará de costarte perritos. Su historial se conserva y podrás reactivarlo desde
            Progreso.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={estado !== 'confirmando'}
              onClick={enviar}
            >
              Sí, archivar
            </Button>
            <button
              type="button"
              className="min-h-11 text-sm font-medium text-text-soft hover:text-text"
              onClick={() => setEstado('idle')}
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={estado === 'trabajando'}
            onClick={() => setEstado('confirmando')}
          >
            {estado === 'trabajando' ? 'Archivando...' : 'Archivar objetivo'}
          </Button>
          <p className="text-sm text-text-soft">No se borra nada; se puede reactivar.</p>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-3 text-sm text-alert-text">
          {error}
        </p>
      )}
    </div>
  );
}
