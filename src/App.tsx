import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { SpendBar } from './components/SpendBar';
import { CharacterTab } from './components/CharacterTab';
import { NpcChat } from './components/NpcChat';
import { SettingsPanel, type SettingsSectionId } from './components/SettingsPanel';
import { AddonSimulator } from './components/AddonSimulator';
import { ChronicleReader } from './components/ChronicleReader';
import { ScribesDesk } from './components/ScribesDesk';
import { getKeyStatus } from './lib/apiKeys';
import { getShowScribesDesk } from './lib/featureFlags';
import { ensureAnonymousSession } from './lib/auth';
import { initCloudSync } from './lib/cloudSync';
import { DEV_TOOLS_ENABLED } from './lib/devTools';
import { loadBible } from './lib/bibleStore';
import type { CharacterBible } from './types';

// Dev-only UI surfaces (Tavern + Addon Simulator) are gated by
// DEV_TOOLS_ENABLED. See src/lib/devTools.ts for the rationale —
// short version: NPC chat is a cost/abuse vector on the open internet,
// and the Addon Simulator only makes sense alongside `npm run dev`.
const SHOW_DEV_TOOLS = DEV_TOOLS_ENABLED;

type Tab = 'character' | 'chronicle' | 'desk' | 'npc' | 'addon';

interface TabSpec {
  id: Tab;
  label: string;
  title?: string;
  isDev?: boolean;
}

