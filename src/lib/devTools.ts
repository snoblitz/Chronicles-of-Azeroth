// ============================================================================
// devTools — single source of truth for "is this a dev-only surface?"
//
// Gates UI surfaces that should NEVER appear on the open-internet build:
//   - Tavern (NPC chat) — cost/abuse vector; Jeff uses it locally for fun
//   - Addon Simulator — fires synthetic addon events for narration testing
//
// `import.meta.env.DEV` is `true` for `npm run dev` and `false` for `npm
// run build`. Vite inlines the value at build time, so any code branch
// gated `if (!DEV_TOOLS) return null` is statically eliminable.
//
// We re-export instead of letting every component read `import.meta.env.DEV`
// inline so future audits ("what's gated by dev?") have one grep target.
// ============================================================================

export const DEV_TOOLS_ENABLED: boolean = import.meta.env.DEV;
