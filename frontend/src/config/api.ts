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
