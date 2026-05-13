"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

type Theme = "light" | "dark";

function getInitialTheme(): Theme {
  if (typeof window === "undefined") return "light";
  return window.localStorage.getItem("theme") === "dark" ? "dark" : "light";
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const initial = getInitialTheme();
    document.documentElement.classList.toggle("dark", initial === "dark");
    setTheme(initial);
    setMounted(true);
  }, []);

  const toggleTheme = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    document.documentElement.classList.toggle("dark", next === "dark");
    window.localStorage.setItem("theme", next);
    setTheme(next);
  };

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] px-3 py-2 text-[10px] font-black uppercase tracking-widest text-[var(--text)] transition hover:border-[#10b981]/50 hover:text-[#10b981]"
      title="Cambiar tema"
      aria-label="Cambiar tema claro u oscuro"
    >
      {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
      <span>{mounted && theme === "dark" ? "Tema claro" : "Tema oscuro"}</span>
    </button>
  );
}
