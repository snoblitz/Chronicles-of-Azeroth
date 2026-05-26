# Chronicles of Azeroth — Constraints Excerpt

**This is a trimmed excerpt of the full monetization plan.** It contains only the sections that downstream agents and contributors need to know about while building the addon and companion. The full plan (pricing tiers, revenue modeling, launch sequencing, competitive analysis) lives outside this repo by design — those are business decisions, not engineering constraints.

**Sections kept:**
- §1 — Hard constraints (Blizzard policy, what we cannot do)
- §5 — Technical architecture (the compliant addon → companion → backend pattern)
- §6 — IP risk mitigations (what to strip / rename if the §10 pivot is taken)
- §10 — The tabled IP decision (still open — read this before making any product positioning change)

**Hard rules for anyone editing code in this repo:**

1. The Lua addon makes **zero network calls**. Ever.
2. The Lua addon contains **zero auth / license / entitlement logic**. Ever.
3. The Lua addon is **MIT licensed**, open source, hosted on CurseForge + Wago.
4. Entitlement is decided by the **backend**, materialized as files the **companion** writes back to the addon's SavedVariables folder.
5. We **never** call the Blizzard Developer / Community API in any path that supports a paid tier.
6. We **never** ship Blizzard quest text, NPC dialog, or lore copy bundled into our code. Player data comes from the user's own running game client via the WoW addon API → SavedVariables.

---

## §1. Hard constraints — the lines we cannot cross

### Blizzard Addon Policy (unchanged since 2009, reposted Nov 2018)

| Rule | Text | CoA impact |
|---|---|---|
| 1 | Addons must be free. No premium versions, no charging for **services related to the addon** | Phrase "services related to the addon" is the dangerous one. The Zygor workaround (distribute paid *content files* not paid *code*) survives by community/Blizzard tolerance, not legal clarity. |
| 2 | Code must NOT be obfuscated, must be public | The Lua addon must be open source. No license-key checks inside it. |
| 3 | No negative server impact | Don't poll WoW APIs aggressively. |
| 4 | No advertisements | No "Sign up for Premium!" banner in the in-game UI. |
| 5 | No in-game donation solicitation | Donation asks live on website/Discord only. |
| 6-7 | T-rated content, must abide by EULA | Standard. |
| 8 | Blizzard may break addon functionality at any time | The Midnight prepatch killed "almost every addon" in retail — proves Blizzard's enforcement mechanism is **technical API restriction**, not legal action. |

### Blizzard Developer API Terms (Oct 2019)

If we *ever* use Blizzard's REST API (Armory data, character lookups, etc.), **premium tiers are explicitly prohibited.** No exceptions, no workarounds, no community-tolerated gray zone.

**Therefore: CoA must never call Blizzard's Developer API in any flow that supports the paid tier.** All character data comes from in-game SavedVariables (via the addon → companion bridge), or from user-typed input. Never from the Armory API.

### Battle.net EULA (Mar 2024)

- No "bots" (automated control of characters) — confirms what we already know
- No data mining of game internals beyond what the addon API exposes
- No combat-affecting actions from external input (Mantella-style "LLM tells you what to cast" is fine; LLM literally casting is forbidden)

### Blizzard Legal FAQ (the IP wall — see §10)

> "Can I write novels, screenplays, theatrical productions or other adaptations based on your games?" → **"No."**
> "Can I make and sell my own products… based on a Blizzard universe?" → **"No."**

This is the document that puts the *current* CoA branding in extreme risk. Tabled — §10.

---

## §5. Technical architecture for compliant monetization

The Zygor pattern, but using the WeakAuras Companion stack:

```
[WoW Game Client]
  Lua addon (ChroniclesOfAzeroth, MIT, open source on CurseForge + Wago)
  - Writes events to SavedVariables/ChroniclesOfAzerothDB.lua on /reload or logout
  - Reads ChroniclesOfAzerothCompanion.lua from SV folder on /reload
  - Displays UI, journal, static lore DB — fully functional standalone
  - ZERO auth code, ZERO network calls
       ↓ (mtime polling every 2000ms via fs.statSync — NOT chokidar)
[Electron Companion App] (free download, open source under MIT)
  - File watcher → Lua parser (luaparse) → event queue
  - Auth layer:
      - License key entered by user
      - Companion calls our backend: POST /auth/activate { key }
      - Backend returns JWT + tier
      - JWT stored in encrypted Electron userData
  - LLM orchestration:
      - Free tier / BYOK: user provides Gemini/OpenAI/Anthropic key, all local
      - Paid tier: companion calls our backend, which proxies to LLM provider
  - Writes ChroniclesOfAzerothCompanion.lua into addon SV folder
       ↓
[Our Backend Service] (Stripe + Postgres + LLM proxy)
  - Stripe webhooks → entitlement table
  - JWT issuance + refresh
  - LLM proxy with per-user rate limits + COGS tracking
  - Optional: cloud sync of chronicles (premium feature)
  - NEVER calls Blizzard Developer API
```

