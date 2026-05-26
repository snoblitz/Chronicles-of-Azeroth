// ============================================================================
// API key resolution.
//
// As of 2026-05-26 the only LLM gateway is OpenRouter — one key gets the user
// access to every model. See docs/companion-architecture.md §8a for rationale.
//
// Order of precedence:
//   1. Runtime key in localStorage (user-entered via SettingsPanel)
//   2. Build-time env var (VITE_OPENROUTER_API_KEY)
//
// This lets the same bundle work in two very different deployments:
//   - Local dev: drop a key in .env.local, restart Vite, done.
//   - GitHub Pages: build has no secrets — user pastes their key in-browser
//     once and it persists per-browser via localStorage. Keys never leave the
//     device.
//
// Never log the full key. Mask everything but the last 4 chars when surfacing
// status to the UI.
// ============================================================================

export type Provider = 'openrouter';

const STORAGE_KEY_PREFIX = 'at.apikey.';

function storageKey(provider: Provider): string {
  return `${STORAGE_KEY_PREFIX}${provider}`;
}

function envKey(_provider: Provider): string {
  return import.meta.env.VITE_OPENROUTER_API_KEY ?? '';
}

export function getApiKey(provider: Provider): string {
  try {
    const stored = window.localStorage.getItem(storageKey(provider));
    if (stored && stored.trim()) return stored.trim();
  } catch {
    // localStorage may throw in private mode / SSR — fall through to env.
  }
  return envKey(provider);
}

export function setApiKey(provider: Provider, value: string): void {
  const trimmed = value.trim();
  if (!trimmed) {
    window.localStorage.removeItem(storageKey(provider));
  } else {
    window.localStorage.setItem(storageKey(provider), trimmed);
  }
  window.dispatchEvent(new CustomEvent('at:apikey-updated', { detail: provider }));
}

export function clearApiKey(provider: Provider): void {
  window.localStorage.removeItem(storageKey(provider));
  window.dispatchEvent(new CustomEvent('at:apikey-updated', { detail: provider }));
}

export interface KeyStatus {
  provider: Provider;
  hasKey: boolean;
  source: 'localStorage' | 'env' | 'none';
  masked: string;
}

export function getKeyStatus(provider: Provider): KeyStatus {
  let stored = '';
  try {
    stored = window.localStorage.getItem(storageKey(provider))?.trim() ?? '';
  } catch {
    stored = '';
  }
  const env = envKey(provider).trim();
  const effective = stored || env;
  const source: KeyStatus['source'] = stored ? 'localStorage' : env ? 'env' : 'none';
  return {
    provider,
    hasKey: !!effective,
    source,
    masked: maskKey(effective),
  };
}

function maskKey(key: string): string {
  if (!key) return '—';
  if (key.length <= 8) return '••••';
  return `••••${key.slice(-4)}`;
}
