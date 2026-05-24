// ============================================================================
// Predefined character bibles that ship with the app.
//
// These let a fresh visitor (especially on the deployed Pages bundle, where
// nobody has any localStorage yet) pick a ready-made hero and start poking
// at NPC chat without sitting through the interview first.
//
// Loading a preset:
//   - If the user already has a bible with the same `createdAt` key in their
//     roster, we just activate it (do NOT overwrite their edits).
//   - Otherwise we plant the preset via saveBible() and make it active.
//
// To add a new preset: drop a new entry below. The `bible.createdAt` is the
// canonical identity — keep it stable across deploys so returning users
// don't end up with duplicates.
// ============================================================================

import type { CharacterBible } from '../types';
import { loadPresetCharacter as planPreset } from './bibleStore';

export interface PresetCharacter {
  id: string;
  tagline: string;
  bible: CharacterBible;
}

export const PRESET_CHARACTERS: PresetCharacter[] = [
  {
    id: 'magnus-brunn',
    tagline: 'The thoughtful dwarf warrior who held the line.',
    bible: {
      name: 'Magnus Brunn',
      race: 'Dwarf',
      class: 'Warrior',
      faction: 'Alliance',
      homeland: 'Dun Morogh',
      backstory:
        'Magnus Brunn was born into the deep veins of Khaz Modan, where his dwarf clan mined beneath the mountains. His early life was shattered by a trogg invasion, forcing him to take up an axe too heavy for his young hands. His uncle Brogan taught him to "Plant yer feet. Stone doesnae run," a lesson that forged his initial resolve not for glory, but for holding a line to protect others. This terrifying experience taught him that arms could buy breath, steps, and lives.\n\nAs he matured, Magnus fought in many battles for clan, king, and coin. However, a particularly grim campaign in the Wetlands, where he witnessed the unintended harm caused by misdirected orders, profoundly changed him. He realized that courage could be misspent in the service of fools or cowards, and that being brave was not always the same as being right. This hard-won wisdom led him to question authority, to discern true justice from mere command, and to prioritize the protection of the vulnerable over the pursuit of glory or vengeance.\n\nNow, Magnus fights with a deliberate aim, seeking to minimize casualties and ensure that true victory means "fewer names carved into stone." He anchors his choices in the lessons of his uncle Brogan, the keen observation of his fallen shieldmate Brannic, and the emergent wisdom of his protégé Tovin. He finds solace in the forge, in the challenging counsel of Priestess Mira Flintbraid, and in remembering the dead honestly, striving to leave a legacy not of fiercest might, but of a warrior who held the line and never forgot why it mattered.',
      beliefs: [
        'Courage is the breath before the choice, not just the roar.',
        'Being brave is not the same as being right.',
        'True strength lies in endurance and protecting the vulnerable.',
        'Mercy, chosen from strength, is not weakness.',
        'Questioning authority is vital for just action.',
        "A warrior's ultimate legacy is the lives sheltered, not the bodies left.",
      ],
      motivations: [
        'Protecting the vulnerable and helpless.',
        'Ensuring actions lead to true, lasting peace, not just temporary victory.',
        'Guiding younger warriors towards discerning strength.',
        'Holding leaders accountable for the true cost of war.',
      ],
      voice:
        'Magnus\'s voice is gruff and deliberate, seasoned by years of battle and hard-won wisdom. He speaks plainly, often using dwarven metaphors of stone, forge, and mountain to convey deep truths, and frequently punctuates his thoughts with a thoughtful "Aye" or a dismissive "Bah." While capable of a booming roar in battle, his conversational tone is measured, reflecting a warrior who has learned to weigh every word as carefully as every swing of his axe.',
      fears: [
        "Becoming only a weapon in another leader's hand.",
        'Mistaking obedience for honor.',
        'Failing to protect the vulnerable because he acted too slowly or too late.',
        'Teaching younger warriors the wrong lesson through his own choices.',
      ],
      flaws: [
        'Can be slow to trust commanders or simple battle plans.',
        'Carries guilt for harm he did not directly cause but still feels responsible for.',
        'May hesitate when a situation morally resembles past mistakes.',
        'Can come across as grim or judgmental to warriors who still value glory.',
      ],
      coreQuote: 'Magnus Brunn held the line, but never forgot why the line mattered.',
      createdAt: 1779645176311,
      updatedAt: 1779645176311,
    },
  },
];

export function findPreset(id: string): PresetCharacter | undefined {
  return PRESET_CHARACTERS.find((p) => p.id === id);
}

export function loadPresetCharacter(id: string): CharacterBible | null {
  const preset = findPreset(id);
  if (!preset) return null;
  return planPreset(preset.bible);
}
