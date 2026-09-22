import { requirePageUser } from '@/lib/auth/server';
import { PasswordForm } from '@/components/auth/AuthForms';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Mi cuenta' };
export default async function AccountPage() {
  const user = await requirePageUser({ allowPasswordChange: true });
  return <main className="auth-page"><section className="auth-card auth-password-card">
    <span className="auth-badge">{user.username}</span>
    <h1>{user.mustChangePassword ? 'Elegí tu contraseña' : 'Mi cuenta'}</h1>
    <p className="auth-muted">{user.mustChangePassword
      ? 'Antes de acceder a las estadísticas, reemplazá la contraseña temporal por una personal.'
      : 'Actualizá tu contraseña de acceso.'}</p>
    <PasswordForm required={user.mustChangePassword} />
  </section></main>;
}
