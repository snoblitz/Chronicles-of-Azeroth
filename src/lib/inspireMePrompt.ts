/**
 * Inspire Me prompt builder + response parser.
 *
 * The Inspire Me feature lives on every open-text field of the
 * onboarding wizard. One click generates 3 distinct starting-point
 * suggestion cards. Players can use, regenerate, mix, or dismiss.
 *
 * This module is the brain. It owns:
 *   - the prompt template (single source of truth, version-tagged)
 *   - the JSON response schema and a tolerant parser
 *   - the Mix-mode variant that merges two prior suggestions
 *
 * Inputs come from three layers (in order of weight):
 *   1. PersonalityProfile          -- the locked-down chip selections
 *   2. Observed character data     -- name/race/class/faction/zone
 *      from the addon's SavedVariables
 *   3. Third-party intel (optional)-- best-effort summary from other
 *      addons' SavedVariables
 *
 * Plus the immediate context:
 *   - The current open-text question being answered
 *   - Any prior answers given in this wizard (for consistency)
 *
 * Output is strict JSON. Each suggestion has a 2-5 word title hint and
 * a 2-3 sentence body. We aim for ~40-80 words of body per suggestion.
 *
 * Prompt versioning: bump INSPIRE_ME_PROMPT_VERSION whenever the template
 * changes shape. Cached/persisted responses can be keyed on it.
 */

import {
  PERSONALITY_BUCKETS,
  PERSONALITY_OPTION_INDEX,
  pickInspirationHints,
  resolveProfile,
  type PersonalityProfile,
  type TraitBucketId,
} from './personalityTraits';

export const INSPIRE_ME_PROMPT_VERSION = 1;

/**
 * Stable identity + first-seen snapshot, mirrors the addon's
 * ChroniclesOfAzerothDB.characters[guid] record. Only the fields we
 * actually splice into the prompt are required here -- the wizard
 * passes a subset, the addon writes a superset.
 */
export interface InspireMeCharacterContext {
  name: string;
  race: string;           // e.g. "Dwarf"
  class: string;          // e.g. "Rogue"
  sex: 1 | 2 | 3;         // 1=neutral, 2=male, 3=female per Blizzard
  faction?: string;       // "Alliance" | "Horde" | "Neutral"
  classification: 'brand-new' | 'boosted' | 'pre-existing';
  level: number;
  zone?: string;
  subzone?: string;
}

/**
 * Best-effort intel from other addons' SavedVariables. Free-form
 * because we cannot predict what shape the scanner will surface. The
 * prompt template will splice this in as a labeled block and let the
 * LLM decide what's narratively useful.
 */
export interface InspireMeIntel {
  source: string;          // human-readable origin: "Altoholic", "WoWCombatLog-052526.txt", etc.
  summary: string;         // 1-3 sentence summary the scanner produced
}

export interface InspireMePriorAnswer {
  question: string;
  answer: string;
}

export interface InspireMeContext {
  character: InspireMeCharacterContext;
  profile: PersonalityProfile;
  intel?: InspireMeIntel[];
  priorAnswers?: InspireMePriorAnswer[];
  currentQuestion: string;
  /**
   * Optional player-provided seed text. If they typed something into
   * the field before clicking Inspire Me, we feed it back so the
   * suggestions can build on it rather than ignore it.
   */
  draft?: string;
  /**
   * Click counter for the current question, 0-indexed. Drives the
   * rotation of inspirationHints across suggestion cards so repeated
   * Inspire Me clicks on the same field produce genuinely different
   * angles, not rephrased versions of the same three suggestions.
   */
  clickIndex: number;
}

export interface InspireMeSuggestion {
  title: string;   // 2-5 words, evocative hint
  text: string;    // 2-3 sentences, ~40-80 words
}

export interface InspireMeResponse {
  suggestions: InspireMeSuggestion[];
}

/**
 * Human-readable pronouns derived from UnitSex. Used in the prompt so
 * the LLM doesn't have to infer.
 */
function pronouns(sex: 1 | 2 | 3): { subject: string; object: string; possessive: string } {
  if (sex === 2) return { subject: 'he', object: 'him', possessive: 'his' };
  if (sex === 3) return { subject: 'she', object: 'her', possessive: 'her' };
  return { subject: 'they', object: 'them', possessive: 'their' };
}

