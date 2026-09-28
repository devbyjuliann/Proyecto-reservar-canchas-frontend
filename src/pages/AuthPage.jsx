import { Eye, EyeOff, LockKeyhole, Mail, UserRound } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';

import { useAuth } from '../auth/AuthContext.jsx';
import { ButtonPending, ErrorNotice } from '../components/Feedback.jsx';
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

  return (
    <div className="auth-layout">
      <section className="auth-intro">
        <div className="court-corner" aria-hidden="true"><span /><span /><span /></div>
        <h1>Tu cancha,<br />en el horario exacto.</h1>
        <p>La disponibilidad se comprueba de nuevo al confirmar. Lo que reservas es un turno real, no una promesa.</p>
      </section>
      <section className="auth-form-wrap" aria-labelledby="auth-title">
        <div className="auth-switch" role="tablist" aria-label="Acceso">
          <button type="button" role="tab" aria-selected={mode === 'login'} onClick={() => { setMode('login'); setError(null); }}>Ingresar</button>
          <button type="button" role="tab" aria-selected={mode === 'register'} onClick={() => { setMode('register'); setError(null); }}>Crear cuenta</button>
        </div>
        <h2 id="auth-title">{mode === 'login' ? 'Vuelve a la pista' : 'Crea tu ficha de usuario'}</h2>
        <p className="form-lead">{mode === 'login' ? 'Usa el correo con el que registraste tus reservas.' : 'Tu cuenta empieza con permisos de Usuario.'}</p>
        {message ? <div className="notice notice-success" role="status">{message}</div> : null}
        {error ? <ErrorNotice>{errorCopy(error)}</ErrorNotice> : null}
        <form className="form-stack" onSubmit={submit}>
          {mode === 'register' ? (
            <label className="field"><span>Nombre</span><div className="input-with-icon"><UserRound size={18} /><input name="name" value={values.name} onChange={update} autoComplete="name" required maxLength="150" /></div></label>
          ) : null}
          <label className="field"><span>Correo</span><div className="input-with-icon"><Mail size={18} /><input type="email" name="email" value={values.email} onChange={update} autoComplete="email" required maxLength="254" /></div></label>
          <div className="field"><label htmlFor="auth-password">Contraseña</label><div className="input-with-icon"><LockKeyhole size={18} /><input id="auth-password" type={showPassword ? 'text' : 'password'} name="password" value={values.password} onChange={update} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={mode === 'register' ? 12 : undefined} /><button className="password-toggle" type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}>{showPassword ? <EyeOff /> : <Eye />}</button></div>{mode === 'register' ? <small>Mínimo 12 caracteres. No se modifican espacios ni mayúsculas.</small> : null}</div>
          <button className="button button-primary button-wide" type="submit" disabled={pending}><ButtonPending pending={pending}>{mode === 'login' ? 'Ingresar' : 'Crear cuenta'}</ButtonPending></button>
        </form>
      </section>
    </div>
  );
}
