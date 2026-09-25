import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

const STORAGE_KEY = 'theme';

/**
 * Alterna entre tema claro y oscuro.
 *
 * El estado inicial lo aplica el script `is:inline` de `BaseLayout.astro` antes
 * del primer pintado; este componente solo **lee** lo ya aplicado. Escribir la
 * clase durante el render provocaría el parpadeo que ese script evita.
 *
 * Sin elección guardada se sigue la preferencia del sistema, y se reacciona a
 * sus cambios en vivo. En cuanto el usuario pulsa, su elección manda para siempre.
 */
export default function ThemeToggle() {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains('dark'));

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onSystemChange = (event: MediaQueryListEvent) => {
      if (localStorage.getItem(STORAGE_KEY)) return; // elección explícita: no tocar
      document.documentElement.classList.toggle('dark', event.matches);
      setIsDark(event.matches);
    };

    media.addEventListener('change', onSystemChange);
    return () => media.removeEventListener('change', onSystemChange);
  }, []);

  function toggle() {
    const next = !isDark;
    document.documentElement.classList.toggle('dark', next);
    localStorage.setItem(STORAGE_KEY, next ? 'dark' : 'light');
    setIsDark(next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={isDark}
      aria-label={isDark ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
      title={isDark ? 'Tema claro' : 'Tema oscuro'}
      className="rounded-full border border-border bg-surface p-2 text-text-soft transition hover:border-primary hover:text-primary"
    >
      {isDark ? <Sun size={18} aria-hidden /> : <Moon size={18} aria-hidden />}
    </button>
  );
}
