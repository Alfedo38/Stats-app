"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";

const themeEvent = "moskprops:theme";
const isDark = () => document.documentElement.classList.contains("dark");
const serverIsDark = () => false;

function subscribe(listener: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key !== "theme" && event.key !== null) return;
    document.documentElement.classList.toggle("dark", event.newValue === "dark");
    listener();
  };
  window.addEventListener(themeEvent, listener);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(themeEvent, listener);
    window.removeEventListener("storage", onStorage);
  };
}

export default function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const dark = useSyncExternalStore(subscribe, isDark, serverIsDark);
  const toggleTheme = () => {
    const next = !isDark();
    document.documentElement.classList.toggle("dark", next);
    try { window.localStorage.setItem("theme", next ? "dark" : "light"); }
    catch { /* El tema sigue funcionando durante esta visita. */ }
    window.dispatchEvent(new Event(themeEvent));
  };

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] px-3 py-2 text-[10px] font-black uppercase tracking-widest text-[var(--text)] transition hover:border-[#10b981]/50 hover:text-[#10b981]"
      title="Cambiar tema"
      aria-label="Cambiar tema claro u oscuro"
      aria-pressed={dark}
    >
      {dark ? <Sun size={14} /> : <Moon size={14} />}
      {!compact && <span>{dark ? "Tema claro" : "Tema oscuro"}</span>}
    </button>
  );
}
