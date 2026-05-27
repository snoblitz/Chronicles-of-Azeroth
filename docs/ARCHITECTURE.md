# Architecture

> **Heads up (2026-05-26):** the multi-phase framing below describes the
> Phase 0 Browser POC accurately and is still useful as internal reference
> for how the codebase is structured today. The forward-looking "Phase 1 =
> Electron companion, Phase 2 = WoW addon" picture has been **superseded
> by the multi-tier launch architecture** in
> [`companion-architecture.md`](./companion-architecture.md). Read that
> first for the canonical current direction; come back here for Phase 0
> internals (provider contract, custom events, simulator flow).

Aftertale is a three-phase build. Each phase is deployable on its
own, and each one keeps the same **provider abstraction**, **spend tracker**,
and **character bible** primitives so nothing gets thrown away.

```
┌──────────────────────────────────────────────────────────────────────────┐
│  Phase 0: Browser POC               (current)                            │
│  ────────────────────────                                                │
│  Vite + React 19 + TS   →   OpenRouter (fetch)   →   localStorage        │
│                                                                          │
│  Validate: bible gen, NPC chat feel, cost per task, A/B model comparison │
└──────────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  Phase 1: Electron companion app                                         │
│  ────────────────────────────────                                        │
│  Electron 28 main process                                                │
│    ├─ better-sqlite3 + sqlite-vec   (durable storage + RAG)              │
│    ├─ chokidar                       (tail WoW chat log)                 │
│    ├─ keytar                         (OS keychain for API keys)          │
│    └─ provider adapters              (Gemini / Anthropic / OpenAI)       │
│  Renderer = same React 19 UI, talks to main via IPC                      │
│                                                                          │
│  Validate: full quest-log driven story without the addon, TTS pipeline   │
└──────────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  Phase 2: WoW addon (Path B — extend YUI-Dialogue)                       │
│  ────────────────────────────────────────────────                        │
│  Lua addon                                                               │
│    ├─ Hook QUEST_DETAIL, GOSSIP_SHOW, UNIT_SPELLCAST, COMBAT_LOG, etc.   │
│    ├─ Render NPC responses in-game via YUI-Dialogue's chrome             │
│    └─ Emit events via C_ChatInfo.SendAddonMessageLogged()                │
│  Electron app tails chat log → ingests events → drives narrative         │
└──────────────────────────────────────────────────────────────────────────┘
```

## Phase 0 internals

```
src/
├── App.tsx                   Tab shell: Character / Chronicle / NPC / Addon
├── main.tsx                  React 19 entry
├── index.css                 Leather-bound spellbook design system
├── types.ts                  ALL shared types (carry forward to Phase 1+)
├── pricing.ts                Per-model pricing table + calculateCost()
├── vite-env.d.ts             `vite/client` types so `tsc -b` is happy
│
├── components/
│   ├── SpendBar.tsx          Always-visible cost header (collapsible) + ⚙ Keys
│   ├── SettingsPanel.tsx     In-app API key entry modal (localStorage-backed)
│   ├── ModelPicker.tsx       Shared OpenRouter model dropdown
│   ├── CharacterSelector.tsx Active-hero dropdown in the header
│   ├── CharacterCreation.tsx Welcome → identity → interview → review → sheet
│   ├── NpcChat.tsx           NPC tavern + per-(hero × NPC) transcripts
│   ├── ChronicleReader.tsx   Story-reader + model-generated recap surface
│   └── AddonSimulator.tsx    Phase 0.75 WoW-addon event harness
│
├── lib/
│   ├── apiKeys.ts            localStorage-first key lookup + env fallback
│   ├── assetUrl.ts           Resolves /public/* paths against BASE_URL
│   ├── bibleStore.ts         Multi-character roster + envelopes + events
│   ├── presetCharacters.ts   Ships pre-built bibles (Magnus) in the bundle
│   ├── wowData.ts            Race/class/faction cascade (modern WoW scope)
│   ├── modelChoices.ts       Shared model registry for the picker
│   ├── npcCatalog.ts         Curated dwarven NPCs (Magni, Muradin, ...)
│   ├── npcChatStore.ts       Per-(hero × NPC) transcript persistence
│   ├── addonEvents.ts        WoW API-shaped normalized event contract
│   ├── addonEventStore.ts    localStorage raw event log
│   ├── addonIngest.ts        event → character bible / chronicle memory
│   ├── classicQuestFixtures.ts Classic quest-chain simulator fixtures
│   ├── sessionHistory.ts     Groups events into play sessions w/ stats
│   └── spendTracker.ts       localStorage usage log + averages + CSV export
│
└── providers/
    └── OpenRouterProvider.ts  Fetch wrapper, records usage; the only
                               LLM gateway. See docs/PROVIDERS.md.
```

