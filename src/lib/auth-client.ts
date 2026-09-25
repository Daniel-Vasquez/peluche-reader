import { createAuthClient } from 'better-auth/react';

/**
 * Cliente de Better Auth para los componentes React.
 *
 * `PUBLIC_BETTER_AUTH_URL` debe existir: el prefijo `PUBLIC_` es lo que permite
 * a Astro inyectarla en el bundle del navegador.
 */
export const authClient = createAuthClient({
  baseURL: import.meta.env.PUBLIC_BETTER_AUTH_URL,
});

export const { signIn, signUp, signOut, useSession } = authClient;
