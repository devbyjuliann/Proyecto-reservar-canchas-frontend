import { useEffect, useRef, useState } from 'react';

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
let sdkPromise;

function loadSdk() {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (import.meta.env.VITE_GOOGLE_TEST_MODE === '1') return Promise.reject(new Error('Test SDK unavailable'));
  if (!sdkPromise) {
    sdkPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.onload = () => window.google?.accounts?.id ? resolve() : reject(new Error('Google unavailable'));
      script.onerror = () => reject(new Error('Google unavailable'));
      document.head.append(script);
    }).catch((error) => { sdkPromise = null; throw error; });
  }
  return sdkPromise;
}

export function GoogleIdentityButton({ onCredential, disabled = false }) {
  const container = useRef(null);
  const callback = useRef(onCredential);
  const [loadError, setLoadError] = useState(false);
  const [loading, setLoading] = useState(Boolean(CLIENT_ID));
  callback.current = onCredential;

  useEffect(() => {
    if (!CLIENT_ID) return;
    let active = true;
    loadSdk().then(() => {
      if (!active || !container.current) return;
      window.google.accounts.id.initialize({ client_id: CLIENT_ID,
        callback: ({ credential }) => { if (active && credential) callback.current(credential); },
        auto_select: false });
      container.current.replaceChildren();
      window.google.accounts.id.renderButton(container.current, {
        type: 'standard', theme: 'outline', size: 'large', text: 'continue_with',
        shape: 'rectangular', locale: 'es', width: Math.min(container.current.clientWidth || 320, 400),
      });
      setLoading(false);
    }).catch(() => { if (active) { setLoadError(true); setLoading(false); } });
    return () => { active = false; };
  }, []);

  if (!CLIENT_ID) return null;
  return <div className={`google-identity ${disabled ? 'is-pending' : ''}`}>
    {loading ? <p role="status">Cargando acceso con Google…</p> : null}
    {loadError ? <p role="status">Google no está disponible ahora. Puedes usar tu correo y contraseña.</p> : null}
    <div ref={container} aria-label="Continuar con Google" />
  </div>;
}