function useActiveBible(): CharacterBible | null {
  const [bible, setBible] = useState<CharacterBible | null>(() => loadBible());
  useEffect(() => {
    function refresh() {
      setBible(loadBible());
    }
    window.addEventListener('at:bible-updated', refresh);
    window.addEventListener('at:bible-roster-updated', refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener('at:bible-updated', refresh);
      window.removeEventListener('at:bible-roster-updated', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);
  return bible;
}

export function App() {
  const [tab, setTab] = useState<Tab>('character');
  const [settings, setSettings] = useState<{ open: boolean; section?: SettingsSectionId }>({
    open: false,
  });
  const openSettings = useCallback((section?: SettingsSectionId) => {
    setSettings({ open: true, section });
  }, []);
  const closeSettings = useCallback(() => {
    setSettings((s) => ({ open: false, section: s.section }));
  }, []);
  const [keyTick, setKeyTick] = useState(0);
  const [showDesk, setShowDesk] = useState<boolean>(() => getShowScribesDesk());
  const tabRefs = useRef<Record<Tab, HTMLButtonElement | null>>({
    character: null, chronicle: null, desk: null, npc: null, addon: null,
  });
  const bible = useActiveBible();
  const heroName = bible?.name?.trim() || '';
  const heroClass = bible?.class?.trim() || '';
  const heroRace = bible?.race?.trim() || '';

  useEffect(() => {
    function handler(e: Event) {
      const target = (e as CustomEvent<string>).detail;
      if ((target === 'tavern' || target === 'npc') && SHOW_DEV_TOOLS) setTab('npc');
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
    // Mirror this account's heroes to the cloud once signed in (no-op while
    // anonymous or when Supabase is unconfigured).
    initCloudSync();
  }, []);

  // First-run nudge: if no key, pop the settings panel automatically to API Keys.
  useEffect(() => {
    if (!getKeyStatus('openrouter').hasKey) {
      setSettings({ open: true, section: 'apiKeys' });
    }
  }, []);

  const openrouterStatus = getKeyStatus('openrouter');
  void keyTick; // re-renders trigger via the bump above
  const anyKey = openrouterStatus.hasKey;

  const tabSpecs = useMemo<TabSpec[]>(() => {
    const specs: TabSpec[] = [
      { id: 'character', label: 'Character' },
      { id: 'chronicle', label: 'Chronicle' },
    ];
    if (showDesk) {
      specs.push({
        id: 'desk',
        label: "The Inkwell",
        title: "Import SavedVariables, pen Scribe's Notes, and publish session recaps",
      });
    }
    if (SHOW_DEV_TOOLS) {
      specs.push({ id: 'npc', label: 'Tavern', isDev: true, title: 'Developer-only: live NPC chat (not exposed on public builds)' });
      specs.push({ id: 'addon', label: 'Addon Sim', isDev: true, title: 'Developer-only: fires synthetic addon events' });
    }
    return specs;
  }, [showDesk]);

  const onTabKey = useCallback(
    (e: KeyboardEvent<HTMLButtonElement>) => {
      const order = tabSpecs.map((t) => t.id);
      const idx = order.indexOf(tab);
      if (idx < 0) return;
      let nextIdx = idx;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') nextIdx = (idx + 1) % order.length;
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') nextIdx = (idx - 1 + order.length) % order.length;
      else if (e.key === 'Home') nextIdx = 0;
      else if (e.key === 'End') nextIdx = order.length - 1;
      else return;
      e.preventDefault();
      const nextId = order[nextIdx];
      setTab(nextId);
      // Move focus to the newly selected tab (roving tabindex).
      requestAnimationFrame(() => tabRefs.current[nextId]?.focus());
    },
    [tab, tabSpecs],
  );

  // Subtitle / kicker copy that adapts to whether the user has a hero yet.
  const kickerCopy = heroName ? '✦ Your chronicle' : '✦ Begin your tale';
  const headlineCopy = heroName ? `${heroName}'s Aftertale` : 'Meet a hero';
  const subtitleCopy = heroName
    ? [heroRace, heroClass].filter(Boolean).join(' · ') || 'An AI-spun saga of your hero.'
    : 'An AI-spun saga of your hero. Roll a character, then walk the world.';

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <SpendBar onOpenSettings={openSettings} hasAnyKey={anyKey} />
      <main className="at-app-shell">
        <header className="at-app-header at-hero-anim" style={{ animationDelay: '60ms' }}>
          <p className="at-kicker">{kickerCopy}</p>
          <h1 className="at-app-headline">{headlineCopy}</h1>
          <p className="at-app-subtitle">{subtitleCopy}</p>
          <div className="at-app-ornament" aria-hidden="true">✦</div>
        </header>

        <nav
          className="at-tabs at-hero-anim"
          style={{ animationDelay: '120ms' }}
          role="tablist"
          aria-label="Aftertale sections"
          onKeyDown={onTabKey}
        >
          {tabSpecs.map((spec) => {
            const selected = tab === spec.id;
            return (
              <button
                key={spec.id}
                ref={(el) => { tabRefs.current[spec.id] = el; }}
                id={`at-tab-${spec.id}`}
                role="tab"
                type="button"
                aria-selected={selected}
                aria-controls={`at-panel-${spec.id}`}
                tabIndex={selected ? 0 : -1}
                className="at-tab"
                title={spec.title}
                onClick={() => setTab(spec.id)}
              >
                {spec.isDev && <span className="at-dev-pill" style={{ marginRight: '0.5rem' }}>DEV</span>}
                {spec.label}
              </button>
            );
          })}
        </nav>

        <div
          className="at-app-panel at-hero-anim"
          style={{ animationDelay: '180ms' }}
          role="tabpanel"
          id={`at-panel-${tab}`}
          aria-labelledby={`at-tab-${tab}`}
          tabIndex={0}
        >
          {tab === 'character' && <CharacterTab />}
          {tab === 'chronicle' && <ChronicleReader />}
          {tab === 'desk' && showDesk && <ScribesDesk />}
          {tab === 'npc' && SHOW_DEV_TOOLS && <NpcChat />}
          {tab === 'addon' && SHOW_DEV_TOOLS && <AddonSimulator />}
        </div>
      </main>
      <SettingsPanel
        open={settings.open}
        initialSection={settings.section}
        onClose={closeSettings}
      />
    </div>
  );
}
