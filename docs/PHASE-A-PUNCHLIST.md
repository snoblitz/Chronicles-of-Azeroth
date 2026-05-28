# Phase A — Pre-launch Punchlist

**Status:** Active tracking doc. Last updated 2026-05-28.

Working surface for everything that needs to happen before the Friends &
Strangers cohort invite per [`LAUNCH-PLAN.md`](./LAUNCH-PLAN.md) §3. Two
halves:

- **Build** — things to add (engineering, content, ops, cohort, legal).
- **Reframe** — things to change or hide on what's already in prod
  (landing page, app shell, external surface, tone).

Check items off as you go. Flag open decisions inline. The doc is meant
to be edited, not preserved — it gets archived once Phase A is live.

---

## Part 1 — Build (what to add)

### 1.1 Engineering

The actual build work. Bounded; ~5–6 working days end-to-end.

- [ ] **E1. Cloud sync of bibles + chapters** for signed-in users.
  - Scope: localStorage → cloud on change, cloud → localStorage on
    sign-in. No realtime. Last-write-wins per character.
  - **Events stay localStorage-only** in Phase A. Schema's still evolving
    and the volume is heavy; don't open that can until Companion.
  - Conflict story: cloud version wins on hydrate when a second device
    has a different anonymous bible. Document in
    `companion-architecture.md` §6.
  - Effort: **2–3 days**.
- [ ] **E2. Privacy + Terms routes** at `/privacy` and `/terms`.
  - Wire into the SPA fallback the way `/auth/callback` is. Real React
    components, not external links.
  - Effort: **half day** of routing once the content (W1, W2) is drafted.
- [ ] **E3. Feedback button** in-app.
  - Modal with: rating (1–5 stars), one-line gut reaction, optional
    comment, optional email-back permission.
  - Writes to a new `feedback` Supabase table (small migration).
  - Effort: **1 day** including the migration.
- [ ] **E4. Addon GitHub Release.**
  - Zip `addon/Aftertale/`, write a Windows-friendly install README,
    cut a tagged release. Direct download link.
  - Effort: **half day**.
- [ ] **E5. Discord invite link wiring.**
  - Surfaced in the feedback modal ("want to talk it through?") and on
    `/welcome` or the first-run nudge.
  - Effort: **1 hour** once the Discord (O2) exists.

### 1.2 Content / copy

Can run in parallel with engineering — you don't need a working sync to
draft a privacy page.

- [ ] **W1. Privacy policy** (~600 words).
  - Plain-English: what we send to OpenRouter, what Supabase stores,
    what we never collect, retention, deletion. Sudowrite's privacy
    page is a useful model.
- [ ] **W2. Terms of service** (~800 words).
  - Acceptable use, IP ownership (user owns their chronicles), no
    warranty, governing law. Lawyer-light; lawyer-review-able later.
- [ ] **W3. Cohort outreach copy** — 3 variants.
  - Friends (warm, ~3 sentences).
  - Guild Discord posts (~5 sentences).
  - r/wow ("looking for honest readers, not launching", under 200
    words).
- [ ] **W4. Discord welcome / channel rules.** Pinned post.
  - *"Tell me what's broken, tell me what feels fake, tell me what
    made you smile."*

### 1.3 Ops / infra

- [ ] **O1. Cloudflare Pages env vars set** — `VITE_SUPABASE_URL` +
  `VITE_SUPABASE_ANON_KEY`. **Do this last.** It's the launch switch.
- [ ] **O2. Discord server** with `#cohort` (visible to invitees) +
  `#observations` (private to Jeff).
- [ ] **O3. Email routing** — `support@aftertale.gg` +
  `security@aftertale.gg` → Jeff's inbox via Cloudflare Email Routing.
- [ ] **O4. External `npm run auth:smoke`** — run from a machine that
  isn't where the code was written. The verification gate from PR #2
  that never closed.

### 1.4 Cohort prep

- [ ] **K1. Cohort list** — name + source + invite date. Aim 15
  invited expecting ~12 engaged.
- [ ] **K2. Observation protocol** — 1-page doc for Jeff's own use,
  not the cohort's. What to watch for per first chapter (finished
  reading? screenshot? first words in Discord?).
- [ ] **K3. Intake flow** — what each cohort member gets in their
  first email: Discord invite + addon link + the 30-min play
  instruction + a one-liner of what's coming.

### 1.5 Light legal / business

- [ ] **LG1. Trademark search** for "Aftertale" in software/SaaS
  category (USPTO TESS, preliminary, 30 min). **Must do before
  cohort.**
- [ ] **LG2. LLC formation.** **Defer to Phase C entry.** Stripe wants
  it; Phase A doesn't collect money.
