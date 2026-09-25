import type { ShelterView } from '@/lib/game/service';

/**
 * Puente entre el cronómetro y el refugio.
 *
 * Son dos islas de Astro independientes, así que no comparten estado de React.
 * Un evento del `window` es el acoplamiento más ligero posible: el cronómetro
 * anuncia el resultado de la liquidación y el refugio se repinta sin recargar
 * la página (que perdería la animación de los perritos que vuelven).
 */

export const SHELTER_UPDATED = 'peluche:shelter-updated';

export interface ShelterUpdatedDetail {
  shelter: ShelterView;
  dogsGained: number;
  adoptedGained: number;
  minutesToday: number;
}

export function emitShelterUpdate(detail: ShelterUpdatedDetail): void {
  window.dispatchEvent(new CustomEvent<ShelterUpdatedDetail>(SHELTER_UPDATED, { detail }));
}

/** Suscribe un manejador y devuelve la función de limpieza. */
export function onShelterUpdate(
  handler: (detail: ShelterUpdatedDetail) => void,
): () => void {
  const listener = (event: Event) => {
    handler((event as CustomEvent<ShelterUpdatedDetail>).detail);
  };
  window.addEventListener(SHELTER_UPDATED, listener);
  return () => window.removeEventListener(SHELTER_UPDATED, listener);
}
