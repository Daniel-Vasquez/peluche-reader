/** Helpers compartidos por los endpoints JSON de `src/pages/api/`. */

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const unauthorized = () => json({ error: 'No autenticado.' }, 401);
export const badRequest = (message: string) => json({ error: message }, 400);
export const notFound = (message: string) => json({ error: message }, 404);

/** Lee y parsea el cuerpo JSON. Devuelve `null` si no es JSON válido. */
export async function readJson(request: Request): Promise<unknown | null> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
