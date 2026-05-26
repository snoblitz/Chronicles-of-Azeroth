// ============================================================================
// Feature flags — localStorage-backed power-user toggles.
//
// Phase 0 design note: Scribe's Desk is visible by default. Post-launch (when
// tier detection lands), the default will flip to false for paid tiers and
// stay true for Free/BYOK. The flag mechanism exists now so the toggle UX
// is already wired when that day comes.
//
// All flags fire `at:flags-updated` when changed so consumers can react.
// ============================================================================

const SCRIBES_DESK_KEY = 'at.flags.scribesDesk';

export function getShowScribesDesk(): boolean {
  try {
    const v = window.localStorage.getItem(SCRIBES_DESK_KEY);
    return v === null ? true : v === '1';
  } catch {
    return true;
  }
}

export function setShowScribesDesk(v: boolean): void {
  try {
    window.localStorage.setItem(SCRIBES_DESK_KEY, v ? '1' : '0');
  } catch {
    // localStorage may throw in private mode — caller's UI state still updates.
  }
  window.dispatchEvent(new CustomEvent('at:flags-updated'));
}
