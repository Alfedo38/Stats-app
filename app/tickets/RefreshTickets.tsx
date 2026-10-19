'use client';
import { useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';

export default function RefreshTickets({ className }: { className: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') startTransition(() => router.refresh());
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [router]);
  return <button type="button" className={className} disabled={pending}
    onClick={() => startTransition(() => router.refresh())} aria-live="polite">
    {pending ? 'Actualizando…' : 'Actualizar'}
  </button>;
}
