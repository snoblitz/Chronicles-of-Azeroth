/**
 * Personality trait taxonomy for the onboarding wizard.
 *
 * Phase 1.5 / personality + Inspire Me layer.
 *
 * The wizard presents five buckets and asks the player to pick exactly
 * one option from each. The resulting `PersonalityProfile` becomes
 * character DNA -- persisted on the character record and fed into every
 * future chapter generator call, not just the prologue.
 *
 * Design rules locked 2026-05-25:
 *   - Five buckets, one selection per bucket, all required.
 *   - No free-text write-in. The whole point of this layer is to shield
 *     non-RP writers from cold-start prose.
 *   - Every option commits the character to a direction. No "balanced",
 *     "average", or "depends" choices.
 *   - The Flaw bucket is the secret weapon -- it's the bucket that
 *     most reliably produces interesting story hooks. Always required.
 *
 * Adding new options later is non-breaking. Adding new buckets requires
 * a migration on existing `PersonalityProfile` records.
 */

export type TraitBucketId =
  | 'disposition'
  | 'moralCompass'
  | 'socialStyle'
  | 'drive'
  | 'flaw';

/**
 * A single chip the player can pick within a bucket.
 *
 * `inspirationHints` are short fragments the LLM prompt can splice in to
 * push suggestion variety -- e.g., for "Prideful" we might include
 * ["refuses help even when it would save them", "blind to their own
 * weaknesses", "scornful of perceived inferiors"]. The prompt picks a
 * random hint per suggestion to avoid every Inspire Me call producing
 * the same three angles.
 */
export interface TraitOption {
  id: string;
  label: string;
  description: string;
  inspirationHints: readonly string[];
}

export interface TraitBucket {
  id: TraitBucketId;
  label: string;
  description: string;
  options: readonly TraitOption[];
}

/**
 * A complete selection. Every field is required after wizard completion.
 *
 * Field names map 1:1 to bucket IDs so a profile is trivially derived
 * from the wizard state and trivially fed into prompt templates.
 */
export interface PersonalityProfile {
  disposition: string; // TraitOption.id
  moralCompass: string;
  socialStyle: string;
  drive: string;
  flaw: string;
  chosenAt: number; // unix seconds
  source: 'wizard' | 'imported' | 'manually-edited';
}

