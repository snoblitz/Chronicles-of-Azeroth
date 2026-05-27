import { lazy, StrictMode, Suspense, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { LandingPage } from './components/LandingPage';
import './index.css';

// The app tree (and everything it pulls in — Supabase, the providers, the
// whole authoring UI) is lazy-loaded so the marketing landing page at "/"
// stays a lean public front door. Landing visitors who never open the app
// don't download any of it.
const App = lazy(() => import('./App').then((m) => ({ default: m.App })));
const AuthCallback = lazy(() =>
  import('./components/AuthCallback').then((m) => ({ default: m.AuthCallback })),
);

function RouteFallback() {
  return (
    <div
      style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'var(--font-display)', color: 'var(--fg-muted)',
      }}
    >
      Loading…
    </div>
  );
}

// One-time localStorage migration: copy any legacy `coa.*` keys to `at.*` then
// drop the originals. Safe to run on every boot — gated by `at.migrated`.
// Lets pre-rename dev data (character bibles, API keys, spend log, etc.)
// survive the brand transition without re-importing anything.
function migrateLocalStorage() {
  try {
    if (window.localStorage.getItem('at.migrated') === '1') return;
    const oldKeys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith('coa.')) oldKeys.push(k);
    }
    for (const oldKey of oldKeys) {
      const newKey = 'at.' + oldKey.slice(4);
      if (window.localStorage.getItem(newKey) === null) {
        const val = window.localStorage.getItem(oldKey);
        if (val !== null) window.localStorage.setItem(newKey, val);
      }
      window.localStorage.removeItem(oldKey);
    }
    window.localStorage.setItem('at.migrated', '1');
    if (oldKeys.length > 0) {
      // eslint-disable-next-line no-console
      console.info(`[aftertale] migrated ${oldKeys.length} localStorage keys from coa.* to at.*`);
    }
  } catch {
    // localStorage unavailable (private mode, etc.) — nothing to do.
  }
}
migrateLocalStorage();

function Root() {
  const [hash, setHash] = useState(() => window.location.hash);

  useEffect(() => {
    function onHash() {
      setHash(window.location.hash);
    }
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // Magic-link return path. A real path (not a hash) so Supabase can redirect
  // to it; public/_redirects serves index.html here on Cloudflare.
  if (window.location.pathname === '/auth/callback') {
    return (
      <Suspense fallback={<RouteFallback />}>
        <AuthCallback />
      </Suspense>
    );
  }
  // #app (or any subroute under it) goes to the application. Everything else
  // shows the marketing landing page.
  if (hash.startsWith('#app')) {
    return (
      <Suspense fallback={<RouteFallback />}>
        <App />
      </Suspense>
    );
  }
  return <LandingPage />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
