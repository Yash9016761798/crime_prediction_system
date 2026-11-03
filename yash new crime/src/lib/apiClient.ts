import { store } from '../store';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api').replace(
  /\/+$/,
  '',
);
const API_PREFIX = /\/api$/.test(API_BASE_URL) ? '/api' : '';

/**
 * Absolute URL for an API path, e.g. apiUrl('/heatmap').
 * Tolerates call sites that already include the `/api` prefix so a path is
 * never built as `/api/api/...`.
 */
export function apiUrl(path: string): string {
  let normalized = path.startsWith('/') ? path : `/${path}`;
  if (API_PREFIX && (normalized === API_PREFIX || normalized.startsWith(`${API_PREFIX}/`))) {
    normalized = normalized.slice(API_PREFIX.length) || '/';
  }
  return `${API_BASE_URL}${normalized}`;
}

/** Absolute URL for a server-hosted asset (e.g. an uploaded evidence file). */
export function assetUrl(path?: string | null): string {
  if (!path) return '';
  if (/^https?:\/\//i.test(path)) return path;
  const origin = API_BASE_URL.replace(/\/api\/?$/, '');
  return `${origin}${path.startsWith('/') ? path : `/${path}`}`;
}

/**
 * fetch() wrapper that points at the configured API origin and attaches the
 * current access token. The pages that still use imperative fetch would
 * otherwise hit the Vite dev server with a relative URL and 404.
 */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const token = store.getState().auth?.accessToken;
  if (token) headers.set('authorization', `Bearer ${token}`);
  if (!headers.has('accept')) headers.set('accept', 'application/json');

  const response = await fetch(apiUrl(path), { ...init, headers });
  if (response.status === 401) {
    store.dispatch({ type: 'auth/logoutLocally' });
  }
  return response;
}
