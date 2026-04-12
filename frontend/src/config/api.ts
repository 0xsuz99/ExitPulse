// Central API config — reads from env at build time.
// Set VITE_API_URL in Vercel (or .env.local for local overrides).
// Falls back to same-origin proxy (which works with Vite's dev server proxy).
export const API_BASE = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : '/api';

export const WS_BASE = import.meta.env.VITE_API_URL
  ? import.meta.env.VITE_API_URL
      .replace(/^https/, 'wss')
      .replace(/^http/, 'ws')
  : null; // null = auto-detect from window.location

const DEMO_SESSION_STORAGE_KEY = 'exitpulse_demo_session_id';

function createSessionId() {
  const rand = Math.random().toString(36).slice(2, 10);
  return `tab_${Date.now().toString(36)}_${rand}`;
}

export function getDemoSessionId(): string {
  if (typeof window === 'undefined') return 'tab_server';

  const existing = window.sessionStorage.getItem(DEMO_SESSION_STORAGE_KEY);
  if (existing) return existing;

  const next = createSessionId();
  window.sessionStorage.setItem(DEMO_SESSION_STORAGE_KEY, next);
  return next;
}

export function withSessionHeader(headers?: HeadersInit): HeadersInit {
  return {
    ...(headers || {}),
    'x-demo-session-id': getDemoSessionId(),
  };
}