/**
 * Format a character context as a labeled block for the prompt.
 */
function formatCharacterBlock(c: InspireMeCharacterContext): string {
  const p = pronouns(c.sex);
  const factionLine = c.faction ? `- Faction: ${c.faction}\n` : '';
  const locationLine = c.zone
    ? `- Current location: ${c.zone}${c.subzone ? ` (${c.subzone})` : ''}\n`
    : '';
  return (
    `- Name: ${c.name}\n` +
    `- Race: ${c.race}\n` +
    `- Class: ${c.class}\n` +
    `- Pronouns: ${p.subject}/${p.object}/${p.possessive}\n` +
    factionLine +
    `- Level: ${c.level}\n` +
    locationLine +
    `- Classification: ${c.classification}  (${classificationGuidance(c.classification)})`
  );
}

function classificationGuidance(c: InspireMeCharacterContext['classification']): string {
  switch (c) {
    case 'brand-new':
      return 'just born into the world -- their story starts now, use birth/awakening framing';
    case 'boosted':
      return 'arrived in the middle of the world with no remembered beginning -- frame as veteran-summoned or amnesiac';
    case 'pre-existing':
      return 'we are joining their story already in motion -- acknowledge the unseen past, do not pretend to know it';
  }
}

/**
 * Format the personality profile + the rotating inspiration hints
 * picked for THIS click. The hints push suggestion variety -- without
 * them, three Inspire Me clicks on the same field tend to converge.
 */
function formatProfileBlock(profile: PersonalityProfile, clickIndex: number): string {
  const resolved = resolveProfile(profile);
  const hints = pickInspirationHints(profile, clickIndex);
  const hintsByBucket = new Map<TraitBucketId, string>();
  for (const h of hints) hintsByBucket.set(h.bucketId, h.hint);

  const lines: string[] = [];
  for (const bucket of PERSONALITY_BUCKETS) {
    const r = resolved.find((x) => x.bucketId === bucket.id);
    if (!r) continue;
    const hint = hintsByBucket.get(bucket.id);
    const hintFragment = hint ? `  (concrete detail: ${hint})` : '';
    lines.push(`- ${r.bucketLabel}: ${r.optionLabel} -- ${r.optionDescription}${hintFragment}`);
  }
  return lines.join('\n');
}

function formatIntelBlock(intel?: InspireMeIntel[]): string {
  if (!intel || intel.length === 0) return '';
  const lines = intel.map((i) => `- ${i.source}: ${i.summary}`);
  return `\nAdditional intel gathered from other addons / logs:\n${lines.join('\n')}\n`;
}

function formatPriorAnswersBlock(priorAnswers?: InspireMePriorAnswer[]): string {
  if (!priorAnswers || priorAnswers.length === 0) return '';
  const lines = priorAnswers.map(
    (p) => `- Q: ${p.question}\n  A: ${p.answer.trim()}`,
  );
  return (
    `\nThe player has already answered these earlier wizard questions. ` +
    `Stay internally consistent with these:\n${lines.join('\n')}\n`
  );
}

function formatDraftBlock(draft?: string): string {
  if (!draft || !draft.trim()) return '';
  return (
    `\nThe player has already started typing this answer. Build on it ` +
    `rather than ignoring it:\n"${draft.trim()}"\n`
  );
}

/**
 * Build the full Inspire Me prompt. The output is a single user-role
 * message ready to feed into the existing LLMProvider abstraction.
 *
 * Token budget: ~600-900 input tokens depending on intel + prior
 * answers. Output is constrained to ~250-400 tokens via the response
 * shape and explicit length guidance.
 */
