import { useEffect, useState } from 'react';
import { SpendBar } from './components/SpendBar';
import { CharacterTab } from './components/CharacterTab';
import { NpcChat } from './components/NpcChat';
import { CharacterSelector } from './components/CharacterSelector';
import { SettingsPanel } from './components/SettingsPanel';
import { AddonSimulator } from './components/AddonSimulator';
import { ChronicleReader } from './components/ChronicleReader';
import { ScribesDesk } from './components/ScribesDesk';
import { AccountMenu } from './components/AccountMenu';
import { getKeyStatus } from './lib/apiKeys';
import { getShowScribesDesk } from './lib/featureFlags';
import { ensureAnonymousSession } from './lib/auth';

// The Addon Simulator is a developer-only tool: it fires synthetic addon
// events into the bible/history layer to test narration without playing
// WoW. Hidden from production builds; flip the build mode via Vite's
// `import.meta.env.DEV` flag (true for `npm run dev`, false for `build`).
const SHOW_DEV_TOOLS = import.meta.env.DEV;

type Tab = 'character' | 'chronicle' | 'desk' | 'npc' | 'addon';

export function App() {
  const [tab, setTab] = useState<Tab>('character');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [keyTick, setKeyTick] = useState(0);
  const [showDesk, setShowDesk] = useState<boolean>(() => getShowScribesDesk());

  useEffect(() => {
    function handler(e: Event) {
      const target = (e as CustomEvent<string>).detail;
      if (target === 'tavern' || target === 'npc') setTab('npc');
      else if (target === 'character') setTab('character');
      else if (target === 'chronicle') setTab('chronicle');
      else if (target === 'desk') setTab('desk');
      else if (target === 'addon' && SHOW_DEV_TOOLS) setTab('addon');
    }
    window.addEventListener('at:request-tab', handler);
    return () => window.removeEventListener('at:request-tab', handler);
  }, []);

  useEffect(() => {
    function bump() {
      setKeyTick((n) => n + 1);
    }
    window.addEventListener('at:apikey-updated', bump);
    return () => window.removeEventListener('at:apikey-updated', bump);
  }, []);

  useEffect(() => {
    function onFlags() {
      setShowDesk(getShowScribesDesk());
    }
    window.addEventListener('at:flags-updated', onFlags);
    return () => window.removeEventListener('at:flags-updated', onFlags);
  }, []);

  // Anonymous-by-default: ensure a session exists the moment the app loads, so
  // this device's data has a stable owner_id (no-op when Supabase is unconfigured).
  useEffect(() => {
    void ensureAnonymousSession();
  }, []);

  // First-run nudge: if no key, pop the settings panel automatically.
  useEffect(() => {
    if (!getKeyStatus('openrouter').hasKey) {
      setSettingsOpen(true);
    }
  }, []);

  const openrouterStatus = getKeyStatus('openrouter');
  void keyTick; // re-renders trigger via the bump above
  const anyKey = openrouterStatus.hasKey;

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <SpendBar onOpenSettings={() => setSettingsOpen(true)} hasAnyKey={anyKey} />
      <main
        style={{
          flex: 1,
          padding: 'clamp(1.25rem, 6vw, 2.5rem) clamp(0.75rem, 5vw, 2rem) 4rem',
          maxWidth: 980,
          margin: '0 auto',
          width: '100%',
        }}
      >
        <div
          style={{
            display: 'flex', justifyContent: 'flex-end', alignItems: 'center',
            gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1rem',
          }}
        >
          <AccountMenu />
          <CharacterSelector />
        </div>
        <header style={{ textAlign: 'center', marginBottom: '0.5rem' }}>
          <h1>Aftertale</h1>
          <p className="muted" style={{ marginTop: 0, fontFamily: 'var(--font-body)', fontStyle: 'italic', fontSize: 17 }}>
            An AI-spun saga of your hero. Roll a character, then walk the world.
          </p>
          <hr className="ornament" />
        </header>

        <nav className="at-tabs" role="tablist">
          <button
            role="tab"
            aria-selected={tab === 'character'}
            className="at-tab"
            onClick={() => setTab('character')}
          >
            ◆ Character
          </button>
          <button
            role="tab"
            aria-selected={tab === 'chronicle'}
            className="at-tab"
            onClick={() => setTab('chronicle')}
          >
            ◆ Chronicle
          </button>
          {showDesk && (
            <button
              role="tab"
              aria-selected={tab === 'desk'}
              className="at-tab"
              onClick={() => setTab('desk')}
              title="Import SavedVariables, enrich events into prose, and download a restore snippet for WoW"
            >
              ◆ Scribe's Desk
            </button>
          )}
          <button
            role="tab"
            aria-selected={tab === 'npc'}
            className="at-tab"
            onClick={() => setTab('npc')}
          >
            ◆ Tavern
          </button>
          {SHOW_DEV_TOOLS && (
            <button
              role="tab"
              aria-selected={tab === 'addon'}
              className="at-tab"
              onClick={() => setTab('addon')}
              title="Developer-only: fires synthetic addon events"
            >
              ◆ Addon Sim (dev)
            </button>
          )}
        </nav>

        <div style={{ marginTop: '2rem' }}>
          {tab === 'character' && <CharacterTab />}
          {tab === 'chronicle' && <ChronicleReader />}
          {tab === 'desk' && showDesk && <ScribesDesk />}
          {tab === 'npc' && <NpcChat />}
          {tab === 'addon' && SHOW_DEV_TOOLS && <AddonSimulator />}
        </div>
      </main>
      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