### Key custom events

The app coordinates same-tab state changes via `CustomEvent` on `window`
(the native `storage` event only fires on *other* tabs):

| Event                  | Fired when                          | Listened by              |
| ---------------------- | ----------------------------------- | ------------------------ |
| `at:usage-updated`    | A provider records a usage entry    | `SpendBar`               |
| `at:bible-updated`    | Roster / active bible mutates       | `CharacterCreation`, `NpcChat`, `ChronicleReader` |
| `at:apikey-updated`   | A key is saved or cleared           | `App` (re-evaluates gate) |
| `at:request-tab`      | Component wants to navigate tabs    | `App`                    |
| `at:addon-event`      | An ingested addon event landed      | `ChronicleReader`        |


### Addon Simulator flow

The Addon Simulator is a Phase 0.75 bridge between the browser POC and the
future WoW addon. It emits normalized events shaped around real addon events
such as `QUEST_DETAIL`, `QUEST_ACCEPTED`, `QUEST_TURNED_IN`, `GOSSIP_SHOW`,
`ZONE_CHANGED_NEW_AREA`, and `COMBAT_LOG_EVENT_UNFILTERED`.

```
   User clicks "Emit next event"
        │
        ▼
   AddonSimulator.tsx
        │  selects Classic quest fixture step + WoW event template
        ▼
   createSimulatorEvent()
        │  builds AddonEvent { wowEvent, questId, npc, zone, storyCard }
        ▼
   ingestAddonEvent()
        │  1. records raw event in addonEventStore
        │  2. updates active CharacterBible level / zone
        │  3. appends meaningful quest turn-ins to bible.history
        ▼
    Character bible history
        │
        ├──► NpcChat prompt includes recent chronicled deeds
        │
        ▼
   ChronicleReader groups history into session/full-saga chapters
        │
        ▼
   Optional summary task writes a campfire recap from those entries
```

Quest fixtures store IDs, NPCs, Wowhead links, and authored story cards rather
than full quest text. The simulator includes a local-only quest-text/notes box
so runtime text captured from the game client can enrich a step without
shipping copied quest prose in the bundle.

### The provider contract

Every provider implements the same `LLMProvider` interface and **records its
own usage internally** in `chat()`. Call sites never need to think about cost
tracking — it just happens.

```ts
interface LLMProvider {
  readonly id: ProviderId;
  readonly models: readonly string[];
  chat(request: LLMRequest): Promise<LLMResponse>;
}
```

This is the most important pattern in the project. It means:

- Swapping providers is one constructor change.
- Adding a provider doesn't require touching the spend tracker.
- Phase 1's Electron IPC layer wraps `chat()` the same way the browser does.

See [PROVIDERS.md](./PROVIDERS.md) for details on adding a provider.

## Why this layering will survive

| Concern              | Phase 0          | Phase 1                | Phase 2          |
| -------------------- | ---------------- | ---------------------- | ---------------- |
| LLM calls            | provider adapter | **same adapter**       | **same adapter** |
| Cost tracking        | spend tracker    | **same module**        | **same module**  |
| Character bible      | localStorage     | SQLite (same schema)   | unchanged        |
| Memory / RAG         | none             | sqlite-vec embeddings  | unchanged        |
| Quest / event source | manual text box  | manual + chat tail     | live addon       |
| UI                   | React in browser | React in Electron      | unchanged        |
| Storage              | localStorage     | SQLite via main process| unchanged        |

The provider interface, pricing table, types, and spend tracker are intended
to be **lift-and-shift** from Phase 0 into Phase 1 with no code changes other
than how the LLM HTTP call is dispatched (browser fetch → Electron IPC).
