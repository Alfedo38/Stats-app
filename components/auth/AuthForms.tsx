'use client';

import { useState, type FormEvent, type InputHTMLAttributes } from 'react';
import Link from 'next/link';

function PasswordInput({ visibilityLabel, ...props }: InputHTMLAttributes<HTMLInputElement> & { visibilityLabel: string }) {
  const [visible, setVisible] = useState(false);
  return <div className="auth-password-input">
    <input {...props} type={visible ? 'text' : 'password'} />
    <button type="button" aria-controls={props.id} aria-pressed={visible}
      aria-label={`${visible ? 'Ocultar' : 'Mostrar'} ${visibilityLabel}`}
      onClick={() => setVisible(value => !value)}>{visible ? 'Ocultar' : 'Mostrar'}</button>
  </div>;
}

export async function authPost(path: string, body: object = {}) {
  const response = await fetch(path, { method: 'POST', credentials: 'same-origin', cache: 'no-store',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'No se pudo completar la operación.');
  return data;
}

export function LogoutButton() {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return <span className="auth-logout"><button disabled={busy} onClick={async () => {
    setBusy(true); setError('');
    try { await authPost('/api/auth/logout'); window.location.assign('/login'); }
    catch { setError('No se pudo cerrar la sesión. Reintentá.'); setBusy(false); }
  }}>{busy ? 'Saliendo…' : 'Cerrar sesión'}</button>{error && <span role="alert">{error}</span>}</span>;
}

export function LoginForm() {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setBusy(true);
    const form = new FormData(event.currentTarget);
    try {
      const result = await authPost('/api/auth/login', { username: form.get('username'), password: form.get('password') });
      window.location.assign(result.redirect);
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo conectar. Reintentá.'); setBusy(false); }
  }
  return <form onSubmit={submit} className="auth-form">
    <label htmlFor="username">Usuario</label>
    <input id="username" name="username" autoComplete="username" autoCapitalize="none" spellCheck={false}
      placeholder="Tu nombre de usuario" required minLength={3} maxLength={32} autoFocus />
    <label htmlFor="password">Contraseña</label>
    <PasswordInput id="password" name="password" visibilityLabel="contraseña" autoComplete="current-password" required maxLength={128} />
    {error && <p className="auth-error" role="alert">{error}</p>}
    <button className="auth-primary" disabled={busy}>{busy ? 'Ingresando…' : 'Entrar a MoskProps'}</button>
    <p className="auth-muted">¿Olvidaste tu contraseña? Pedile al administrador que restablezca tu acceso.</p>
  </form>;
}

export function PasswordForm({ required }: { required: boolean }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError('');
    const form = new FormData(event.currentTarget);
    if (form.get('password') !== form.get('confirm')) { setError('Las contraseñas nuevas no coinciden.'); return; }
    setBusy(true);
    try {
      await authPost('/api/auth/password', { currentPassword: form.get('current'), password: form.get('password') });
      window.location.assign('/');
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo conectar.'); setBusy(false); }
  }
  return <form onSubmit={submit} className="auth-form">
    <label htmlFor="current">{required ? 'Contraseña temporal' : 'Contraseña actual'}</label>
    <PasswordInput id="current" name="current" visibilityLabel="contraseña actual" autoComplete="current-password" required maxLength={128} />
    <label htmlFor="new-password">Nueva contraseña</label>
    <PasswordInput id="new-password" name="password" visibilityLabel="nueva contraseña" autoComplete="new-password" required minLength={6} maxLength={128} aria-describedby="password-help" />
    <p id="password-help" className="auth-muted">Mínimo 6 caracteres. Podés usar una frase fácil de recordar.</p>
    <label htmlFor="confirm">Repetir nueva contraseña</label>
    <PasswordInput id="confirm" name="confirm" visibilityLabel="confirmación de contraseña" autoComplete="new-password" required minLength={6} maxLength={128} />
    {error && <p role="alert" className="auth-error">{error}</p>}
    <button className="auth-primary" disabled={busy}>{busy ? 'Guardando…' : 'Guardar contraseña y entrar'}</button>
    <p className="auth-muted">Al cambiarla se cerrarán tus otras sesiones.</p>
    {!required && <Link href="/">Volver al inicio</Link>}
  </form>;
}
