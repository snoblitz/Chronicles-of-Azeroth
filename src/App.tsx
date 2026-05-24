import { useState } from 'react';
import { SpendBar } from './components/SpendBar';
import { SmokeTest } from './components/SmokeTest';
import { CharacterCreation } from './components/CharacterCreation';
import { NpcChat } from './components/NpcChat';

type Tab = 'character' | 'npc' | 'smoke';

export function App() {
  const [tab, setTab] = useState<Tab>('character');

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <SpendBar />
      <main style={{ flex: 1, padding: '2.5rem 2rem 4rem', maxWidth: 980, margin: '0 auto', width: '100%' }}>
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
            aria-selected={tab === 'npc'}
            className="coa-tab"
            onClick={() => setTab('npc')}
          >
            ◆ Tavern
          </button>
          <button
            role="tab"
            aria-selected={tab === 'smoke'}
            className="coa-tab"
            onClick={() => setTab('smoke')}
          >
            ◆ Smoke test
          </button>
        </nav>

        <div style={{ marginTop: '2rem' }}>
          {tab === 'character' && <CharacterCreation />}
          {tab === 'npc' && <NpcChat />}
          {tab === 'smoke' && <SmokeTest />}
        </div>
      </main>
    </div>
  );
}
