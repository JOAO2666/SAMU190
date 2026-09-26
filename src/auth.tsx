import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, type AuthResponse, setAuthTokenGetter } from './api';
import type { User } from './types';

type Credentials = {
  email: string;
  password: string;
};

type RegisterInput = Credentials & {
  name: string;
};

type AuthContextValue = {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (credentials: Credentials) => Promise<User>;
  register: (input: RegisterInput) => Promise<User>;
  consumeToken: (token: string) => Promise<User>;
  logout: () => void;
  refresh: () => Promise<User | null>;
};

const storageKey = 'saudeconnect.token';
const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(storageKey));
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setAuthTokenGetter(() => localStorage.getItem(storageKey));
  }, []);

  const persistSession = useCallback((nextToken: string, nextUser: User) => {
    localStorage.setItem(storageKey, nextToken);
    setToken(nextToken);
    setUser(nextUser);
    return nextUser;
  }, []);

  const clearLocalSession = useCallback(() => {
    localStorage.removeItem(storageKey);
    setToken(null);
    setUser(null);
  }, []);

  const logout = useCallback(() => {
    if (localStorage.getItem(storageKey)) {
      void api('/auth/logout', { method: 'POST' }).catch(() => undefined);
    }
    clearLocalSession();
  }, [clearLocalSession]);

  const refresh = useCallback(async () => {
    const currentToken = localStorage.getItem(storageKey);
    if (!currentToken) {
      setLoading(false);
      return null;
    }

    try {
      const payload = await api<{ user: User }>('/auth/me');
      setToken(currentToken);
      setUser(payload.user);
      return payload.user;
    } catch {
      if (localStorage.getItem(storageKey) === currentToken) {
        clearLocalSession();
      }
      return null;
    } finally {
      setLoading(false);
    }
  }, [clearLocalSession]);

  useEffect(() => {
    if (window.location.pathname === '/auth/callback') {
      setLoading(false);
      return;
    }

    void refresh();
  }, [refresh]);

  const login = useCallback(
    async (credentials: Credentials) => {
      const payload = await api<AuthResponse>('/auth/login', {
        method: 'POST',
        body: credentials,
      });
      return persistSession(payload.token, payload.user);
    },
    [persistSession],
  );

  const register = useCallback(
    async (input: RegisterInput) => {
      const payload = await api<AuthResponse>('/auth/register', {
        method: 'POST',
        body: input,
      });
      return persistSession(payload.token, payload.user);
    },
    [persistSession],
  );

  const consumeToken = useCallback(
    async (nextToken: string) => {
      localStorage.setItem(storageKey, nextToken);
      setToken(nextToken);
      const payload = await api<{ user: User }>('/auth/me');
      return persistSession(nextToken, payload.user);
    },
    [persistSession],
  );

  const value = useMemo(
    () => ({ user, token, loading, login, register, consumeToken, logout, refresh }),
    [user, token, loading, login, register, consumeToken, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth deve ser usado dentro de AuthProvider.');
  return context;
}