export const PERSONALITY_BUCKETS: readonly TraitBucket[] = [
  {
    id: 'disposition',
    label: 'Disposition',
    description: 'Their natural temperament. Seeds the voice and tone of narration.',
    options: [
      {
        id: 'stoic',
        label: 'Stoic',
        description: 'Slow to react. Words chosen carefully. Emotion held close.',
        inspirationHints: [
          'reacts to good and bad news with the same level brow',
          'speaks rarely, but when they speak others listen',
          'holds grief and joy at arm\'s length',
        ],
      },
      {
        id: 'hotheaded',
        label: 'Hot-headed',
        description: 'Feels first, thinks later. Quick to anger, quick to forgive.',
        inspirationHints: [
          'has thrown a punch over a misheard comment',
          'apologises sincerely an hour after every outburst',
          'cannot sit still when wronged',
        ],
      },
      {
        id: 'cheerful',
        label: 'Cheerful',
        description: 'Finds the bright edge of every shadow. Unsettling to the grim.',
        inspirationHints: [
          'hums in dungeons',
          'remembers the names of every barmaid and stableboy',
          'jokes at the worst possible moment, and means it kindly',
        ],
      },
      {
        id: 'cynical',
        label: 'Cynical',
        description: 'Expects the worst, is rarely disappointed. Dry, often correct.',
        inspirationHints: [
          'never trusts a smiling stranger',
          'has a story for why every plan will fail',
          'is also, secretly, the one who quietly makes it work anyway',
        ],
      },
      {
        id: 'anxious',
        label: 'Anxious',
        description: 'The mind races ahead to every disaster. Often wrong, sometimes right.',
        inspirationHints: [
          'rehearses conversations that never happen',
          'sleeps poorly the night before any journey',
          'is the first to notice a real threat because they\'ve imagined them all',
        ],
      },
      {
        id: 'serene',
        label: 'Serene',
        description: 'Calm in storms. Unhurried. Faintly unnerving.',
        inspirationHints: [
          'breathes evenly under arrow fire',
          'has watched far worse than this and survived',
          'makes others feel watched in a way they can\'t name',
        ],
      },
    ],
  },
  {
    id: 'moralCompass',
    label: 'Moral Compass',
    description: 'How they navigate hard choices. Seeds their behavior in dilemmas.',
    options: [
      {
        id: 'honorable',
        label: 'Honorable',
        description: 'Their word is iron. Will lose to win clean.',
        inspirationHints: [
          'has refused a payout that came from a betrayal',
          'shakes hands with enemies after the fight',
          'is mocked for it by people who quietly rely on it',
        ],
      },
      {
        id: 'pragmatic',
        label: 'Pragmatic',
        description: 'Whatever works. Distrusts grand principles.',
        inspirationHints: [
          'has bribed a guard and tipped him generously',
          'will lie to save a life without flinching',
          'cannot understand people who die for an idea',
        ],
      },
      {
        id: 'ruthless',
        label: 'Ruthless',
        description: 'The ends justify any means. The cold call comes easy.',
        inspirationHints: [
          'has finished a downed opponent who asked for mercy',
          'sleeps well at night',
          'tells themselves it was necessary, and is usually right',
        ],
      },
      {
        id: 'naive',
        label: 'Naive',
        description: 'Believes the best of people. Has been hurt by it. Hasn\'t learned.',
        inspirationHints: [
          'has been robbed by someone they helped',
          'gave them coin the next time anyway',
          'somehow keeps finding genuinely good people because of it',
        ],
      },
      {
        id: 'conflicted',
        label: 'Conflicted',
        description: 'Knows what\'s right. Wants what\'s easier. Lives in the gap.',
        inspirationHints: [
          'argues with themselves on long roads',
          'has done one shameful thing they cannot stop replaying',
          'is harder on themselves than any priest',
        ],
      },
      {
        id: 'devout',
        label: 'Devout',
        description: 'Their faith is the spine of their life. Every act referred upward.',
        inspirationHints: [
          'prays before drawing steel',
          'sees omens in things others ignore',
          'has had at least one moment they will not call coincidence',
        ],
      },
    ],
  },
  {
    id: 'socialStyle',
    label: 'Social Style',
    description: 'How they move among others. Seeds the texture of every NPC scene.',
    options: [
      {
        id: 'lonewolf',
        label: 'Lone wolf',
        description: 'Prefers their own company. Trusts crowds least.',
        inspirationHints: [
          'has not slept under a stranger\'s roof in years',
          'eats apart from the camp by choice',
          'is more comfortable on the road than in a city',
        ],
      },
      {
        id: 'packanimal',
        label: 'Pack animal',
        description: 'Comes alive in company. Loneliness is the wound.',
        inspirationHints: [
          'cannot bear to dine alone',
          'has more friends than they can keep track of, and worries about each',
          'will join a tavern\'s game of dice within a minute of sitting down',
        ],
      },
      {
        id: 'charmer',
        label: 'Charmer',
        description: 'Reads a room in a glance. Wins hearts on purpose.',
        inspirationHints: [
          'knows three jokes that work in any tongue',
          'has talked their way past a closed gate more than once',
          'is half-suspected, by themselves, of being too good at it',
        ],
      },
      {
        id: 'suspicious',
        label: 'Suspicious',
        description: 'Every smile gets weighed. Trust is earned in years.',
        inspirationHints: [
          'sits with their back to the wall',
          'has not been wrong yet about a person who turned',
          'has also been wrong, badly, about a person who didn\'t',
        ],
      },
      {
        id: 'loyal',
        label: 'Loyal',
        description: 'Few bonds, deep ones. Would die for the right name.',
        inspirationHints: [
          'wears a token of someone they\'d cross any ocean for',
          'will not gossip about an absent friend, ever',
          'has made enemies by refusing to abandon someone they should have',
        ],
      },
      {
        id: 'aloof',
        label: 'Aloof',
        description: 'Present, but not quite among. Hard to read, easy to misjudge.',
        inspirationHints: [
          'is often described as cold by people who don\'t know them',
          'has, in private, surprising warmth for a chosen few',
          'unsettles those who expect either friendship or hostility and get neither',
        ],
      },
    ],
  },
  {
    id: 'drive',
    label: 'Drive',
    description: 'What pulls them forward. Seeds the engine of every chapter.',
    options: [
      {
        id: 'glory',
        label: 'Glory',
        description: 'To be sung of. To have their name outlast their bones.',
        inspirationHints: [
          'has imagined their own ballad since they were small',
          'fears obscurity more than death',
          'pushes when wisdom says hold back',
        ],
      },
      {
        id: 'knowledge',
        label: 'Knowledge',
        description: 'To know the thing. To touch the page no one has read.',
        inspirationHints: [
          'carries a journal half-full of half-finished questions',
          'will detour for a rumor of a buried library',
          'has been called nosy, scholarly, and dangerous in the same week',
        ],
      },
      {
        id: 'coin',
        label: 'Coin',
        description: 'Comfort. Security. The freedom money buys, and they have known its absence.',
        inspirationHints: [
          'remembers, exactly, the last time they went hungry',
          'has a hidden reserve no one knows about',
          'is generous in public, careful in private',
        ],
      },
      {
        id: 'vengeance',
        label: 'Vengeance',
        description: 'One name kept warm. One debt unpaid. The fire that won\'t go out.',
        inspirationHints: [
          'has a list, written once, never lengthened',
          'has refused easier paths because they led the wrong direction',
          'is not sure who they will be when the list is finished',
        ],
      },
      {
        id: 'family',
        label: 'Family',
        description: 'Blood or chosen. Every step taken with them in mind.',
        inspirationHints: [
          'sends letters home that come back to no one',
          'has refused a king\'s favor that would have meant leaving them',
          'measures every gold piece against what it could buy them',
        ],
      },
      {
        id: 'faith',
        label: 'Faith',
        description: 'A calling, heard and answered. The path is not theirs to question.',
        inspirationHints: [
          'has felt watched at moments others would call empty',
          'serves a master that has not yet shown its full face',
          'cannot explain to outsiders what they cannot un-know',
        ],
      },
      {
        id: 'freedom',
        label: 'Freedom',
        description: 'No collar. No master. No road they did not choose.',
        inspirationHints: [
          'has walked out on a position that would have made them safe',
          'sleeps better under sky than roof',
          'has paid in money and friends for the right to leave any room',
        ],
      },
    ],
  },
  {
    id: 'flaw',
    label: 'Flaw',
    description:
      'The crack in the foundation. The most important field -- forced because good characters have flaws, and the LLM writes better hooks when it knows the vulnerability.',
    options: [
      {
        id: 'cowardly',
        label: 'Cowardly',
        description: 'Knows the shape of fear too well. Has run before, will again.',
        inspirationHints: [
          'has a moment they will not talk about',
          'tests every exit before sitting down',
          'is, in the rarest moment, capable of unexpected courage they cannot repeat',
        ],
      },
      {
        id: 'greedy',
        label: 'Greedy',
        description: 'The hand reaches before the mind decides.',
        inspirationHints: [
          'has stolen something small from a friend and never confessed',
          'cannot quite trust people who turn down gold',
          'is generous with the wrong people for the wrong reasons',
        ],
      },
      {
        id: 'prideful',
        label: 'Prideful',
        description: 'Will not bow. Will not be wrong. Will not ask for help.',
        inspirationHints: [
          'has refused aid that would have saved them grief',
          'cannot stand to be corrected in public',
          'has lost more by saving face than by losing it',
        ],
      },
      {
        id: 'reckless',
        label: 'Reckless',
        description: 'The plan is the thing you do after the door is already kicked in.',
        inspirationHints: [
          'has more scars than years',
          'has been left behind by allies who could not keep up',
          'is, sometimes, why everyone else survived',
        ],
      },
      {
        id: 'jealous',
        label: 'Jealous',
        description: 'Others\' fortune sits like a stone in the gut.',
        inspirationHints: [
          'cannot fully celebrate a friend\'s win',
          'has sabotaged someone, quietly, and told themselves it was justice',
          'is harder on themselves than on the people they envy',
        ],
      },
      {
        id: 'selfdoubting',
        label: 'Self-doubting',
        description: 'The voice that says you are not enough. It has been loud since childhood.',
        inspirationHints: [
          'rehearses every decision after making it',
          'is convinced their successes were luck or pity',
          'is often the most prepared person in the room and the most certain they aren\'t',
        ],
      },
      {
        id: 'vindictive',
        label: 'Vindictive',
        description: 'No slight too small to remember. Patience for the cold dish.',
        inspirationHints: [
          'has waited years for the moment to repay a comment',
          'keeps a tally no one else knows about',
          'has, occasionally, hurt people who had genuinely forgotten',
        ],
      },
    ],
  },
] as const;