- [ ] **LG3. Lawyer review of Privacy + Terms.** **Defer to Phase B.**
  Cohort is small/closed; ship lawyer-light and review before public
  launch.

---

## Part 2 — Reframe (what to change in prod)

The bigger risk than what we haven't built is what we've *over-promised*
on the live surface. aftertale.gg today is marketing for the full
multi-tier product; a cohort member will judge the manual BYOK flow
against the Companion ideal pitched on the landing.

Most of this is small, but it adds up. None of it is deletion — it's
reframe, hide-behind-a-flag, or "Coming soon."

### 2.1 Landing page (the biggest surface)

`src/components/LandingPage.tsx`. Pattern: introduce a `PHASE_A_MODE`
boolean (default `true`) and gate the Companion-promising sections on
it. One-line flip back to the full landing when Phase D ships.

- [ ] **LP1. Pricing tiers — reframe to "Coming soon."**
  - Keep the tier cards (they signal "real business, not free toy") but
    replace dollar amounts with *"Coming next"* / *"On the roadmap."*
  - Add a banner above the section: *"Aftertale is in early testing.
    The free tier is live; paid tiers ship later this year."*
- [ ] **LP2. Magic-moment phone mockup — hide for Phase A.**
  - It promises Companion auto-push that doesn't exist. Showing it
    creates the "you promised buzz, gave me a file drag" disconnect
    with the cohort.
- [ ] **LP3. "From signup to first chapter" onboarding — rewrite for
  the actual Phase A flow.**
  - Honest: *"Download the addon → play 30 min → drop the
    SavedVariables file → read your chapter."*
  - Mention the BYOK key step. Don't hide friction the cohort will hit.
- [ ] **LP4. FAQ — audit every answer.**
  - Anything about subscriptions, Companion auto-capture, push, mobile
    reading → "planned for later this year" or remove.
  - Add: *"What stage is Aftertale at?"* — answer with the cohort
    framing.
- [ ] **LP5. Hero subhead — soften the implicit promise.**
  - Whatever it says, make sure it's true *for the free tier today.*
  - Don't tease the magic moment in the hero.
- [ ] **LP6. Features grid — mark Companion-only features.**
  - "Coming soon" badge or muted styling on anything that requires
    Companion to work.
- [ ] **LP7. Above-the-fold "early testing" banner** (dismissible).
  - One line: *"Aftertale is in early testing — say hi in Discord."*
- [ ] **LP8. Supported-games strip wording.** "Live today for World of
  Warcraft" implies more polish than Phase A has. Soften to *"Currently
  supports World of Warcraft."*

**Open decision:** how to handle the existing "Sign in" CTA on the
landing-page header. Three options:
1. Leave as-is — it just opens the app (currently no real access gate).
2. Rewrite as "Open the app" — friendlier framing.
3. Hide entirely until Phase B — strongest gating signal.

Lean: **option 2.** Phase A isn't access-gated, but the CTA copy
shouldn't sound like a Stripe-style signup.

### 2.2 App shell

`src/App.tsx`, `src/components/SettingsPanel.tsx`, `src/components/SpendBar.tsx`.

- [ ] **AP1. Settings panel first-run copy.**
  - Opens automatically when no API key. Re-read from a stranger's
    perspective: does it explain *why* they need an OpenRouter key,
    not just *that* they do? One sentence of context.
- [ ] **AP2. Spend bar / TokenBar copy.**
  - Verify the user-facing token framing is friendly for someone
    who's never seen it. The cost display can feel adversarial if
    the first thing a new user sees is *"$0.0234 — Calls: 4."*
- [ ] **AP3. Character cap (free = 1 per architecture).**
  - **Decision: leave open for Phase A.** Roster accepts unlimited
    rolls today. Gather data on how many characters cohort members
    actually create; tighten in Phase B if needed.
- [ ] **AP4. Dev-tools gate verification.**
  - Confirm Tavern + Addon Sim are absent from the prod build
    (`DEV_TOOLS_ENABLED = import.meta.env.DEV` should evaluate
    `false` in `npm run build`). Visual check on the deployed
    preview before the env vars flip.
- [ ] **AP5. Auth wiring end-to-end test.**
  - Once O1 is done, walk the "Save your chronicle" path through
    on the deployed `aftertale.gg`: email → magic link → callback
    → roster, with cloud sync (E1) actually syncing.

### 2.3 External surface

- [ ] **EX1. README** — update status line to reflect the cohort
  phase. Point at `LAUNCH-PLAN.md`. Don't make README a marketing
  surface.
- [ ] **EX2. Don't add CurseForge / Wago links anywhere yet.** The
  addon isn't published there. Direct GitHub Release link only.
