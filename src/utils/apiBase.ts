/**
 * Resolves the base URL to prefix every /api/* call with.
 *
 * - In local dev, the Express server runs on localhost:3000 (Vite runs the UI separately).
 * - In production on Vercel (frontend only), set VITE_API_BASE_URL to your Render backend URL,
 *   e.g. https://nexus-analytics-k3w2.onrender.com
 * - If VITE_API_BASE_URL is unset, we fall back to '' (same-origin), which is correct when the
 *   whole app — frontend + API — is served from a single Node process (e.g. Render).
 */
export const API_BASE: string =
  import.meta.env.MODE === 'development'
    ? 'http://localhost:3000'
    : (import.meta.env.VITE_API_BASE_URL || '');