/**
 * Map of bucketId -> bucket, for direct lookup. Built once at module
 * load.
 */
export const PERSONALITY_BUCKETS_BY_ID: Readonly<Record<TraitBucketId, TraitBucket>> =
  PERSONALITY_BUCKETS.reduce(
    (acc, bucket) => {
      acc[bucket.id] = bucket;
      return acc;
    },
    {} as Record<TraitBucketId, TraitBucket>,
  );

/**
 * Map of "bucketId.optionId" -> option, for direct lookup. Useful when
 * resolving a stored PersonalityProfile back to display-ready data.
 */
export const PERSONALITY_OPTION_INDEX: ReadonlyMap<string, TraitOption> = (() => {
  const map = new Map<string, TraitOption>();
  for (const bucket of PERSONALITY_BUCKETS) {
    for (const option of bucket.options) {
      map.set(`${bucket.id}.${option.id}`, option);
    }
  }
  return map;
})();

/**
 * Validate that a profile has a recognized option in every bucket.
 * Returns the list of bucket IDs that are missing or invalid.
 */
export function validateProfile(
  profile: Partial<PersonalityProfile>,
): TraitBucketId[] {
  const missing: TraitBucketId[] = [];
  for (const bucket of PERSONALITY_BUCKETS) {
    const optionId = profile[bucket.id as keyof PersonalityProfile] as string | undefined;
    if (!optionId) {
      missing.push(bucket.id);
      continue;
    }
    const option = PERSONALITY_OPTION_INDEX.get(`${bucket.id}.${optionId}`);
    if (!option) {
      missing.push(bucket.id);
    }
  }
  return missing;
}

