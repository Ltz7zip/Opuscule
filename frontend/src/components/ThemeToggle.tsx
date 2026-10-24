import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

type Theme = "dark" | "light";

/** The document already carries the resolved theme (SSR cookie or inline
 *  bootstrap script), so read it from the DOM instead of storage. This keeps
 *  the first client render consistent with the server-rendered markup. */
function currentTheme(): Theme {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  try {
    window.localStorage.setItem("opuscule-theme", theme);
  } catch {
    // Private mode or storage disabled: the DOM attribute still applies.
  }
  try {
    // SSR reads this cookie to emit the right data-theme on the next request.
    document.cookie = `opuscule-theme=${theme}; path=/; max-age=31536000; SameSite=Lax`;
  } catch {
    // cookies disabled: the client-side toggle still works for this page.
  }
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", theme === "light" ? "#ffffff" : "#18181b");
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => currentTheme());

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== "opuscule-theme") return;
      setTheme(event.newValue === "light" ? "light" : "dark");
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const toggle = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    applyTheme(next);
  };

  return (
    <button
      type="button"
      className="icon-btn theme-toggle"
      aria-label="切换深浅主题"
      title="切换深浅主题"
      onClick={toggle}
    >
      {/* Both icons render on the server; CSS picks the visible one from
          [data-theme], so hydration never disagrees with the first paint. */}
      <Sun className="theme-icon theme-icon-sun" size={16} />
      <Moon className="theme-icon theme-icon-moon" size={16} />
    </button>
  );
}
