import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/server';
import { LoginForm } from '@/components/auth/AuthForms';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Acceso privado', robots: { index: false, follow: false } };
export default async function LoginPage() {
  const user = await getSession();
  if (user) redirect(user.mustChangePassword ? '/cuenta' : '/');
  return <main className="auth-login">
    <section className="auth-intro" aria-label="MoskProps">
      <div className="auth-wordmark">MOSK<span>PROPS</span></div>
      <p className="auth-eyebrow">ESTADÍSTICAS DE JUGADORES</p>
      <h1>De los pibes<br /><span>para los pibes.</span></h1>
      <div className="auth-court" aria-hidden="true"><div /></div>
    </section>
    <section className="auth-login-side">
      <div className="auth-card">
        <span className="auth-badge">ACCESO PRIVADO</span>
        <h2>Bienvenido de nuevo</h2>
        <p className="auth-muted">Ingresá con la cuenta que te asignó el administrador.</p>
        <LoginForm />
        <div className="auth-note">Las cuentas se otorgan por invitación. No hay registro público.</div>
      </div>
    </section>
  </main>;
}
