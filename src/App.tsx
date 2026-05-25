import { useEffect, useState } from 'react';
import { SpendBar } from './components/SpendBar';
import { CharacterCreation } from './components/CharacterCreation';
import { NpcChat } from './components/NpcChat';
import { CharacterSelector } from './components/CharacterSelector';
import { SettingsPanel } from './components/SettingsPanel';
import { AddonSimulator } from './components/AddonSimulator';
import { ChronicleReader } from './components/ChronicleReader';
import { getKeyStatus } from './lib/apiKeys';

type Tab = 'character' | 'chronicle' | 'npc' | 'addon';

export function App() {
  const [tab, setTab] = useState<Tab>('character');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [keyTick, setKeyTick] = useState(0);

  useEffect(() => {
    function handler(e: Event) {
      const target = (e as CustomEvent<string>).detail;
      if (target === 'tavern' || target === 'npc') setTab('npc');
      else if (target === 'character') setTab('character');
      else if (target === 'chronicle') setTab('chronicle');
      else if (target === 'addon') setTab('addon');
    }
    window.addEventListener('coa:request-tab', handler);
    return () => window.removeEventListener('coa:request-tab', handler);
  }, []);

  useEffect(() => {
    function bump() {
      setKeyTick((n) => n + 1);
    }
    window.addEventListener('coa:apikey-updated', bump);
    return () => window.removeEventListener('coa:apikey-updated', bump);
  }, []);

  // First-run nudge: if no keys at all, pop the settings panel automatically.
  useEffect(() => {
    const gemini = getKeyStatus('gemini');
    const anthropic = getKeyStatus('anthropic');
    if (!gemini.hasKey && !anthropic.hasKey) {
      setSettingsOpen(true);
    }
  }, []);

  const geminiStatus = getKeyStatus('gemini');
  const anthropicStatus = getKeyStatus('anthropic');
  void keyTick; // re-renders trigger via the bump above
  const anyKey = geminiStatus.hasKey || anthropicStatus.hasKey;

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <SpendBar onOpenSettings={() => setSettingsOpen(true)} hasAnyKey={anyKey} />
      <main style={{ flex: 1, padding: '2.5rem 2rem 4rem', maxWidth: 980, margin: '0 auto', width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
          <CharacterSelector />
        </div>
        <header style={{ textAlign: 'center', marginBottom: '0.5rem' }}>
          <h1>Chronicles of Azeroth</h1>
          <p className="muted" style={{ marginTop: 0, fontFamily: 'var(--font-body)', fontStyle: 'italic', fontSize: 17 }}>
            An AI-spun saga of your hero. Roll a character, then walk the world.
          </p>
          <hr className="ornament" />
        </header>

        <nav className="coa-tabs" role="tablist">
          <button
            role="tab"
            aria-selected={tab === 'character'}
            className="coa-tab"
            onClick={() => setTab('character')}
          >
            ◆ Character
          </button>
          <button
            role="tab"
            aria-selected={tab === 'chronicle'}
            className="coa-tab"
            onClick={() => setTab('chronicle')}
          >
            ◆ Chronicle
          </button>
          <button
            role="tab"
            aria-selected={tab === 'npc'}
            className="coa-tab"
            onClick={() => setTab('npc')}
          >
            ◆ Tavern
          </button>
          <button
            role="tab"
            aria-selected={tab === 'addon'}
            className="coa-tab"
            onClick={() => setTab('addon')}
          >
            ◆ Addon Sim
          </button>
        </nav>

        <div style={{ marginTop: '2rem' }}>
          {tab === 'character' && <CharacterCreation />}
          {tab === 'chronicle' && <ChronicleReader />}
          {tab === 'npc' && <NpcChat />}
          {tab === 'addon' && <AddonSimulator />}
        </div>
      </main>
      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
