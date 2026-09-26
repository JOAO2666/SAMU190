import type { BootstrapPayload, User } from './types';

type ApiOptions = Omit<RequestInit, 'body'> & {
  body?: unknown;
};

const API_BASE = import.meta.env.VITE_API_URL || '/api';
let tokenGetter: (() => string | null) | null = null;

export function setAuthTokenGetter(getter: () => string | null) {
  tokenGetter = getter;
}

export async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const headers = new Headers(options.headers);
  const token = tokenGetter?.();

  if (token) headers.set('Authorization', `Bearer ${token}`);

  let body: BodyInit | undefined;
  if (options.body !== undefined) {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(options.body);
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    body,
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.message || 'Nao foi possivel concluir a acao.');
  }

  return payload as T;
}

export function googleAuthUrl() {
  return `${API_BASE}/auth/google`;
}

export function mediaUrl(path: string) {
  if (!path || /^https?:\/\//.test(path)) return path;
  if (!path.startsWith('/')) return path;
  const origin = API_BASE.endsWith('/api') ? API_BASE.slice(0, -4) : '';
  return `${origin}${path}`;
}

export function fetchBootstrap() {
  return api<BootstrapPayload>('/bootstrap');
}

export type AuthResponse = {
  user: User;
  token: string;
};
