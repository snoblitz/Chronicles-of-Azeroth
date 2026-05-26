// ============================================================================
// Per-event enrichment — turns one AddonEvent into an 80-150 word paragraph
// of in-world prose ready to ship back to the addon via the COA-CHRONICLE-V1
// blob. Mirrors the requestCampfireRecap pattern in ChronicleReader.tsx so
// spend tracking + provider selection stay consistent.
// ============================================================================

import type { AddonEvent } from './addonEvents';
import type { CharacterBible, LLMResponse } from '../types';
import { MODEL_CHOICES } from './modelChoices';
import { eventFactLine } from './sessionHistory';

export interface EnrichEventResult {
  paragraph: string;
  response: LLMResponse;
}

function bibleHeader(bible: CharacterBible): string {
  return [
    `Hero: ${bible.name}, ${bible.faction} ${bible.race} ${bible.class}`,
    typeof bible.level === 'number' ? `Level: ${bible.level}` : null,
    bible.currentZone ? `Current zone: ${bible.currentZone}` : null,
    bible.coreQuote ? `Core sentence: ${bible.coreQuote}` : null,
    '',
    'Voice:',
    bible.voice,
    '',
    'Motivations:',
    ...bible.motivations.map((m) => `- ${m}`),
    ...(bible.flaws && bible.flaws.length
      ? ['', 'Flaws:', ...bible.flaws.map((f) => `- ${f}`)]
      : []),
  ]
    .filter((line): line is string => line !== null)
    .join('\n');
}

function eventBlock(event: AddonEvent): string {
  const story = event.storyCard
    ? [
        `story moment: ${event.storyCard.moment}`,
        `setup: ${event.storyCard.setup}`,
        `player action: ${event.storyCard.playerAction}`,
        `outcome: ${event.storyCard.outcome}`,
        `emotional weight: ${event.storyCard.emotionalWeight}`,
      ].join('\n')
    : null;
  const questText = event.questTextEnrichment?.text.trim();
  return [
    `Event: ${eventFactLine(event)}`,
    event.zone ? `Zone: ${event.zone}${event.subZone ? ` (${event.subZone})` : ''}` : null,
    typeof event.playerLevel === 'number' ? `Player level at event: ${event.playerLevel}` : null,
    event.npcName ? `NPC: ${event.npcName}` : null,
    event.unitName ? `Unit: ${event.unitName}` : null,
    event.itemName ? `Item: ${event.itemName}` : null,
    story ? `\nStory card:\n${story}` : null,
    questText ? `\nIn-game quest text (player-captured):\n${questText}` : null,
  ]
    .filter((line): line is string => line !== null)
    .join('\n');
}

export function buildEventEnrichmentPrompt(event: AddonEvent, bible: CharacterBible): string {
  return [
    bibleHeader(bible),
    '',
    '---',
    '',
    eventBlock(event),
  ].join('\n');
}

const SYSTEM_PROMPT = [
  'You are the in-world chronicler for a personalized World of Warcraft RPG novel.',
  'Convert a single addon-observed event into one short, vivid prose paragraph the hero would read in their journal back at camp.',
  '',
  'Hard rules:',
  '- 80 to 150 words. One paragraph. No headings, no bullets, no lists.',
  '- Use ONLY the facts in the event block plus the hero voice. Do not invent NPCs, outcomes, locations, gear, or dialogue not present in the input.',
  '- Hero is the subject; second-person ("you") or third-person are both fine, but stay consistent within the paragraph.',
  '- No meta references: never mention the app, the addon, prompts, models, UI, the player, or the chronicle itself. Stay diegetic.',
  '- Forbidden phrases: destiny, prophecy, chosen one, ancient evil, called to adventure, the wider world beckoned.',
  '- Plain prose. No markdown. No quotes around the whole paragraph.',
].join('\n');

export async function enrichEvent(
  event: AddonEvent,
  bible: CharacterBible,
  modelIdx: number,
): Promise<EnrichEventResult> {
  const choice = MODEL_CHOICES[modelIdx];
  const provider = await choice.factory();
  const response = await provider.chat({
    task: 'summary',
    model: choice.pricingKey,
    maxTokens: 360,
    temperature: 0.75,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildEventEnrichmentPrompt(event, bible) },
    ],
  });
  return { paragraph: response.text.trim(), response };
}
