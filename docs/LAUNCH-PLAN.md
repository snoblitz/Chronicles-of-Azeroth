# Aftertale — Phased Launch Plan

**Status:** Draft. Last updated 2026-05-28.

**Supersedes** the "all five tiers ship coordinated, nothing earlier" framing
in [`ROADMAP.md`](./ROADMAP.md). The architecture in
[`companion-architecture.md`](./companion-architecture.md) is unchanged —
this doc sequences *what reaches users when*, not what we build.

---

## 1. Why we're sequencing, not coordinating

The original strategic constraint — *nothing ships until all five tiers are
coordinated* — was the right reaction to a real failure mode: shipping a free
thing, accumulating users, and then bolting on paid tiers in a way that
disappoints everyone. Avoiding that is good.

But the constraint was overcorrecting against an equal and opposite failure:
building a year of paid-tier infrastructure (Companion daemon, push, Stripe,
Electron release pipeline) on assumptions that haven't met a real user.
**The only question that decides whether Aftertale is a business is "is the
prose good enough that strangers want their own chapters."** No amount of
billing infrastructure answers that. The cheapest experiment that does is
the manual BYOK free tier put in front of ten strangers.

So we sequence. The architecture stays. The Companion subscription stays.
The unlock economy stays. We just put each piece in front of users in the
order that lets us learn most per dollar of build cost.

**Three rules govern every phase:**

1. **No phase ships until the previous phase's load-bearing question is
   answered.** Not "implemented." *Answered.*
2. **Each phase has a kill criterion.** If reality says stop, we stop —
   not pivot harder.
3. **The free tier always stays free.** We promise *"the free tier is
   always free,"* not *"the product is always free."* The Companion tier
   is the paid layer when it ships. (See §10 for the wording trap.)

---

## 2. The ladder at a glance

| Phase | Audience | Question it answers | Paid surface |
|---|---|---|---|
| **A — Friends & Strangers** | 10–20 invited testers | Is the prose worth reading? | None |
| **B — Public free tier** | Open internet | Does it scale? Do anonymous users save accounts? | Tip jar (Patreon) |
| **C — Quill & Coin** | Free users with chapters | Will free users pay anything? | One-time unlocks |
| **D — Companion** | Free + account users | Does the magic moment land? Will they pay $12/mo? | Subscription |
| **E — Chronicler / Loremaster** | Companion subscribers | Is there pricing power above $12/mo? | Higher subscription tiers |

Each phase is meant to be **cheap to walk back from**. Phase D commits real
infrastructure money (Electron, push, managed LLM bills). Phases A–C don't.
We don't take expensive bets until the cheap experiments have answered the
question we're betting on.

---

## 3. Phase A — Friends & Strangers (closed cohort)

> **Goal:** Put the existing free workflow in front of 10–20 real people
> and watch their face when they read their first chapter.

### Load-bearing question

**Is the prose worth reading?**

Not "does the pipeline work" (we know it does). Not "does the cost model
hold" (we know roughly). The actual question: when a stranger plays an hour
of WoW, drops their SavedVariables into Scribe's Desk, hits Enrich, and
reads what comes out — do they want the next chapter?

### Scope (what ships to the cohort)

- **The current `main` build**, hosted at `aftertale.gg` with auth env vars
  enabled (anonymous sign-in + "Save your chronicle" magic link).
