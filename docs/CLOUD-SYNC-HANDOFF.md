# Cloud Sync — Handoff (E1)

Status as of 2026-05-28. This document hands off the cloud-sync work (Phase A
gate item **E1**) to the next agent/developer. It covers what shipped, the OTP
auth change made the same day, what's verified, the one manual Supabase step
that's still required, and how to test.

> TL;DR: localStorage ↔ Supabase sync of bibles + chapters for signed-in users is
> **implemented, lint/build green, and smoke-tested against the real backend**.
> A visible sync-status pill was added. Auth was switched from PKCE magic-LINKS
> to **6-digit OTP codes** to kill cross-device friction. **One manual step
> remains**: edit the Supabase email templates to emit `{{ .Token }}` (see §5).

---

## 1. What this feature does

Signed-in (non-anonymous) users get their character bibles, enrichments, and
session recaps mirrored to Supabase so a hero survives a cleared cache or a new
device. Anonymous users stay 100% localStorage-first — nothing touches the
network. When Supabase env is unset, the whole subsystem no-ops.

Sync model is **per-character bundle in `bible.data` (jsonb)** — "Option A".
Each character row's bible carries:

```jsonc
{
  "sync": { "schemaVersion", "createdAtKey", "modifiedAt", "pushedAt" },
  "bible": { ... },
  "enrichments": { ... },
  "sessionRecaps": { ... }
}
```

Conflict resolution is **last-writer-wins** by `effectiveModifiedAt()` (the max
`savedAt` across bible/enrichments/recaps, made monotonic via a high-water mark
so a count-shrink can't roll the clock back).

---

## 2. Files (today's changes)

### New
- `src/lib/cloudSync.ts` — the sync engine + the observable sync-status emitter.
- `tools/cloud-sync-smoke.mjs` — data-layer round-trip smoke test (13 checks).
- `docs/CLOUD-SYNC-HANDOFF.md` — this doc.

### Modified
- `src/lib/auth.ts` — switched to OTP-code flow; added `verifyCode()`;
  upgrade-continuity guard; existing-email conflict signal. Removed dead
  `callbackUrl()`/`emailRedirectTo`.
- `src/components/SaveChronicleModal.tsx` — two-step email → 6-digit-code UI,
  resend cooldown, "use a different email", conflict → "sign in instead".
- `src/components/AccountMenu.tsx` — `useSyncStatus()` hook + status pill.
- `src/lib/bibleStore.ts` / `src/lib/sessionRecapStore.ts` — cloud-write helpers
  (`getBibleByKey`, `putBibleFromCloud`, `fireRosterUpdated`,
  `replaceSessionRecaps`).
- `src/App.tsx` — wires `initCloudSync()` on mount.
- `package.json` — added `"sync:smoke"` script.
- `docs/companion-architecture.md` (§6) + `docs/PHASE-A-PUNCHLIST.md` — updated.

---

## 3. How the engine works (`src/lib/cloudSync.ts`)

`initCloudSync()` (called once from App) does two things:
1. Subscribes to `supabase.auth.onAuthStateChange`. On a **non-anonymous** user
   → `hydrate(uid)`. On signout / anonymous → status `idle`.
2. Listens to local store events (`at:bible-updated`, `at:bible-roster-updated`,
   enrichments, session-recaps) → debounced `schedulePush()` (skipped while
   applying cloud→local writes via the `suppressPush` guard).

**`hydrate(uid)`** reconciles cloud ↔ local once per uid per session:
- `isUpgrade = lastAnonUid === uid || readOwner() === uid`.
- `cloudAuthoritative = !isUpgrade && cloudHasData` → cloud is source of truth;
  this device's un-owned scratch heroes are tombstoned (kept on-device, never
  pushed — anti-pollution).
- Otherwise (upgrade / continuity / new account) → per-character LWW merge, and
  local-only heroes are pushed up (never lost to an empty cloud).

**`pushAll()`** (debounced) pushes dirty characters + propagates local deletes.
It claims the `syncing` single-flight lock **before** any await, refuses to run
when `hydratedUid !== uid` (anti-pollution), and **pre-scans** for dirty work so
a no-op push doesn't flash the status pill.

**Single-flight & queueing:** `syncing` guards hydrate/push; `pendingHydrateUid`
/ `pendingPush` queue work that arrives mid-flight; `drainPending()` runs it on
release.

**Local bookkeeping keys (localStorage):**
`at.sync.charmap.v1` (key→uuid), `at.sync.tombstones.v1`, `at.sync.owner.v1`,
`at.sync.hwm.v1` (high-water mark), `at.sync.counts.v1`.

---

## 4. Observable sync status (the UI bit)

`cloudSync.ts` exports an observable status:
- `type SyncState = 'idle' | 'syncing' | 'synced' | 'error'`
- `getSyncStatus(): SyncStatus` — current `{ state, at, error? }`.
- `SYNC_STATUS_EVENT = 'at:sync-status'` — a `CustomEvent<SyncStatus>` dispatched
  on every transition.
