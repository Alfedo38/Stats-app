'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { authPost } from './AuthForms';

type User = { id: string; username: string; role: string; active: boolean; must_change_password: boolean };
export default function UsersPanel() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [secret, setSecret] = useState<{ username: string; temporaryPassword: string } | null>(null);
  const [pending, setPending] = useState<{ username: string; action: string; userId: string } | null>(null);
  const [confirmUsername, setConfirmUsername] = useState('');
  const [copyMessage, setCopyMessage] = useState('');

  async function refresh() {
    const response = await fetch('/api/admin/users', { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'No se pudo cargar la lista.');
    setUsers(data.users);
  }
  useEffect(() => { refresh().catch(e => setError(e.message)).finally(() => setLoading(false)); }, []);

  async function perform(action: string, username: string, userId?: string) {
    setBusy(true); setError(''); setNotice(''); setSecret(null); setCopyMessage('');
    try {
      const result = await authPost('/api/admin/users', { action, username, userId,
        ...(action === 'delete' ? { confirmUsername } : {}) });
      if (result.temporaryPassword) setSecret(result);
      setNotice(action === 'create' ? 'Cuenta creada.' : action === 'reset' ? 'Contraseña restablecida. Se cerraron sus sesiones.'
        : action === 'delete' ? 'Cuenta eliminada y sesiones cerradas.'
        : action === 'disable' ? 'Cuenta desactivada y sesiones cerradas.' : 'Cuenta habilitada.');
      setPending(null);
      setConfirmUsername('');
      await refresh();
      return true;
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo completar.'); return false; }
    finally { setBusy(false); }
  }
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const name = String(new FormData(form).get('username'));
    if (await perform('create', name)) form.reset();
  }
  return <div className="auth-admin-grid">
    <section className="auth-card">
      <h2>Crear una cuenta</h2>
      <p className="auth-muted">La persona recibirá acceso de lectura a NBA, WNBA y picks.</p>
      <form onSubmit={create} className="auth-form">
        <label htmlFor="new-username">Nombre de usuario</label>
        <input id="new-username" name="username" required minLength={3} maxLength={32}
          pattern="[a-zA-Z0-9][a-zA-Z0-9._\-]{2,31}" autoComplete="off" autoCapitalize="none" spellCheck={false}
          placeholder="Ejemplo: juan.perez" aria-describedby="username-help" />
        <p id="username-help" className="auth-muted">3 a 32 caracteres. Sin espacios ni acentos.</p>
        <button className="auth-primary" disabled={busy || loading}>Crear cuenta</button>
      </form>
      {notice && <p role="status" className="auth-success">{notice}</p>}
      {secret && <div className="auth-secret" role="status">
        <h3>Datos de acceso</h3>
        <p>Usuario: <strong>{secret.username}</strong></p>
        <p>Contraseña temporal:</p><code>{secret.temporaryPassword}</code>
        <p>Compartila en privado. Solo se muestra ahora y deberá cambiarla al entrar.</p>
        <button type="button" onClick={async () => {
          try {
            await navigator.clipboard.writeText(`Usuario: ${secret.username}\nContraseña temporal: ${secret.temporaryPassword}`);
            setCopyMessage('Datos copiados. Compartilos en privado.');
          } catch { setCopyMessage('No se pudo copiar automáticamente. Seleccioná los datos y copialos manualmente.'); }
        }}>Copiar datos de acceso</button>
        <button type="button" onClick={() => { setSecret(null); setCopyMessage(''); }}>Ya la guardé · ocultar</button>
        {copyMessage && <p role="status">{copyMessage}</p>}
      </div>}
    </section>
    <section className="auth-card">
      <div className="auth-users-heading"><h2>Cuentas</h2><span>{users.length}</span></div>
      {error && <p role="alert" className="auth-error">{error}</p>}
      {loading ? <p role="status">Cargando cuentas…</p> : <ul className="auth-users">
        {users.map(user => <li key={user.id}>
          <div><strong>{user.username}</strong><p className="auth-muted">{user.role === 'admin' ? 'Administrador'
            : !user.active ? 'Desactivada' : user.must_change_password ? 'Debe cambiar su contraseña' : 'Activa'}</p></div>
          {user.role !== 'admin' && <div className="auth-user-actions">
            <button disabled={busy} onClick={() => { setConfirmUsername(''); setPending({ username: user.username, userId: user.id, action: 'reset' }); }}>Restablecer contraseña</button>
            <button disabled={busy} onClick={() => { setConfirmUsername(''); setPending({ username: user.username, userId: user.id, action: user.active ? 'disable' : 'enable' }); }}>
              {user.active ? 'Desactivar' : 'Habilitar'}</button>
            <button className="auth-delete-button" disabled={busy} onClick={() => {
              setConfirmUsername(''); setPending({ username: user.username, userId: user.id, action: 'delete' });
            }}>Eliminar</button>
          </div>}
        </li>)}
      </ul>}
      {pending && <div className="auth-confirm" role="group" aria-label="Confirmar cambio de cuenta">
        <p>¿{pending.action === 'delete' ? 'Eliminar definitivamente a' : pending.action === 'reset' ? 'Generar una contraseña temporal para' : pending.action === 'disable' ? 'Desactivar a' : 'Habilitar a'} <strong>{pending.username}</strong>?</p>
        <p className="auth-muted">{pending.action === 'delete'
          ? 'Se eliminarán la cuenta y sus sesiones. No se puede deshacer. Las estadísticas no se modifican.'
          : 'Se cerrarán sus sesiones actuales.'}</p>
        {pending.action === 'delete' && <div className="auth-form">
          <label htmlFor="delete-confirm">Escribí {pending.username} para confirmar</label>
          <input id="delete-confirm" autoComplete="off" autoCapitalize="none" spellCheck={false}
            value={confirmUsername} onChange={event => setConfirmUsername(event.target.value)} />
        </div>}
        <button className={pending.action === 'delete' ? 'auth-delete-button' : undefined}
          disabled={busy || (pending.action === 'delete' && confirmUsername !== pending.username)}
          onClick={() => perform(pending.action, pending.username, pending.userId)}>
          {busy ? 'Aplicando…' : pending.action === 'delete' ? 'Eliminar definitivamente' : 'Confirmar'}</button>
        <button disabled={busy} onClick={() => { setPending(null); setConfirmUsername(''); }}>Cancelar</button>
      </div>}
    </section>
  </div>;
}
