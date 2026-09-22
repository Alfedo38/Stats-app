import { requirePageUser } from '@/lib/auth/server';
import UsersPanel from '@/components/auth/UsersPanel';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Administrar usuarios' };
export default async function UsersPage() {
  await requirePageUser({ admin: true });
  return <main className="auth-page"><div className="auth-admin-container">
    <span className="auth-badge">ADMINISTRACIÓN</span>
    <h1>Las personas que vos elegís.</h1>
    <p className="auth-muted">Creá cuentas y controlá quién puede acceder a MoskProps.</p>
    <UsersPanel />
  </div></main>;
}