export function buildInspireMePrompt(context: InspireMeContext): string {
  const characterBlock = formatCharacterBlock(context.character);
  const profileBlock = formatProfileBlock(context.profile, context.clickIndex);
  const intelBlock = formatIntelBlock(context.intel);
  const priorBlock = formatPriorAnswersBlock(context.priorAnswers);
  const draftBlock = formatDraftBlock(context.draft);

  return `You are a story-development assistant helping a World of Warcraft player flesh out their character's narrative. The player has selected fixed personality traits and is now answering an open-text question. Your job is to produce THREE distinct starting-point suggestions they can either use as-written, edit freely, or ignore.

CHARACTER
${characterBlock}

PERSONALITY (these are FIXED -- the player chose them, do not contradict them)
${profileBlock}
${intelBlock}${priorBlock}${draftBlock}
CURRENT QUESTION
"${context.currentQuestion}"

VOICE RULES (read these carefully -- the first draft will likely violate them)

- Write as if the player wrote it themselves. Close-third or first person, in-world, committed prose. NEVER explain the traits ("his disposition as a Cynic...", "her drive for Coin..."). Embody them. The traits should be SHOWN through specific behavior and history, not NAMED.
- No hedging. Forbidden words and phrases: "perhaps", "likely", "might have", "could have", "not necessarily", "may have", "possibly". Commit to one concrete past per card.
- Invent specific proper nouns where it serves the story: names of people (a sister, a creditor, a foreman, a foe), places (a specific tavern, a specific mine, a specific road), objects (a specific weapon, a specific letter, a specific debt). One or two per card. The more specific, the better.
- Hard length cap: 70 words MAXIMUM per card body. Count as you write. Cut every word that doesn't earn its place.
- End on a concrete hook -- a name, a place, an object, an unfinished thought, an unanswered question. Bad hooks: "the adventure began", "new prospects awaited", "a score to settle". Good hooks: "the letter from Brigga he has not opened", "the night Old Karn went quiet", "a debt to Maglin Steelhand he could no longer outrun".
- Avoid generic high-fantasy clichés. Forbidden: "destined", "chosen one", "prophecy", "ancient evil", "called to adventure", "fate", "heeded the call", "the wider world beckoned".

CARD CONSTRUCTION

Produce exactly 3 suggestion cards. Each card must:

1. Anchor on a DIFFERENT "concrete detail" hint from the personality block above -- one hint per card, do not reuse a hint across cards.
2. Tell a different facet of the answer (e.g., card 1 might be about people, card 2 about a specific event, card 3 about an inner conflict).
3. Reference ${context.character.name} by name. Reference ${context.character.race}, ${context.character.class}, and ${context.character.zone ? `the area around ${context.character.zone}` : 'their world'} where it earns its place.
4. Match the classification voice: ${classificationGuidance(context.character.classification)}.
5. Stay consistent with any prior answers above.
6. Get a short evocative title (2-5 words) hinting at the angle. Good: "The Quiet Path", "Burned by Coin", "A Name Kept Warm". Bad: "Backstory", "Option 1", "An Adventure Begins".

OUTPUT

Respond with ONLY a JSON object in this exact shape (no markdown fences, no commentary before or after):

{
  "suggestions": [
    { "title": "...", "text": "..." },
    { "title": "...", "text": "..." },
    { "title": "...", "text": "..." }
  ]
}`;
}

/**
 * Mix-mode: the player picked two of the three suggestions and asked
 * the LLM to merge them into a fourth. The output is a single
 * suggestion, not three.
 */
export interface InspireMeMixContext {
  character: InspireMeCharacterContext;
  profile: PersonalityProfile;
  currentQuestion: string;
  /** The two suggestions the player chose to merge. */
  sourceA: InspireMeSuggestion;
  sourceB: InspireMeSuggestion;
}

export interface InspireMeMixResponse {
  suggestion: InspireMeSuggestion;
}

export function buildInspireMeMixPrompt(context: InspireMeMixContext): string {
  return `You are merging two character-backstory suggestions into a single coherent third option for a World of Warcraft player's onboarding wizard.

CHARACTER
${formatCharacterBlock(context.character)}

PERSONALITY (FIXED)
${formatProfileBlock(context.profile, 0)}

CURRENT QUESTION
"${context.currentQuestion}"

SUGGESTION A -- "${context.sourceA.title}"
${context.sourceA.text}

SUGGESTION B -- "${context.sourceB.title}"
${context.sourceB.text}

TASK
Produce a SINGLE merged suggestion that honors elements from both A and B while remaining a coherent, naturally-flowing 2-3 sentence answer (40-80 words). Do not mention "Suggestion A" or "Suggestion B" in the output. Do not include both opposing ideas if they contradict -- pick the more interesting tension and resolve it. End on a specific, expandable hook. Avoid generic fantasy clichés.

OUTPUT
Respond with ONLY a JSON object in this exact shape (no markdown fences, no commentary before or after):

{
  "suggestion": { "title": "...", "text": "..." }
}`;
}

