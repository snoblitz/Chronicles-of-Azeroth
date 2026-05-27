/**
 * Loremaster Polish — turn a user's raw chronicle scribble into clean prose
 * in their hero's voice. No facts added, no length inflation. Spelling,
 * grammar, and rhythm only.
 *
 * The provider is whichever model the user has selected in Settings; spend
 * tracking happens inside provider.chat() with task='loremaster-polish'.
 */

import type { CharacterBible, LLMProvider } from '../types';

export interface LoremasterContext {
  /** The hero's bible — gives the polish its voice + faction context. */
  bible: CharacterBible;
  /** Optional in-the-moment context the user filled in via pills. */
  level?: number;
  zone?: string;
  quest?: string;
  companions?: string;
  /** Single-select mood label (e.g. "Triumph", "Defeat"). Empty for none. */
  mood?: string;
}

export interface LoremasterPolishOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface LoremasterPolishResult {
  polished: string;
  raw: string;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
}

export class LoremasterPolishError extends Error {
  constructor(message: string, public cause?: unknown) {
    super(message);
    this.name = 'LoremasterPolishError';
  }
}

const DEFAULT_TEMPERATURE = 0.4; // low — we want polish, not invention
const DEFAULT_MAX_TOKENS = 800;

export function buildLoremasterPrompt(
  draft: string,
  ctx: LoremasterContext,
): string {
  const { bible } = ctx;
  const lines: string[] = [];

  lines.push(
    `You are the Loremaster of Aftertale — a careful scribe who turns a hero's rough notes into clean, vivid first-person chronicle prose. You preserve the hero's voice. You do not invent.`,
  );
  lines.push('');
  lines.push(`# The hero`);
  lines.push(`- Name: ${bible.name}`);
  lines.push(`- Race / Class: ${bible.race} ${bible.class}`);
  lines.push(`- Faction: ${bible.faction}`);
  if (bible.homeland) lines.push(`- Homeland: ${bible.homeland}`);
  if (bible.voice) lines.push(`- Voice: ${bible.voice}`);
  if (bible.coreQuote) lines.push(`- Core quote: "${bible.coreQuote}"`);
  lines.push('');

  const pillBits: string[] = [];
  if (typeof ctx.level === 'number') pillBits.push(`Level ${ctx.level}`);
  if (ctx.zone) pillBits.push(`Zone: ${ctx.zone}`);
  if (ctx.quest) pillBits.push(`Quest: ${ctx.quest}`);
  if (ctx.companions) pillBits.push(`With: ${ctx.companions}`);
  if (ctx.mood) pillBits.push(`Tone: ${ctx.mood}`);
  if (pillBits.length > 0) {
    lines.push(`# This entry's context`);
    pillBits.forEach((b) => lines.push(`- ${b}`));
    lines.push('');
  }

  lines.push(`# The hero's draft`);
  lines.push('"""');
  lines.push(draft.trim());
  lines.push('"""');
  lines.push('');

  lines.push(`# Your task`);
  lines.push(
    `Rewrite the draft as a single chronicle entry in the hero's first-person voice. Rules:`,
  );
  lines.push(`- Fix spelling, grammar, and punctuation.`);
  lines.push(`- Keep every event, person, and place the hero mentioned. Preserve their meaning exactly.`);
  lines.push(`- Do NOT invent new events, NPCs, items, or dialogue. Do NOT add facts the hero did not write.`);
  lines.push(`- Match the requested tone if one is given.`);
  lines.push(`- Stay roughly the same length — never more than twice as long. Tighten when you can.`);
  lines.push(`- Use 1–3 short paragraphs. No headings, no bullet lists, no markdown.`);
  lines.push(`- Output ONLY the polished prose. No preamble, no commentary, no quotes around it.`);

  return lines.join('\n');
}

export async function polishChronicleEntry(
  draft: string,
  ctx: LoremasterContext,
  provider: LLMProvider,
  modelPricingKey: string,
  options: LoremasterPolishOptions = {},
): Promise<LoremasterPolishResult> {
  if (!draft.trim()) {
    throw new LoremasterPolishError('Draft is empty — write something first.');
  }

  const prompt = buildLoremasterPrompt(draft, ctx);
  const start = performance.now();

  let response;
  try {
    response = await provider.chat({
      task: 'loremaster-polish',
      model: options.model ?? modelPricingKey,
      messages: [{ role: 'user', content: prompt }],
      temperature: options.temperature ?? DEFAULT_TEMPERATURE,
      maxTokens: options.maxTokens ?? DEFAULT_MAX_TOKENS,
    });
  } catch (e) {
    throw new LoremasterPolishError(
      `The Loremaster fell silent: ${(e as Error).message}`,
      e,
    );
  }

  const latencyMs = Math.round(performance.now() - start);
  const polished = response.text.trim().replace(/^["""'']+|["""'']+$/g, '').trim();

  if (!polished) {
    throw new LoremasterPolishError('The Loremaster returned an empty page.');
  }

  return {
    polished,
    raw: response.text,
    latencyMs,
    inputTokens: response.inputTokens ?? 0,
    outputTokens: response.outputTokens ?? 0,
  };
}
