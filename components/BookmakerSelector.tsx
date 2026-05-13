import Link from 'next/link';

interface Props {
  activeBook: 'stake' | 'betano';
}

const BOOKS = [
  {
    id: 'stake',
    label: 'Stake',
    emoji: '🟢',
    href: '/ev-plays',
    activeClass: 'bg-emerald-500 text-white shadow-[0_0_15px_rgba(16,185,129,0.3)]',
  },
  {
    id: 'betano',
    label: 'Betano',
    emoji: '🟠',
    href: '/ev-plays?book=betano',
    activeClass: 'bg-orange-500 text-white shadow-[0_0_15px_rgba(249,115,22,0.35)]',
  },
] as const;

// ✅ Server Component — usa <Link> en vez de router.push()
// Así Next.js hace una navegación completa y re-ejecuta el Server Component
// con los nuevos searchParams, en vez de una navegación suave que no los actualiza.
export default function BookmakerSelector({ activeBook }: Props) {
  return (
    <div className="flex bg-[var(--surface-soft)] p-1 rounded-xl border border-[var(--border)] w-fit">
      {BOOKS.map(book => (
        <Link
          key={book.id}
          href={book.href}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-xs font-black uppercase tracking-widest transition-all no-underline ${
            activeBook === book.id
              ? book.activeClass
              : 'text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-hover)]'
          }`}
        >
          {book.emoji} {book.label}
        </Link>
      ))}
    </div>
  );
}