**Why this is compliant:**
- Addon does nothing except read/write files in its own SavedVariables. Per Rule 1, it has no premium features, no paywall, no service-related-to-the-addon (the service is the companion talking to *our* backend, not Blizzard's, and the addon itself is fully usable without it).
- Code is fully open (Rule 2).
- No automation of in-game actions (EULA bot clause).
- No use of Blizzard Developer API (sidesteps the API ToU premium prohibition).
- The companion is a desktop app, not an addon. The companion can do whatever it wants — Stripe, JWT, LLM, all fine. **The companion is also free and open source**, with premium gated by what *our backend* sends it.

**Why this is cleaner than Zygor:**
- Zygor sells *data files* (guide steps). The argument is "data isn't an addon." It's worked for 18 years but is legally thin.
- We sell *LLM compute + cloud services*. These are unambiguously services, not data, not addons. They're SaaS in the textbook sense, like Sudowrite or NovelAI, that happens to have a WoW-side reader. **The legal argument is one layer cleaner than Zygor's.**

---

## §6. IP risk mitigations — see §10 for the open question

If/when we pivot to the generic-engine positioning (§10 decision pending), the mitigation stack is:

1. **Rename** away from "Chronicles of Azeroth" / "Azeroth" trademark
2. **Strip Blizzard-IP-laden prompts** from the shipped repo (Magni, Muradin, etc.). The example character "Magnus Brunn" stays — he's original.
3. **Generic-engine marketing** — "AI narrative companion for fantasy RPGs." WoW happens to work great if you describe it.
4. **BYO-world templates** — users create and share their own world packs. We never officially curate WoW packs.
5. **Premium pricing on engine features only** (memory, voice, multi-char, sync), never on lore packs that include licensed IP.
6. **TOS clause:** users represent they own/license any IP they input.
7. **Never use Blizzard Developer API** in any flow that touches the paid tier.
8. **Mantella-style disclaimer:** "Not affiliated with Blizzard / WoW / any IP holder."

---

## §10. The tabled decision — IP positioning

**Status: tabled, documented, come back to. Do not resolve unilaterally in code review.**

### The finding

Blizzard does NOT have a permissive "Fan Content Policy" like Wizards of the Coast. Their actual legal stack — Legal FAQ, EULA, API ToU, Video Policy, Fan Art Submissions terms — is **uniformly restrictive** about commercial use of their IP.

Most damning, the Legal FAQ verbatim:
> "Can I write novels, screenplays, theatrical productions or other adaptations based on your games?" → **"No."**

An AI-generated chronicle featuring Magni Bronzebeard set in Azeroth is a literary adaptation. The Legal FAQ says no. The Video Policy carves out an exception for YouTube/Twitch partner-program monetization of free-to-access video — that exception does not apply to a paid software product.

### Current product state risk

| Element | Risk contribution |
|---|---|
| Name "Chronicles of Azeroth" | Trademark on "Azeroth" |
| Domain `snoblitz.github.io/Chronicles-of-Azeroth` | Same trademark + public URL |
| Shipped prompts for Magni Bronzebeard, Muradin | Copyright on characters |
| Planned premium tier | Commercial exploitation, the Legal FAQ "No" |
| Repo openly markets as WoW companion | Induced infringement risk via marketing |

**Risk level: 🔴 EXTREME** as currently designed for a paid product.

### Options on the table

1. **Rename + pivot to generic engine** (Mantella playbook) — the recommended path. CoA becomes "Lore Forge" or similar, ships no Blizzard content, users supply their own world. Premium pays for engine. ✅ Enables monetization.
2. **Keep name, stay free-forever, no paid tier** — preserves the current branding but kills the monetization plan. Mantella-shaped: free, open, donation-funded only. Pure Patreon support, no SaaS.
3. **Reach out to Blizzard's licensing team first** — formally inquire about a license. They've licensed novels and art books. They do NOT license individuals. Likely outcome: polite no. But it produces clarity.
4. **Keep building as-is, accept the risk, plan exit** — most dangerous. C&D arrives sometime after we have customers and a paid tier, leaving us with unrefundable subs and a dead business.

### What's already true regardless of which option we pick

Even before resolving this, we should:
- ✅ `magnusBrunn` is fine (original character) but `magniBronzebeard` and `muradinBronzebeard` prompts should come out of the public repo
- ✅ Stop using Blizzard-IP-laden screenshots in any marketing
- ✅ Add a "not affiliated with Blizzard" disclaimer to the README
- ✅ Don't add the Blizzard Developer API to any code path

### When to revisit

Recommended: **before any further public marketing push** and **before Phase 1 Electron app launch**. Renaming a product is enormously cheaper before it has users than after.

---

*This excerpt is maintained out of the canonical monetization plan held by the project owner. If you're an agent reading this and the user asks about anything not covered here (pricing, launch sequencing, competitive analysis), ask the user — don't invent it.*
