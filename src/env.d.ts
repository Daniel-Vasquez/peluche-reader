/// <reference types="astro/client" />

import type { SessionUser, Session } from '@/lib/auth';

declare global {
  namespace App {
    interface Locals {
      /** Usuario autenticado, o `null`. Lo resuelve `src/middleware.ts`. */
      user: SessionUser | null;
      /** Sesión activa, o `null`. */
      session: Session['session'] | null;
    }
  }
}

interface ImportMetaEnv {
  readonly PUBLIC_BETTER_AUTH_URL: string;
  readonly PUBLIC_SITE_URL: string;
  readonly PUBLIC_DEFAULT_TIMEZONE: string;
  readonly PUBLIC_APP_NAME: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