- `retrySync()` — user-triggered "try again": re-hydrates if the uid was never
  reconciled, else flushes local edits.

`hydrate()` and `pushAll()` drive the status; `pushCharacter()` returns a
boolean so partial failures surface as `error`.

`AccountMenu.tsx` subscribes via `useSyncStatus()` and renders a pill **only when
signed in**: `⟳ Syncing…` / `✓ Backed up` / `⚠ Sync failed — retry` (the error
pill calls `retrySync()` on click). `idle` renders nothing.

---

## 5. ⚠️ REQUIRED manual Supabase config (not done yet)

Auth uses **6-digit OTP codes**. The code only reaches the user if the email
templates emit `{{ .Token }}`. In the Supabase dashboard
(**Authentication → Email Templates**), edit **BOTH**:

1. **Magic Link** (used by returning-user sign-in)
2. **Change Email Address** (used by the anonymous→account "save" upgrade)

Suggested body for each:

```html
<h2>Your Aftertale code</h2>
<p>Enter this code to continue:</p>
<p style="font-size:28px;font-weight:bold;letter-spacing:4px">{{ .Token }}</p>
<p>This code expires shortly and can only be used once.</p>
```

- **Drop `{{ .ConfirmationURL }}`** from those templates — email security
  scanners can prefetch the link and burn the token before the user types it.
- **Auth → Providers → Email:** keep **OTP expiry** short (~10 min).
- **Anonymous sign-ins** must be enabled (Auth settings).
- Redirect-URL allow-listing is **no longer needed** for the primary flow.

Until the templates are updated, the email will still contain a link instead of
a visible code and the new flow can't be completed.

---

## 6. Verification status

| Check | Result |
| --- | --- |
| `npm run lint` (`tsc --noEmit`) | ✅ green |
| `npm run build` (`tsc -b && vite build`) | ✅ green |
| `npm run auth:smoke` | ✅ 7/7 (anon sign-in, RLS, profile trigger) |
| `npm run sync:smoke` | ✅ 13/13 (insert, bundle upsert, nested read, LWW, cascade delete) |
| Dev server boot (`npm run dev`) | ✅ clean, served 200 at `http://localhost:5180/` |
| **Live magic-link/OTP round-trip in browser** | ⏳ blocked on §5 templates; manual |

The end-to-end UX round-trip (request code → enter code → roster hydrates →
pill flips, across two browsers) is **wired and ready** but needs §5 done first,
then a human to read the email and type the code.

---

## 7. Test runbook (after §5 is done)

1. `npm run dev` → open `http://localhost:<port>/#app` (note the port Vite prints).
2. Anonymous state shows **Save your chronicle / Sign in**, no pill.
3. Create a hero so there's local data.
4. **Save your chronicle** → enter email → **Send me a code**.
5. Read the email (any device/browser is fine now) → type the 6-digit code → **Verify**.
6. Top-right shows `◆ email`; pill flips `⟳ Syncing… → ✓ Backed up`.
7. Edit a hero / add a recap → pill flips again within ~1.5s.
8. **Cross-device:** open another browser → **Sign in** with the same email →
   enter code → your roster hydrates down.
9. **Error path (optional):** DevTools → Offline → edit → pill shows
   `⚠ Sync failed — retry` → go Online → click it → `✓ Backed up`.

Data-layer only (no email needed): `npm run sync:smoke`.

---

## 8. Known tradeoffs / deferred (accepted)

- Security: a 6-digit code is weaker than a PKCE link against online guessing —
  acceptable for this app class given short expiry, single-use, Supabase rate
  limits, and no auto-verifying link in the template. (Rubber-duck #8.)
- "Secure email change" double-confirm: anonymous users have no old email, so a
  single confirmation applies — but verify the project setting if upgrade-verify
  ever fails. (Rubber-duck #4.)
- Free-tier Supabase email rate limits (~3–4/hr) can throttle heavy testing.
- See `plan.md` for the E1 design-of-record and accepted tradeoffs (#4/#5/#6).

---

## 9. Pointers

- Engine: `src/lib/cloudSync.ts`
- Auth: `src/lib/auth.ts` (`saveChronicle`, `signIn`, `verifyCode`, `useAuth`)
- UI: `src/components/SaveChronicleModal.tsx`, `src/components/AccountMenu.tsx`
- Store helpers: `src/lib/bibleStore.ts`, `src/lib/sessionRecapStore.ts`
- Schema/RLS: `supabase/migrations/20260527120000_initial_schema.sql`
- Backend notes: `docs/supabase.md`; architecture §6/§9 in `docs/companion-architecture.md`
- Tests: `tools/auth-smoke.mjs`, `tools/cloud-sync-smoke.mjs`
