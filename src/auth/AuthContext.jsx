import { createContext, use, useEffect, useState } from 'react';

import { api } from '../api/client.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [state, setState] = useState({ status: 'loading', user: null });

  useEffect(() => {
    const controller = new AbortController();
    api('/api/v1/me', { signal: controller.signal })
      .then(({ user }) => setState({ status: 'authenticated', user }))
      .catch((error) => {
        if (error.name !== 'AbortError') setState({ status: 'anonymous', user: null });
      });
    return () => controller.abort();
  }, []);

  async function login(credentials) {
    const { user } = await api('/api/v1/auth/sessions', { method: 'POST', body: credentials });
    setState({ status: 'authenticated', user });
    return user;
  }

  async function register(input) {
    return api('/api/v1/auth/registrations', { method: 'POST', body: input });
  }

  async function logout() {
    await api('/api/v1/auth/session', { method: 'DELETE' });
    setState({ status: 'anonymous', user: null });
  }

  async function refreshSession() {
    const { user } = await api('/api/v1/me');
    setState({ status: 'authenticated', user });
    return user;
  }

  const value = {
    ...state,
    isAdministrator: state.user?.roles.includes('ADMINISTRADOR') ?? false,
    isOwner: state.user?.roles.includes('PROPIETARIO') ?? false,
    login,
    register,
    logout,
    refreshSession,
  };

  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth() {
  const context = use(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
