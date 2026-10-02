import { Eye, EyeOff, LockKeyhole, Mail, UserRound } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';

import { useAuth } from '../auth/AuthContext.jsx';
import { AuthLayout } from '../components/AuthLayout.jsx';
import { ButtonPending, ErrorNotice } from '../components/Feedback.jsx';
import { GoogleIdentityButton } from '../components/GoogleIdentityButton.jsx';
import { errorCopy } from '../lib/format.js';

export function AuthPage() {
  const auth = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [mode, setMode] = useState(() => location.pathname === '/registro' ? 'register' : 'login');
  const [showPassword, setShowPassword] = useState(false);
  const [values, setValues] = useState({ name: '', email: '', password: '' });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState('');
  const resumingBooking = Boolean(location.state?.intent);

  useEffect(() => {
    setMode(location.pathname === '/registro' ? 'register' : 'login');
    setError(null);
  }, [location.pathname]);

  if (auth.status === 'authenticated') {
    return <Navigate to={location.state?.from ?? '/'}
      state={location.state?.intent ? { intent: location.state.intent } : undefined} replace />;
  }

  function update(event) {
    setValues((current) => ({ ...current, [event.target.name]: event.target.value }));
  }

  async function submit(event) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setMessage('');
    try {
      if (mode === 'register') {
        await auth.register(values);
        setMode('login');
        setValues((current) => ({ ...current, name: '', password: '' }));
        setMessage('Cuenta creada. Ingresa con tu correo y contraseña.');
      } else {
        await auth.login({ email: values.email, password: values.password });
        navigate(location.state?.from ?? '/', {
          replace: true,
          state: location.state?.intent ? { intent: location.state.intent } : undefined,
        });
      }
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(false);
    }
  }

  async function googleLogin(credential) {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      await auth.loginWithGoogle(credential);
      navigate(location.state?.from ?? '/', {
        replace: true, state: location.state?.intent ? { intent: location.state.intent } : undefined,
      });
    } catch (caught) { setError(caught); }
    finally { setPending(false); }
  }

  return (
    <AuthLayout>
        <div className="auth-switch" role="tablist" aria-label="Acceso">
          <button type="button" role="tab" aria-selected={mode === 'login'} onClick={() => { setMode('login'); setError(null); }}>Ingresar</button>
          <button type="button" role="tab" aria-selected={mode === 'register'} onClick={() => { setMode('register'); setError(null); }}>Crear cuenta</button>
        </div>
        <h2 id="auth-title">{mode === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}</h2>
        <p className="form-lead">{mode === 'login' ? 'Accede para consultar y gestionar tus reservas.' : 'Regístrate para reservar y consultar tus turnos.'}</p>
        {resumingBooking ? <p className="auth-booking-context" role="status">{mode === 'login' ? 'Inicia sesión para continuar con tu reserva. Al volver, comprobaremos que el turno siga disponible.' : 'Crea tu cuenta y luego inicia sesión para retomar tu reserva.'}</p> : null}
        {message ? <div className="notice notice-success" role="status">{message}</div> : null}
        {error ? <div id="auth-error"><ErrorNotice>{errorCopy(error)}</ErrorNotice></div> : null}
        <GoogleIdentityButton onCredential={googleLogin} disabled={pending} />
        {import.meta.env.VITE_GOOGLE_CLIENT_ID ? <div className="auth-divider" aria-hidden="true">o</div> : null}
        <form className="form-stack" onSubmit={submit}>
          {mode === 'register' ? (
            <label className="field"><span>Nombre</span><div className="input-with-icon"><UserRound size={18} aria-hidden="true" /><input name="name" value={values.name} onChange={update} autoComplete="name" required maxLength="150" aria-describedby={error ? 'auth-error' : undefined} /></div></label>
          ) : null}
          <label className="field"><span>Correo</span><div className="input-with-icon"><Mail size={18} aria-hidden="true" /><input type="email" name="email" value={values.email} onChange={update} autoComplete="email" required maxLength="254" aria-describedby={error ? 'auth-error' : undefined} /></div></label>
          <div className="field"><label htmlFor="auth-password">Contraseña</label><div className="input-with-icon"><LockKeyhole size={18} aria-hidden="true" /><input id="auth-password" type={showPassword ? 'text' : 'password'} name="password" value={values.password} onChange={update} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={mode === 'register' ? 12 : undefined} aria-describedby={[mode === 'register' ? 'auth-password-help' : null, error ? 'auth-error' : null].filter(Boolean).join(' ') || undefined} /><button className="password-toggle" type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}>{showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}</button></div>{mode === 'register' ? <small id="auth-password-help">Mínimo 12 caracteres. No se modifican espacios ni mayúsculas.</small> : null}</div>
          {mode === 'login' ? <Link className="auth-recovery-link" to="/recuperar-password">¿Olvidaste tu contraseña?</Link> : null}
          <button className="button button-primary button-wide" type="submit" disabled={pending}><ButtonPending pending={pending} pendingLabel={mode === 'login' ? 'Iniciando sesión…' : 'Creando cuenta…'}>{mode === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}</ButtonPending></button>
        </form>
    </AuthLayout>
  );
}
