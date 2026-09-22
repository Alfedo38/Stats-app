'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import Sidebar from '@/components/Sidebar';
import Footer from '@/components/Footer';
import { LogoutButton } from './AuthForms';

type User = { username: string; role: string; mustChangePassword: boolean } | null;
export default function AppChrome({ user, children }: { user: User; children: React.ReactNode }) {
  const path = usePathname();
  if (path === '/login') return <div className="w-full">{children}</div>;
  const limited = !user || user.mustChangePassword;
  return <>
    {!limited && <Sidebar />}
    <div className={`flex-1 min-w-0 min-h-screen flex flex-col ${limited ? '' : 'md:pl-[72px]'}`}
      style={{ paddingTop: limited ? 0 : 'var(--topbar-height, 0px)' }}>
      {user && <div className="auth-accountbar">
        <span>Sesión de <strong>{user.username}</strong></span>
        <nav aria-label="Mi cuenta">
          {!limited && user.role === 'admin' && <Link href="/admin/usuarios">Administrar usuarios</Link>}
          <Link href="/cuenta">Mi cuenta</Link><LogoutButton />
        </nav>
      </div>}
      <div className="flex-grow">{children}</div>
      {!limited && <Footer />}
    </div>
  </>;
}