- [ ] **EX3. `docs/companion-architecture.md` §6 update.**
  - Document the cloud sync conflict story (cloud wins on hydrate
    on second-device sign-in).

### 2.4 Tone / framing pass

- [ ] **TN1. Grep for "subscribe", "premium", "sign up", "create
  account".** Any instance needs to be checked against the
  preservation-not-gate framing. We say *"Save your chronicle,"*
  never *"Sign up."*
- [ ] **TN2. The wording rule from `LAUNCH-PLAN.md` §10.**
  - Every line touching free vs paid: *"The free tier is always free"*
    ≠ *"Aftertale is always free."* Verify every public sentence
    aligns with the first.

---

## Part 3 — Things deliberately NOT in Phase A

Tempting to do, won't move the needle, costs focus.

- **Sentry / error tracking.** Cohort small enough for manual monitoring.
  Phase B problem.
- **Analytics.** Qualitative > quantitative at this scale. The feedback
  button (E3) is the data layer.
- **Rate limiting / abuse protection.** Cohort is invited; threat model
  low. Phase B problem.
- **Press kit / `/press` page.** No press outreach until Phase B.
- **CurseForge / Wago submission.** Phase B entry gate — their review
  burns weeks we don't need yet.
- **LLC formation, lawyer-reviewed ToS.** Phase C and Phase B
  respectively.
- **OpenRouter referral key setup.** Phase B. Don't muddy cohort
  signal with even-pennies-of-incentive.
- **Magic-moment phone mockup.** Hide for Phase A (LP2). Restore Phase D.
- **Patreon link.** Phase B.

---

## Part 4 — Things to KEEP even though you might be tempted

Sweat equity protection. None of these are wrong for Phase A.

- The **Magnus exhibit.** It *is* the prose proof.
- The **Blizzard trademark disclaimer** in footer.
- All the recent **design system work** (Meet-a-Hero rhythm, purple /
  cream palette). It's the aesthetic that signals "real product."
- The **lazy split** (PR #2 update). Landing stays lean.
- **Security headers + CSP + gitleaks hook.** Foundational.
- **Account menu / "Save your chronicle" CTA.** It's correct as-is;
  shows up only when Supabase env is set (O1).

---

## Part 5 — Suggested order of attack

Roughly 3 weeks of focused work, parallelizable.

### Week 1 — Foundation
- LG1 (trademark search) — 30 min, do first
- O2 (Discord server) — 2 hours
- O3 (email routing) — 1 hour + DNS propagation
- Start **E1** (cloud sync) — biggest engineering item
- Start drafting **W1, W2** (Privacy + Terms content)

### Week 2 — Build
- Finish **E1** (cloud sync)
- **E2** (Privacy + Terms routes live) once W1/W2 are written
- **O4** (external smoke test) once E1 is in
- **E4** (Addon GitHub Release) — independent, anytime

### Week 3 — Wire + reframe
- **E3** (feedback button) + **E5** (Discord invite wiring)
- **K1, K2, K3, W3, W4** (cohort prep + outreach copy)
- **Landing page reframe**: LP1–LP8 — single PR near end of Week 2 or
  start of Week 3
- **App shell pass**: AP1, AP2, AP4, AP5 — small diffs
- **Tone pass**: TN1, TN2 — grep + fix
- **O1** (Cloudflare env vars) — **the launch switch**

### Week 4 — Soft start
- Invite **friends first** (5–8 people); let them shake bugs for 3–4 days
- Recruit **strangers** (8–12) once friends report no P0 bugs
- Begin observation

---

## Part 6 — Open decisions (Jeff's call)

Things that haven't been decided yet and are worth flagging before they
silently default to whatever I happened to write.

- [ ] **Pricing tier display:** "Coming soon" framing (LP1
  recommended), hide entirely, or leave with prices? *Default:
  Coming soon.*
- [ ] **Landing-page "Sign in" CTA copy:** see §2.1 open decision.
  *Default: rewrite to "Open the app."*
- [ ] **Character cap (free = 1):** enforce in Phase A or leave open?
  *Default: leave open, instrument the count via feedback.*
- [ ] **Patreon timing.** Footer link from Phase B per launch plan, or
  not until later?
- [ ] **Cohort size target.** 10–20 in the launch plan; lock at 15
  invited / 12 engaged?
- [ ] **Phase A duration cap.** 4–6 weeks in the launch plan; do we
  set a hard "decide go/no-go by week N" or stay open-ended?

---

## Part 7 — Progress notes

Add entries here as work lands so future-you remembers what got decided
and why.

*(Empty — first entry goes here when work starts.)*

---

*Authored 2026-05-28 by Jeff + Claude (Opus 4.7). Edit freely; this
doc serves the launch, not the authors.*