// ----------------------------------------------------------------------------
// Response parsing
// ----------------------------------------------------------------------------

export class InspireMeParseError extends Error {
  constructor(
    message: string,
    public readonly raw: string,
  ) {
    super(message);
    this.name = 'InspireMeParseError';
  }
}

/**
 * Tolerantly parse the LLM's JSON output. Strips markdown fences,
 * trims whitespace, and validates the response shape. Throws
 * InspireMeParseError with the raw text attached on failure so the
 * caller can decide whether to retry.
 */
export function parseInspireMeResponse(raw: string): InspireMeResponse {
  const cleaned = stripJsonFences(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    throw new InspireMeParseError(
      `Could not parse JSON: ${(e as Error).message}`,
      raw,
    );
  }
  if (!isObject(parsed) || !Array.isArray(parsed.suggestions)) {
    throw new InspireMeParseError(
      'Response is missing the suggestions array.',
      raw,
    );
  }
  if (parsed.suggestions.length !== 3) {
    throw new InspireMeParseError(
      `Expected exactly 3 suggestions, got ${parsed.suggestions.length}.`,
      raw,
    );
  }
  const suggestions: InspireMeSuggestion[] = [];
  for (let i = 0; i < parsed.suggestions.length; i++) {
    const s = parsed.suggestions[i];
    if (!isObject(s) || typeof s.title !== 'string' || typeof s.text !== 'string') {
      throw new InspireMeParseError(
        `Suggestion ${i} is missing title or text.`,
        raw,
      );
    }
    if (!s.title.trim() || !s.text.trim()) {
      throw new InspireMeParseError(
        `Suggestion ${i} has empty title or text.`,
        raw,
      );
    }
    suggestions.push({ title: s.title.trim(), text: s.text.trim() });
  }
  return { suggestions };
}

export function parseInspireMeMixResponse(raw: string): InspireMeMixResponse {
  const cleaned = stripJsonFences(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    throw new InspireMeParseError(
      `Could not parse Mix JSON: ${(e as Error).message}`,
      raw,
    );
  }
  if (!isObject(parsed) || !isObject(parsed.suggestion)) {
    throw new InspireMeParseError('Mix response is missing the suggestion object.', raw);
  }
  const s = parsed.suggestion;
  if (typeof s.title !== 'string' || typeof s.text !== 'string') {
    throw new InspireMeParseError('Mix suggestion is missing title or text.', raw);
  }
  if (!s.title.trim() || !s.text.trim()) {
    throw new InspireMeParseError('Mix suggestion has empty title or text.', raw);
  }
  return { suggestion: { title: s.title.trim(), text: s.text.trim() } };
}

/**
 * Strip ```json ... ``` fences if the model added them despite instructions.
 */
function stripJsonFences(s: string): string {
  const trimmed = s.trim();
  if (trimmed.startsWith('```')) {
    return trimmed
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '')
      .trim();
  }
  return trimmed;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

// ----------------------------------------------------------------------------
// Validation helpers (used by callers to gate the LLM call upfront)
// ----------------------------------------------------------------------------

export function validateInspireMeContext(ctx: InspireMeContext): string[] {
  const errors: string[] = [];
  if (!ctx.character?.name?.trim()) errors.push('character.name is required');
  if (!ctx.character?.race?.trim()) errors.push('character.race is required');
  if (!ctx.character?.class?.trim()) errors.push('character.class is required');
  if (!ctx.currentQuestion?.trim()) errors.push('currentQuestion is required');
  if (ctx.clickIndex == null || ctx.clickIndex < 0) errors.push('clickIndex must be >= 0');
  // Validate profile via taxonomy
  for (const bucket of PERSONALITY_BUCKETS) {
    const optionId = ctx.profile?.[bucket.id as keyof PersonalityProfile] as string | undefined;
    if (!optionId) {
      errors.push(`profile.${bucket.id} is required`);
      continue;
    }
    if (!PERSONALITY_OPTION_INDEX.has(`${bucket.id}.${optionId}`)) {
      errors.push(`profile.${bucket.id} = '${optionId}' is not a known option`);
    }
  }
  return errors;
}
