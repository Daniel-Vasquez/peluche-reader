import { useState } from 'react';
import { signOut } from '@/lib/auth-client';

/** Cierra la sesión y recarga: el middleware debe volver a evaluar las cookies. */
export default function SignOutButton() {
  const [pending, setPending] = useState(false);

  return (
    <button
      type="button"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        await signOut();
        window.location.href = '/';
      }}
      className="rounded-card border border-border bg-surface px-3.5 py-2 text-sm font-medium text-text-soft transition hover:border-primary hover:text-primary disabled:opacity-60"
    >
      {pending ? 'Saliendo…' : 'Cerrar sesión'}
    </button>
  );
}
