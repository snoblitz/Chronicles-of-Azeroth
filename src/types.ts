// ============================================================================
// Shared types — these carry forward into Phase 1 (Electron) and beyond.
// Keep them stable and well-named.
// ============================================================================

export type ProviderId = 'gemini' | 'anthropic';

export type TaskType =
  | 'npc-chat'      // turn-by-turn dialog with an NPC
  | 'bible-gen'    // create or update the character bible
  | 'summary'       // scene / arc / chapter summarization
  | 'embedding';    // RAG retrieval embeddings

export type ModelTier = 'free' | 'paid';

// ----------------------------------------------------------------------------
// Spend tracker
// ----------------------------------------------------------------------------

export interface UsageRecord {
  id: string;
  timestamp: number;
  provider: ProviderId;
  model: string;
  task: TaskType;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  costUsd: number;
  tier: ModelTier;
  latencyMs?: number;
}

export interface TaskAverages {
  task: TaskType;
  model: string;
  calls: number;
  avgInput: number;
  avgCached: number;
  avgOutput: number;
  avgCostUsd: number;
  totalCostUsd: number;
}

// ----------------------------------------------------------------------------
// Character bible (Phase 0: a single JSON-stringified envelope in localStorage)
// ----------------------------------------------------------------------------

export interface CharacterBible {
  name: string;
  race: string;        // e.g. 'Human', 'Night Elf', 'Forsaken'
  class: string;       // e.g. 'Paladin', 'Death Knight'
  faction: 'Alliance' | 'Horde';
  age?: number;
  homeland?: string;   // e.g. 'Stormwind', 'Lordaeron'
  backstory: string;   // freeform narrative, 1-3 paragraphs
  beliefs: string[];   // short bullet points
  motivations: string[];
  fears?: string[];    // what they're scared of becoming/losing/failing
  flaws?: string[];    // limitations, blind spots, recurring hesitations
  coreQuote?: string;  // a single sentence that distills the whole hero
  voice: string;       // how they speak — tone, vocabulary, mannerisms

  // ---- Dynamic in-world state (mutable as the hero plays) ----
  level?: number;             // current player level (1-80)
  currentZone?: string;       // current zone, e.g. 'Westfall'
  history?: HistoryEntry[];   // chronological journal, oldest first

  createdAt: number;
  updatedAt: number;
  // Phase 1+ will add: relationships, scars, vows, contradictions, etc.
}

export interface HistoryEntry {
  id: string;          // stable unique id
  timestamp: number;   // ms epoch
  text: string;        // e.g. "Slew Hogger near Goldshire"
  zone?: string;       // snapshot of zone at the time
  level?: number;      // snapshot of level at the time
}

// Versioned envelope so Phase 1 (SQLite migration) can detect old shapes.
export interface BibleEnvelope {
  schemaVersion: number;
  savedAt: number;
  bible: CharacterBible;
}

// ----------------------------------------------------------------------------
// LLM provider abstraction — swap models per task with one config change
// ----------------------------------------------------------------------------

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMRequest {
  task: TaskType;
  messages: ChatMessage[];
  model: string;
  maxTokens?: number;
  temperature?: number;
  // Future: cacheable prefix marker for prompt caching
}

export interface LLMResponse {
  text: string;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  model: string;
  provider: ProviderId;
  latencyMs: number;
  /** Normalized stop reason. 'truncated' = hit maxTokens, 'end' = natural stop. */
  stopReason: 'end' | 'truncated' | 'other';
}

export interface LLMProvider {
  readonly id: ProviderId;
  readonly models: readonly string[];
  chat(request: LLMRequest): Promise<LLMResponse>;
}
