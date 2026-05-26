import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { LandingPage } from './components/LandingPage';
import './index.css';

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

  // #app (or any subroute under it) goes to the application. Everything else
  // shows the marketing landing page.
  if (hash.startsWith('#app')) {
    return <App />;
  }
  return <LandingPage />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