- **Cloud sync of bibles + chapters** ([roadmap #3](./ROADMAP.md)). The
  "Save your chronicle" button currently exists but doesn't yet save
  anything cloud-side. Either it ships meaningful for Phase A or we hide
  the CTA until it does. We ship sync.
- **Addon distributed via direct download** (zip from GitHub Releases).
  CurseForge + Wago publishing is Phase B.
- **A lightweight feedback surface in-app** — one button, opens a short
  form (or Discord channel link). We need structured "did this chapter
  feel like you?" feedback, not just vibes from DMs.
- **A private Discord channel** for the cohort. Real-time bug reports,
  quick prose feedback, "what just happened" hand-holding.

### Out of scope for Phase A

- No paid surface. No Companion. No Quill & Coin. No push notifications.
- No CurseForge/Wago listing (yet).
- No marketing push.
- No SEO / homepage tweaks aimed at search traffic.

### Entry gates (must be true before inviting the cohort)

- [ ] `npm run build` green; Cloudflare deploy known-stable.
- [ ] Supabase env vars set in Cloudflare Pages so prod auth lights up
      simultaneously with the cohort invite.
- [ ] Cloud sync (bibles + chapters) shipped and `npm run auth:smoke`
      green from an external machine.
- [ ] Privacy page exists at `/privacy` (what we send to OpenRouter, what
      Supabase stores, what we never collect).
- [ ] Terms of service exists at `/terms` — minimum viable, lawyer-light
      (we're not yet selling anything, but the moment we have user data
      we need stated terms).
- [ ] In-app feedback button + Discord invite link wired.
- [ ] Addon zip cut from `addon/Aftertale/` and uploaded to a GitHub
      Release with a short install README (Windows-friendly).
- [ ] A written **observation protocol** for what to watch for from each
      cohort member's first chapter (see §3 "How we measure" below).

### Exit gates (must be true before Phase B)

- [ ] At least **12 unique cohort members** have produced ≥1 chapter from
      a real WoW play session.
- [ ] At least **8 of those** rate the chapter ≥4/5 ("yes, I'd want the
      next one") on the in-app feedback prompt.
- [ ] Median time from "land on aftertale.gg" → "reading their first
      chapter" is **under 20 minutes** for users who already have the
      addon installed.
- [ ] No P0 bugs open (data loss, key leak, prose generation that breaks
      character).
- [ ] Cost-per-chapter under BYOK is **≤ $0.20** on Sonnet 4.5 for a
      typical 30-minute play session, with the per-event filter at its
      default.

### Kill criteria (if any of these, **stop**, don't push to Phase B)

- Fewer than half the cohort produces a chapter despite ≥3 nudges.
- Fewer than half who *do* produce a chapter say they'd want the next
  one. This is the prose-quality kill switch. It means the product
  doesn't work — we either rebuild the pipeline or shelve the project.
- Per-chapter cost is structurally above $1 on default settings (means
  the unit economics for Companion are broken).
- A cohort member's prose contains content that would violate Blizzard's
  EULA / our own taste line and we can't reliably prevent it via prompt
  changes.

### How we measure

The point of Phase A is **observation**, not metrics dashboards. For each
cohort member's first chapter:

1. **Did they finish reading it?** (Self-report, plus crude scroll-depth
   in localStorage if cheap.)
2. **One-line gut reaction.** "What hit / what missed."
3. **Would they want the next one?** Scale 1–5.
4. **Optional: voice-or-no.** Did the prose sound like a hero they could
   read about, or like a generic fantasy NPC describing your stats?

This is qualitative work. The exit gates above are the numeric floor; the
real signal is in the prose-reaction notes.

### Cohort recruiting

- **Seed: 5–8 from Jeff's network.** Friends who play WoW. Honest, will
  tell you the prose is bad if it's bad.
- **Recruited strangers: 8–12 from outside.** Sources, in order of value:
  - WoW guild Discords Jeff has access to (highest signal).
  - r/wow or r/classicwow if posted as "early test, looking for honest
    readers" — *not* a launch announcement.
  - A single tweet/Bluesky post from the @aftertalegg account (if it
    exists by then), asking for testers.
- **Avoid:** content creators with audiences (too much signal pollution),
  WoW-skeptical writers (they'll judge the writing on its own merit
  without the context of having played the events themselves — wrong test).

### Estimated duration

**4–6 weeks** from first invite to exit gate. Two-week minimum to get
cohort signed up + producing chapters; another two to four weeks of prose
iteration based on what we hear.

### Build work required to start Phase A

In rough order (each item small, none committing to new infrastructure):

1. **Cloud sync** — mirror `at.bible.entry.*` and the chronicle/chapter
   output to Supabase for signed-in users. ([Roadmap #3.](./ROADMAP.md))
2. **Privacy page + Terms page** — simple `/privacy` + `/terms` routes
   off the same SPA fallback we use for `/auth/callback`.
3. **Feedback button** — in-app, opens a modal with three fields (rating,
   one-line gut reaction, optional comment). Posts to a Supabase
   `feedback` table.
4. **Addon GitHub Release** — zip the current addon, write install
   README, cut a release.

The pipeline work (better prompts, better event filtering, Loremaster
polish, Inkwell) is **already in `main`** as of 2026-05-28. We are not
waiting on more pipeline work to invite the cohort; we are waiting on the
above four items.

---

## 4. Phase B — Public free tier

> **Goal:** Open the gates. Find out if the prose holds up at scale and
> if anonymous users care enough to save accounts.

### Load-bearing question

**Does the free tier convert anonymous → account at a meaningful rate?**
Sub-questions: do users come back for a second chapter? Do they invite
friends? Does the addon get installed by people we don't know?

### Scope

- Phase A continues (free tier stays open).
- **Addon published to CurseForge + Wago.** This is the moment we put
  the product in front of the actual WoW community.
- **Public landing-page CTAs** lead to the free tier without caveats.
- **Patreon link in the footer.** Treated as a tip jar — *"if Aftertale
  is good to you, you can buy us a coffee."* Not the business model.
- **Basic analytics** — anonymous → account conversion rate, weekly
  active chroniclers, chapters per user per week. Cloudflare Web
  Analytics or Plausible-class, not Google Analytics.
- **Optional but recommended:** a public roadmap page or changelog page,
  so the community sees the product is alive.

### Entry gates

- [ ] Phase A exit gates met (prose passes).
- [ ] Addon submitted to CurseForge + Wago and at least one approved.
- [ ] Analytics wired (just pageviews + signups + chapter-count; no PII,
      no tracking beyond what `/privacy` declares).
- [ ] Patreon page exists, even if empty of tiers. Footer link points
      to it.
- [ ] Support load-bearing infra has been pressure-tested by the cohort
      for 2+ weeks (Supabase free tier, Cloudflare, OpenRouter pass-through).

### Exit gates (before Phase C)

- [ ] **≥ 200 weekly active chroniclers** (a "chronicler" is a user who
      produced at least one chapter that week).
- [ ] **≥ 25% anonymous → account conversion** among users who produce
      at least 2 chapters. Lower than this means "Save your chronicle"
      isn't earning the click — investigate before adding a paid surface.
- [ ] At least **3 user-generated mentions** outside our channels
      (Reddit, blog, Discord, video) that aren't from people we invited.
- [ ] No P0 abuse / cost runaway incidents.

### Kill criteria

- Weekly active chroniclers don't pass 50 within 8 weeks of CurseForge
  publish (community indifference — product doesn't have pull).
- Anonymous → account conversion stays under 5% (the auth promise isn't
  resonating; rework the framing before bolting on payment).
- Sustained negative qualitative feedback about prose ("AI slop" framing
  catches on in the community).

### Estimated duration

**8–16 weeks** from public open to Phase C readiness. Genuinely unknown.
Could be faster if a content creator picks it up; could be slower if
growth is grassroots.

### Build work

- Addon submission to CurseForge + Wago (their review processes can take
  a few days each).
- Analytics wiring.
- Patreon page setup.
- A `/privacy` + `/terms` audit (the cohort version was minimum viable;
  public scale wants a real read).
- Operational: monitoring for Supabase free-tier limits, OpenRouter
  status incidents, etc.

---

## 5. Phase C — Quill & Coin (first paid surface)

> **Goal:** Find out if free users will pay anything before we commit
> to a subscription product. The cheap monetization experiment that
> de-risks the expensive one.

### Load-bearing question

**Will free users open their wallet for a permanent unlock?**

This is the question that decides whether Companion has a customer base.
If users won't pay $4.99 once for a hero slot, they won't pay $12/mo for
managed enrichment.

### Scope

- **Stripe Checkout** integration for one-time purchases (no subscriptions
  yet — that's Phase D).
- **Two unlocks** to start:
  - **Additional Hero Slot — $4.99.** The highest-intent unlock per
    [`unlock-economy.md`](./unlock-economy.md); the Companion upsell
    funnel starts here.
  - **Single Chapter PDF Export — $0.99.** The lowest-friction unlock;
    tests willingness to pay at impulse pricing.
- **Backend `unlocks` table** — already designed in the migration.
- **Contextual surfaces only** (no Quill & Coin storefront yet). Hero
  slot CTA on the roster page; PDF lock on each chapter card.
- **Profile shows owned unlocks.**

### Out of scope for Phase C

- The full Quill & Coin storefront (`/store`). Ships in Phase D or
  later — the storefront is a browse-and-buy surface that only makes
  sense once we have ≥4 unlock types live.
- Themes, regeneration, bible polish (defer; they're surface area
  without clear conversion impact at this phase).
- Stripe Customer Portal (no subscriptions to manage yet).

### Entry gates

- [ ] Phase B exit gates met.
- [ ] Stripe account in good standing, business entity (LLC) registered
      if Stripe requires it, tax handling decided.
- [ ] `unlocks` backend wired: edge function for `POST /api/unlocks/purchase`,
      Stripe webhook verification, idempotent grant.
- [ ] Refund policy written and linked from checkout.

### Exit gates (before Phase D)

- [ ] **≥ 2% of weekly active chroniclers buy at least one unlock** within
      30 days of first chapter. (Reference: Steam free-to-play conversion
      typically 1–5%; we should be in that band.)
- [ ] **Hero slot is the higher-revenue unlock**, not PDF export. (If PDF
      export dominates, it suggests users don't see hero slots as
      desirable enough to justify Companion's hero-slot expansion. That's
      a Companion-pricing signal worth surfacing.)
- [ ] No payment-related support tickets that are structural (occasional
      Stripe weirdness is fine; recurring "my unlock didn't apply" is not).

### Kill criteria

- Conversion under 0.5% sustained for 60 days. Means free users want the
  thing free or not at all — Companion's price point isn't supported.
- Refund rate over 10% (means the unlock isn't delivering on its promise).
- Stripe disputes / chargebacks at a rate that threatens the merchant
  account.

### Estimated duration

**6–10 weeks.** Stripe integration is well-trodden; the work is mostly
honest UX (clear pricing, no dark patterns, post-purchase confirmation
that actually confirms).

---

## 6. Phase D — Companion (the magic moment)

> **Goal:** Ship the magic moment. The thing the whole architecture has
> been building toward.

### Load-bearing question

**Does the magic moment land, and will users pay $12/mo for it?**

By "land" we mean: a user logs out of WoW, and within a couple of
minutes, their phone buzzes with a notification, and the chapter is
ready to read. That sequence — and the *feeling* it creates — is the
product.

### Scope

- **Companion Electron desktop app** (separate repo; MIT; auto-update;
  signed for Mac + Windows). Watches `WTF\Account\*\SavedVariables\`.
- **Pairing flow** (`/pair` route, 6-digit TV-login pattern per
  [companion-architecture.md §5](./companion-architecture.md)).
- **Managed enrichment** — backend edge function calls OpenRouter with
  our key; user no longer needs BYOK.
- **Web push notifications** via VAPID + service worker (PWA installed).
- **Realtime PWA updates** via Supabase Realtime subscribing to
  `chapters` table.
- **Stripe subscription** for $12/mo Companion tier. Stripe Checkout +
  Customer Portal.
- **Lapse handling** per [companion-architecture.md §3.4](./companion-architecture.md)
  — backend rejects enrichment for lapsed subs (402), daemon downgrades
  to watch-and-notify.

### Out of scope for Phase D

- Chronicler / Loremaster premium tiers. Phase E.
- Native mobile app. PWA only (architecture §14).
- AI images, voice narration, multi-character merged narratives, social.
- Multi-WoW-account households if architecture doc §10 isn't resolved
  by then.

### Entry gates

- [ ] Phase C exit gates met. We know users will pay.
- [ ] **Companion repo** scaffolded, decision made on monorepo vs separate
      (current lean: separate per architecture doc §13).
- [ ] **Code signing** — Apple Developer account ($99/yr), Windows EV cert
      (~$300/yr) acquired. SmartScreen reputation is a real launch barrier.
- [ ] **Auto-update infrastructure** chosen (electron-updater + GitHub
      Releases is the default; verify it works under signed-Mac
      constraints).
- [ ] **Multi-WoW-account decision** in architecture doc §10 either
      resolved or scoped as "watch primary WTF/Account only for V1, real
      multi-account support post-launch."
- [ ] **OpenRouter business account** + spending limits set; managed-key
      LLM cost model validated against Phase A/B data.
- [ ] **VAPID keys generated**, service worker registered, push tested
      end-to-end on iOS 16.4+ PWA + Android Chrome + desktop Chrome /
      Safari / Firefox.

### Exit gates (Phase D is "done" when…)

- [ ] **≥ 100 paying Companion subscribers** with median tenure ≥ 60 days
      (means it's not just a curiosity buy that churns).
- [ ] **Magic-moment latency** — WoW logout to phone push receipt
      consistently under 3 minutes (p90).
- [ ] **Companion auto-update** has shipped at least one minor revision
      without breaking the install base.
- [ ] **Lapse path tested** — at least 10 users have cancelled and
      successfully walked back to the Free + account tier without data
      loss or support escalation.

### Kill criteria

- Median magic-moment latency above 10 minutes (the *feeling* doesn't
  work; this isn't a fixable-with-marketing problem).
- Companion subscriber growth flatlines under 50 paying users for 90
  days (no product-market fit at the price point — either drop the price
  or reconsider the tier).
- Major Blizzard policy change that breaks the architecture's compliance
  posture (e.g., new EULA clause that targets desktop companions).

### Estimated duration

**6–12 months** from Phase C exit. This is the big build. Honestly
estimated, this is where most of the engineering lives.

---

## 7. Phase E — Chronicler / Loremaster

> **Goal:** Capture pricing power on top of Companion.

### Load-bearing question

**Will Companion subscribers upgrade to a higher tier for richer
features, or is $12/mo the ceiling?**

### Scope

Per [`companion-architecture.md`](./companion-architecture.md) §2:

- **Chronicler ($24/mo):** Up to 10 characters. Richer models / longer
  context. Ongoing saga memory across chapters. Unlimited regeneration.
  Bible polish loop. Premium themes free.
- **Loremaster ($??/mo):** Unlimited characters. Top-tier models. Public
  hero page. Audio narration (if Phase 2 / post-launch decisions land
  there). Concierge support.

### Out of scope

- Anything that would compromise Companion's core promise. Chronicler
  and Loremaster *add* on top; Companion users never feel downgraded.

### Entry gates

- [ ] Phase D exit gates met (Companion is a real product).
- [ ] At least **20% of Companion subscribers** have expressed unprompted
      demand for one of the Chronicler features (memory across chapters
      seems the most likely; verify by listening).

### Exit gates / kill criteria

Deferred. Phase E is far enough out that defining exit criteria now is
speculation. Revisit when Phase D's exit gates are within sight.

---

## 8. Cross-phase concerns

### Pre-launch checklist (Phase A entry, one-time)

- [ ] LLC / business entity established (Stripe wants this; some Patreon
      flows want this too).
- [ ] Trademark search for "Aftertale" (preliminary). Filing can wait,
      but knowing if someone owns the mark in our category can't.
- [ ] Domain configured: `aftertale.gg` primary, `www.aftertale.gg`
      attached, `aftertale.app` defensive registration if affordable.
- [ ] `support@aftertale.gg` email (Cloudflare email routing → Jeff's
      personal mailbox is fine for V1).
- [ ] `security@aftertale.gg` per `SECURITY.md` (same routing).
- [ ] One-page **press kit** (logos, screenshots, one-liner, founder
      bio, contact) hosted at `/press` or as a GitHub release asset.
      Useful before anything goes wide.

### Ongoing concerns

- **Blizzard policy compliance** — the addon stays MIT, zero network,
  zero auth. Any change requires re-reading `plan.md` §1.
- **Prose quality monitoring** — sample N chapters per week, read them,
  note where they fail. The single most important habit. If a model
  upgrade silently degrades prose quality, we want to catch it in days,
  not months.
- **Cost monitoring** — managed enrichment costs are real money once
  Phase D ships. Per-tier model defaults configurable from the backend
  without a deploy.
- **Compliance with OpenRouter ToS** — we're a downstream user, not a
  reseller. The boundary matters.

### Decisions deferred

These don't block the launch ladder but need answers before the phase
they touch:

- **Companion repo: monorepo vs separate** (Phase D entry).
- **Push provider: roll-our-own VAPID vs OneSignal/Pusher Beams** (Phase D
  entry).
- **Multi-WoW-account households** (architecture §10) — Phase D entry.
- **Refund policy for unlocks vs subscriptions** (Phase C entry, deepened
  in D).
- **What constitutes "abuse" of the BYOK tier** if anyone tries to use
  Aftertale as a generic LLM proxy. Probably nothing to do (their key,
  their cost, their problem), but worth a paragraph.

---

## 9. What this plan deliberately doesn't promise

- **It doesn't promise a date.** Each phase has duration estimates, not
  ship dates. We move when the gate clears.
- **It doesn't promise Phase E.** Chronicler and Loremaster might be
  reshaped or dropped based on what Phase D teaches. Designing them
  more concretely now is speculation.
- **It doesn't promise we ship at all.** If Phase A's kill criterion
  hits — fewer than half the cohort wants the next chapter — we don't
  push to Phase B. The cost-of-honest-stop has been built in.

---

## 10. The wording trap

**Be careful with "free forever."** Promise this:

> *"The free tier is always free. You'll never lose access to your
> chronicle."*

Don't promise this:

> *"Aftertale is always free."*

The two sentences are very different, and the second is the one that
poisons every future paid-tier launch. Every public communication
(landing page, FAQ, README, Patreon page, addon description) should use
the first framing.

The architecture already supports this distinction: anonymous users keep
their localStorage forever; signed-in users keep their cloud data forever;
Companion is a *paid layer that adds the magic moment*, not a paywall on
existing functionality. We say what's true.

---

*Authored 2026-05-28 by Jeff + Claude (Opus 4.7) during a sequencing
conversation that resolved the "all five tiers coordinated" framing
into a phased ladder. Edit freely.*
