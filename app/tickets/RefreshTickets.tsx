'use client';
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
import styles from './tickets.module.css';

export default function RefreshTickets() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return <button className={styles.refresh} type="button" disabled={pending} aria-busy={pending}
    onClick={() => startTransition(() => router.refresh())}>
    <RefreshCw size={14} />{pending ? 'Actualizando…' : 'Actualizar'}
  </button>;
}
