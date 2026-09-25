import { useState } from 'react';
import Button from '@/components/ui/Button';
import { signOut } from '@/lib/auth-client';

/** Cierra la sesión y recarga: el middleware debe volver a evaluar las cookies. */
export default function SignOutButton() {
  const [pending, setPending] = useState(false);

  return (
    <Button
      variant="ghost"
      size="sm"
      // Siempre es un objetivo táctil, así que nunca por debajo de 44 px.
      className="min-h-11"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        await signOut();
        window.location.href = '/';
      }}
    >
      {pending ? 'Saliendo…' : 'Salir'}
    </Button>
  );
}
