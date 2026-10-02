import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { api } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { AuthLayout } from '../components/AuthLayout.jsx';
import { ButtonPending, ErrorNotice } from '../components/Feedback.jsx';
import { errorCopy } from '../lib/format.js';

const GENERIC_MESSAGE = 'Si existe una cuenta asociada a ese correo, recibirás instrucciones para restablecer tu contraseña.';

export function PasswordResetRequestPage() {
  const [email, setEmail] = useState('');
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(null);

  async function submit(event) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await api('/api/v1/auth/password-reset/request', { method: 'POST', body: { email } });
      setSent(true);
    } catch (caught) { setError(caught); }
    finally { setPending(false); }
  }

  return <AuthLayout><h2 id="auth-title">Recuperar contraseña</h2>
    <p className="form-lead">Ingresa el correo asociado a tu cuenta.</p>
    {sent ? <p className="notice notice-success" role="status">{GENERIC_MESSAGE}</p> : <>
      {error ? <ErrorNotice>{errorCopy(error)}</ErrorNotice> : null}
      <form className="form-stack" onSubmit={submit}><label className="field"><span>Correo</span><input type="email" autoComplete="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} /></label><button className="button button-primary" type="submit" disabled={pending}><ButtonPending pending={pending} pendingLabel="Enviando…">Enviar enlace</ButtonPending></button></form>
    </>}
    <Link className="auth-recovery-link" to="/acceso">Volver a iniciar sesión</Link>
  </AuthLayout>;
}

export function PasswordResetConfirmPage() {
  const auth = useAuth();
  const [token] = useState(() => new URLSearchParams(window.location.search).get('token'));
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [pending, setPending] = useState(false);
  const [invalid, setInvalid] = useState(!token);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (token) window.history.replaceState(window.history.state, '', '/reset-password');
  }, [token]);

  async function submit(event) {
    event.preventDefault();
    if (password !== confirmation) { setError('Las contraseñas no coinciden.'); return; }
    setPending(true);
    setError(null);
    try {
      await api('/api/v1/auth/password-reset/confirm', {
        method: 'POST', body: { token, newPassword: password },
      });
      auth.clearLocalSession();
      setSuccess(true);
      setPassword('');
      setConfirmation('');
    } catch (caught) {
      if (caught.code === 'invalid_password_reset_token') setInvalid(true);
      else setError(errorCopy(caught));
    } finally { setPending(false); }
  }

  return <AuthLayout>{success ? <><h2 id="auth-title">Contraseña actualizada</h2><p className="form-lead" role="status">Ahora puedes iniciar sesión con tu nueva contraseña.</p><Link className="button button-primary" to="/acceso">Iniciar sesión</Link></>
    : invalid ? <><h2 id="auth-title">Enlace no disponible</h2><p className="form-lead" role="alert">Este enlace ya no es válido o ha expirado.</p><Link className="button button-secondary" to="/recuperar-password">Solicitar un nuevo enlace</Link></>
      : <><h2 id="auth-title">Nueva contraseña</h2><p className="form-lead">Elige una contraseña nueva para tu cuenta.</p>{error ? <p className="notice notice-error" role="alert">{error}</p> : null}<form className="form-stack" onSubmit={submit}><label className="field"><span>Nueva contraseña</span><input type="password" autoComplete="new-password" required minLength={12} value={password} onChange={(event) => setPassword(event.target.value)} /><small>Mínimo 12 caracteres. No se modifican espacios ni mayúsculas.</small></label><label className="field"><span>Confirmar contraseña</span><input type="password" autoComplete="new-password" required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label><button className="button button-primary" type="submit" disabled={pending}><ButtonPending pending={pending} pendingLabel="Actualizando…">Cambiar contraseña</ButtonPending></button></form></>}
  </AuthLayout>;
}