/**
 * Resolve a stored profile into a friendly display object with full
 * option labels + descriptions, for use in wizard summaries and chapter
 * footers.
 */
export interface ResolvedTrait {
  bucketId: TraitBucketId;
  bucketLabel: string;
  optionId: string;
  optionLabel: string;
  optionDescription: string;
}

export function resolveProfile(profile: PersonalityProfile): ResolvedTrait[] {
  const resolved: ResolvedTrait[] = [];
  for (const bucket of PERSONALITY_BUCKETS) {
    const optionId = profile[bucket.id as keyof PersonalityProfile] as string;
    const option = PERSONALITY_OPTION_INDEX.get(`${bucket.id}.${optionId}`);
    if (!option) continue;
    resolved.push({
      bucketId: bucket.id,
      bucketLabel: bucket.label,
      optionId: option.id,
      optionLabel: option.label,
      optionDescription: option.description,
    });
  }
  return resolved;
}

/**
 * Format a profile as a prompt-ready string for the LLM. Designed to
 * splice cleanly into the Inspire Me and chapter-generation prompts.
 *
 *   "Stoic (rarely reacts visibly to fortune or loss), Honorable (their
 *    word is iron), Lone wolf (prefers their own company), driven by
 *    Vengeance (one name kept warm), flawed by Pride (will not ask for
 *    help)."
 */
export function profileToPromptLine(profile: PersonalityProfile): string {
  const resolved = resolveProfile(profile);
  if (resolved.length === 0) return '';
  const parts = resolved.map((r) => `${r.optionLabel} (${r.optionDescription.replace(/\.$/, '')})`);
  return parts.join('; ') + '.';
}

/**
 * Pick a deterministic-ish but varied inspiration hint for a given
 * profile + question seed. The Inspire Me prompt template uses this to
 * push variety across the 3 suggestions per click without re-rolling
 * for the same field within the same click.
 *
 * `roll` is a 0-based index (0, 1, 2 for the three suggestion cards).
 * Returns one hint per bucket, picked round-robin from each option's
 * hint list.
 */
export function pickInspirationHints(
  profile: PersonalityProfile,
  roll: number,
): { bucketId: TraitBucketId; hint: string }[] {
  const hints: { bucketId: TraitBucketId; hint: string }[] = [];
  for (const bucket of PERSONALITY_BUCKETS) {
    const optionId = profile[bucket.id as keyof PersonalityProfile] as string;
    const option = PERSONALITY_OPTION_INDEX.get(`${bucket.id}.${optionId}`);
    if (!option || option.inspirationHints.length === 0) continue;
    const idx = roll % option.inspirationHints.length;
    hints.push({ bucketId: bucket.id, hint: option.inspirationHints[idx] });
  }
  return hints;
}
