"use client";

import { useState } from "react";
import { Link2, Check } from "lucide-react";

interface ShareButtonProps {
  onShare?: () => Promise<boolean>;
  className?: string;
}

export default function ShareButton({ onShare, className = "" }: ShareButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleClick = async () => {
    if (copied) return;

    let ok = false;
    if (onShare) {
      ok = await onShare();
    } else {
      try {
        await navigator.clipboard.writeText(window.location.href);
        ok = true;
      } catch {
        ok = false;
      }
    }

    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest px-3 py-2 rounded-xl border transition-all ${
        copied
          ? "border-[#10b981]/40 bg-[#10b981]/10 text-[#10b981]"
          : "border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:text-[var(--text)]"
      } ${className}`}
      aria-label="Copiar link"
    >
      {copied ? (
        <>
          <Check size={12} />
          Copiado
        </>
      ) : (
        <>
          <Link2 size={12} />
          Compartir
        </>
      )}
    </button>
  );
}
