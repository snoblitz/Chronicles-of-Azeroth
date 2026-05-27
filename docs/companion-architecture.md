# Companion Architecture

**Status:** Design lock — pre-implementation. Last updated 2026-05-26.

**Strategic constraint:** Nothing ships to users until all tiers (Free, Free+account,
Companion, Chronicler, Loremaster) are coordinated and right. This document is the
load-bearing reference for that coordination.

---

## 1. The product, in one sentence

Aftertale turns your WoW play into a narrative you can read anywhere —
and the Companion makes that narrative appear automatically, the moment it exists,
on every screen you own.

## 2. Tiers

| Tier | Account | Characters | Where data lives | Ingest | Enrichment | Read surfaces |
|---|---|---|---|---|---|---|
| **Free / anonymous** | No | 1 | Browser localStorage | Manual (SV drop) | Manual (Scribe's Desk + BYOK key) | Desktop browser |
| **Free + account** | Yes | 1 | Browser (source) + cloud backup | Manual (SV drop) | Manual (Scribe's Desk + BYOK key) | Desktop browser + PWA (read-only) |
| **Companion** | Yes | 3 | Cloud (source of truth) | Automatic (daemon) | Automatic (managed LLM) | Desktop browser + PWA + OS notifications + push |
| **Chronicler** | Yes | 10 | Cloud | Automatic | Automatic, richer models / longer context | Same as Companion + premium features TBD |
| **Loremaster** | Yes | Unlimited | Cloud | Automatic | Automatic, top-tier models | Same as Chronicler + premium features TBD |

**Character cap = license per account.** A character slot is consumed by a unique
`<character>-<realm>` pair. Slots are reassignable (delete an old alt → free the slot).

**Design rule:** every tier produces and consumes the **same file format**
(`AftertaleRestore.lua`) and the **same cloud schema**. The Companion
daemon is a different *agent* doing what the Free user does by hand — never a
different *product*.

## 3. The user journey

### 3.1 Free anonymous (Day 1)
1. Installs WoW addon, plays, gets SV file with events.
2. Visits aftertale.gg → Scribe's Desk → drops SV file.
3. Filters, hits "Enrich" (BYOK key entered locally), gets chapters.
4. Downloads `AftertaleRestore.lua` → drops in `WTF\SavedVariables\`.
5. Next WoW login, addon merges chapters back into the in-game chronicle.

### 3.2 Free + account (the gentle nudge)
After producing their first chapter, a soft prompt:
> *"Sign in to keep your stuff — same workflow, but your chronicle survives if
> you clear your browser, and you can read it on your phone."*

Anonymous local data migrates to their account on sign-in. No data loss, no
re-import. Workflow is otherwise identical to Free anonymous.

**Implementation (auth):** the app signs every visitor in *anonymously* on
first load (Supabase `signInAnonymously()`), so a device's data already has a
stable `auth.users.id` from the start. "Save your chronicle" calls
`updateUser({ email })` — a magic link that converts that *same* anonymous user
into an email-backed account. The `id` never changes, so there is no migration
step: the anonymous-session trick is what buys us the seamless upgrade.

**Edge case — returning user on a fresh device.** If someone already has an
account and signs in (email magic link) on a *new* device, that device may
already hold its own anonymous session with some local-only data. Signing in
discards that anonymous session in favor of the real account. Any data created
under that fresh-device anonymous session that was never synced to the cloud is
**lost** — this is acceptable in V1 (it's pre-account scratch data), and it's
the price of not silently merging two identities. Once cloud sync ships
(roadmap #3), the real account's cloud data is what appears after sign-in.

**Auth is email-magic-link only in V1** — no passwords, no OAuth. The
confirmation link returns to `/auth/callback`, which exchanges the PKCE code
for a session and forwards to the roster. Because PKCE stores a verifier in the
requesting browser, the link must be opened on the **same device** it was
requested from; opening it elsewhere shows a friendly "request a fresh one"
error rather than signing in.

### 3.3 Companion (the magic moment)
1. From the signed-in web app, clicks Upgrade → Stripe Checkout → success page
   prompts them to download the desktop Companion.
2. Launches Companion → opens aftertale.gg/pair → enters 6-digit code shown
   by the app. App is now bound to their account.
3. Companion silently watches the WoW SV folder.
4. Plays WoW. SV file changes on disk (logout or `/reload`).
5. **Within a minute or two:** desktop OS notification *"New chapter ready:
   The Defias Brotherhood"*. Push notification on phone follows from the same
   backend publish event.
6. Taps either → reads the new chapter in the PWA / web.

That sequence is the product. Everything else is plumbing.

### 3.4 Subscription lapse (graceful walk-back)
Companion subscription expires → user becomes Free + account.
- Backend rejects enrichment requests for lapsed subs (402 response). Daemon
  learns from the 402, downgrades to watch-and-notify mode without needing a
  separate "stop" signal.
- Daemon keeps running, but stops enriching. It still notices new events and
  notifies: *"New session ready — open Scribe's Desk to enrich, or renew Companion."*
- Cloud chronicle stays live forever. PWA still works. They can still read.
- No data deletion, no time bombs, no dark patterns. The story is theirs.

## 4. System diagram

```
┌────────────────────┐     SV file (disk)     ┌──────────────────────┐
│  WoW + Addon       │ ─────────────────────► │  Companion daemon    │
│  (capture only)    │ ◄───────────────────── │  (Electron, desktop) │
└────────────────────┘  Restore.lua snippet   └──────────┬───────────┘
                                                         │ HTTPS
                                                         ▼
                                            ┌────────────────────────┐
                                            │  Backend (Supabase)    │
                                            │  - auth                │
                                            │  - postgres (chronicle)│
                                            │  - storage (artifacts) │
                                            │  - edge fns (enrich)   │
                                            │  - realtime + push     │
                                            └─────┬──────────┬───────┘
                                                  │          │
                                          web/PWA │          │ web push
                                                  ▼          ▼
                                         ┌─────────────┐  ┌──────────┐
                                         │  Browser /  │  │  Phone   │
                                         │  PWA reader │  │  (PWA)   │
                                         └─────────────┘  └──────────┘
```

The WoW addon **never** talks to the network. It only reads/writes SavedVariables.
This is a hard constraint of the WoW addon API and a useful architectural one — the
addon is dumb, the Companion is smart.

## 5. Pairing flow (TV-login pattern)

1. User installs Companion, launches it.
2. Companion calls `POST /pair/start` → backend returns a 6-digit code + a polling token.
3. Companion displays: *"Go to aftertale.gg/pair and enter `493-217`"*.
4. User visits the URL (already signed in to their account in the browser),
   types the code, clicks confirm.
5. Backend marks the pairing record as `paired:<userId>`.
6. Companion's polling loop (`GET /pair/status`) flips to success → it gets a
   long-lived device token. Pairing screen replaced by *"You're all set."*

Why this pattern: no Electron deep-link callbacks, no localhost OAuth dance, no
custom URL schemes. Works on every OS the same way. The same pattern Netflix,
Disney+, and gh CLI use.

## 6. Data ownership

| Data | Free (anon) | Free + account | Companion |
|---|---|---|---|
| Raw events | localStorage | localStorage + cloud mirror | cloud (source of truth) |
| Enriched chapters | localStorage | localStorage + cloud mirror | cloud (source of truth) |
| Bible | localStorage | localStorage + cloud mirror | cloud, editable from any device |
| API key (BYOK) | localStorage only | localStorage only | n/a (managed) |

**Rule:** the user can always export their entire chronicle as JSON +
`AftertaleRestore.lua`. No lock-in. Cancellation doesn't delete data.

**Free + account on mobile is read-only.** The BYOK key only lives in desktop
browser localStorage — phones can't enrich. The PWA shows existing chapters and
nudges: *"Enrichment happens at your desktop Scribe's Desk — or upgrade to
Companion to enrich automatically from anywhere."*

### 6a. Free-tier unlock economy

Free users can buy permanent à la carte unlocks to fill specific gaps without
subscribing. Every unlock is impulse-buy priced ($0.99–$4.99), account-bound,
and engineered as a natural step toward a subscription upsell.

| Unlock | Price | Upsell signal |
|---|---|---|
| Additional Hero Slot | $4.99 / slot (cap: 4 add-on slots) | Slot purchases → Companion |
| Single Chapter Export (PDF) | $0.99 / chapter | Repeat purchases → Chronicler |
| Chapter Bundle Export (PDF) | $3.99 / hero | Considered purchase → Chronicler |
| Reader Themes | $2.99 / theme | Pure margin · signals product quality |
| Chapter Regeneration (single use) | $1.99 / regen | Tastes Chronicler's unlimited regen |
| Hero Bible Polish (single use) | $2.99 / session | Tastes Chronicler's bible-polish loop |

**Subscription-only guardrails** (never offered as à la carte unlocks — these
are the subscription's defensible moat):
- Gameplay monitoring / automated capture
- Push notifications / mobile delivery
- Cloud sync
- Ongoing saga memory across chapters
- Public hero page
- Audio narration
- Unlimited regeneration

Unlocks surface contextually as users do things ("you just finished a chapter
— want to keep it as a PDF for $0.99?"), never as paywalls. The store home for
browsable shopping is **the Quill & Coin** (top-nav tab, `/store`). Full
catalog, contextual surfacing matrix, build order, and subscription-only
guardrails live in [`unlock-economy.md`](./unlock-economy.md). Strategy
summary and conversion hypotheses live in the monetization dashboard.

## 7. Subscription lifecycle

```
new user ──► free (anon) ──► free + account ──► Companion ──► (lapse) ──► free + account
                                                                            │
                                                                            └──► (renew) ──► Companion
```

Companion → Free transition is silent at the data layer (nothing moves), only
the daemon's behavior changes (stops auto-enriching). The PWA UI shows a soft
banner: *"Companion expired — your chronicle is safe. Renew to resume auto-enrichment."*

Account deletion is the only hard path that removes cloud data.

## 8. Push notifications

- **Desktop OS notifications:** native via Electron's `Notification` API. Fires
  the moment the daemon completes enrichment.
- **Web push to PWA:** standard Web Push (VAPID keys, service worker). Fires
  from the backend when a chapter is published to the user's account.
- **iOS:** Web Push works on installed PWAs since iOS 16.4. User must "Add to
  Home Screen" first — Companion's onboarding nudges this explicitly.
- **Notification de-dupe (different devices):** if both desktop and phone fire
  within ~10s, that's fine — they're different surfaces, different intents
  (jump to desktop reader vs. read on phone while away). We do not try to
  suppress one.
- **Notification de-dupe (same machine):** if the Companion desktop user *also*
  has the PWA installed on the same machine, suppress the web push there. The
  Companion app sends a `device_id` with each upload; the backend skips web push
  to that same `device_id`'s browser registration. Electron notification wins
  on that machine.

## 8a. LLM layer (OpenRouter)

All enrichment — BYOK and Companion — goes through **OpenRouter**.

- **Why:** model-agnostic by default. Narrative quality is the whole product, and
  the SOTA shifts every few months. One API, every provider underneath. Swapping
  the default model is a config change, not a migration.
- **BYOK simplification:** users paste *one* OpenRouter key and pick a model from
  a dropdown — no per-provider key matrix.
- **A/B and "regenerate with X" features** become trivial down the road.
- **Default model:** whatever's best-in-class for long-form narrative on launch
  day (today: Claude Sonnet / Opus class). Tier-specific defaults: Companion gets
  the cost-balanced pick, Chronicler/Loremaster get the premium pick.
- **Fallback:** if OpenRouter is down, the edge function can fall back to a
  provider-direct call. Not V1-critical but a known mitigation.
- **Cost:** OpenRouter's ~5% margin is the price of optionality. Worth it.

### Privacy / what we send to the LLM
- **Companion (managed):** event text + the user's bible + relevant prior chapters
  go to the LLM via OpenRouter → underlying provider. We don't train on it, we
  don't log prompts beyond what's needed to return the response. Companion's
  privacy page will name the current provider chain explicitly.
- **BYOK:** the user's browser hits OpenRouter directly with their key. We never
  see the prompt or the key.
- **Never sent:** account credentials, payment info, anything outside the
  per-character chronicle scope.

## 9. Backend (Supabase)

- **Auth:** Supabase Auth, email/password + OAuth (Google + Discord likely).
  Anonymous sessions supported for the "sign in to keep your stuff" upgrade path.
- **Database:** Postgres. Tables: `users`, `characters`, `events`, `chapters`,
  `bible`, `companion_devices`, `pair_codes`, `subscriptions`.
- **Storage:** raw SV file uploads (for Companion debugging / re-enrichment),
  generated `.lua` snippets.
- **Edge functions:** enrichment pipeline (LLM calls, managed key), web push
  dispatch, subscription webhook handling.
- **Realtime:** PWA subscribes to its user's `chapters` table → live updates
  without polling.

Why Supabase: Postgres + auth + storage + realtime + edge functions in one,
generous free tier for validation, standard SQL escape hatch when we outgrow it.

## 10. Multi-account households & multi-WoW-account users

**One Companion install = one Chronicles account.** Shared Windows accounts:
each human needs their own Chronicles account, only one Companion runs at a time.
No household plans, no profile switching in V1.

**One human, multiple WoW accounts (main + alt account) — TODO.** Real players
do this. The SV folder structure is `WTF\Account\<accountname>\SavedVariables\`
so the daemon could plausibly watch the WTF root and discover characters across
all WoW accounts. Open questions for that path:
- Does the character cap count per WoW-account or per Chronicles-account? (Lean:
  per Chronicles-account — the cap is the license, not the install.)
- Does the daemon need a config step ("which accounts to watch") or does it just
  watch everything it finds?
- UX for character listing in the web app when chars come from multiple WoW accounts.

Not blocking V1 design but needs an answer before Companion ships. Tony Mark II's
WoW expertise will be useful here.

## 11. Data retention

- Active accounts: forever.
- Lapsed Companion (now Free + account): chronicle stays live forever.
- Anonymous users: localStorage only, no server-side retention question.
- Account deletion: 30-day soft-delete grace period, then hard purge.

No automatic data expiry. Storage cost per user is negligible (chronicle text
is tiny). The "your story is always there" promise is worth more than the
pennies of storage.

## 12. What this implies for the codebase today

**Survives unchanged:**
- `src/lib/chronicleSnippet.ts` — the snippet emitter is the universal handoff format.
- `src/lib/savedVariablesIngest.ts` — same parser feeds both Scribe's Desk and the daemon.
- `src/lib/addonEvents.ts` — event shape is stable.
- `addon/Aftertale/Companion/Restore.lua` — daemon will write the same file.

**Needs refactoring (Scribe's Desk phase):**
- `src/components/ChronicleReader.tsx` — split. Reader becomes pure read. Import +
  Companion export move to new `/desk` route.

**Net-new (in rough build order):**
- `docs/companion-architecture.md` — this file ✅
- Supabase project + schema migration
- Auth UI (sign in / sign up / "keep your stuff")
- Cloud sync layer (mirror localStorage → cloud for Free+account)
- Scribe's Desk page (`/desk` route)
- Pairing endpoint + UI (`/pair`)
- Companion Electron app (separate repo? TBD)
- Enrichment edge function (managed LLM, server-side BYOK alternative)
- Web push service worker + VAPID setup
- Subscription / billing (Stripe → Supabase webhooks)

## 13. Open implementation decisions

These are *how*, not *what*. They don't block the design.

- **Companion repo:** monorepo vs separate repo for the Electron app. Lean separate
  (different release cadence, different audience, different toolchain).
- **Push provider:** roll our own VAPID, or use a service (OneSignal, Pusher Beams).
  Lean roll-our-own — it's not that bad and we avoid a third-party dep.
- **Billing:** Stripe Checkout for V1 (hosted, zero PCI scope). Customer portal
  for cancellation.
- **LLM layer:** OpenRouter for both Companion and BYOK (see §8a). Default model
  per tier locked at launch, configurable in backend without code deploy.
- **Anonymous → account migration:** straightforward — POST localStorage payload
  to a `/migrate` endpoint on first sign-in. Idempotent. Local data clears after
  successful upload.

## 14. What we are explicitly NOT doing in V1

- Native mobile apps (PWA is enough)
- Social features (sharing chronicles, friend feeds)
- Multi-character merged narratives (one character at a time)
- Guild / raid group chronicles
- AI-generated images
- Voice / audio narration

All of these are interesting. None of them are V1. Get the core loop right first.

---

## Appendix A — Glossary

- **Scribe's Desk:** the manual Free-tier workflow page (`/desk`). Linear stepper:
  Import → Filter → Enrich → Export.
- **Restore snippet:** `AftertaleRestore.lua` — the file format that
  carries enriched chapters back to the addon.
- **Companion daemon:** the Electron app that watches SV files and syncs to cloud.
- **Magic moment:** desktop notification + same chapter instantly on phone, seconds
  after WoW logout.
