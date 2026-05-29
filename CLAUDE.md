# CLAUDE.md — Working Conventions for AI Agents in This Repo

This file tells Claude Code (and any other agent) how Jeff actually wants
to work in this repo. **Read it first. Default to acting, not asking.**

---

## Solo dev. One user. No ceremony.

This is a one-person project (Jeff). There is no team to coordinate with,
no reviewer to gate changes, no QA pass before deploy. The blast radius
of a bad change is "Jeff sees a glitch on his own site for a few minutes
and tells the agent to fix it."

**Optimize for speed of iteration, not safety theater.**

---

## Deployment workflow

Production is **Cloudflare Pages**, auto-deployed on every push to `main`.
There is **no GitHub Actions CI** in this repo — Cloudflare's runner is the
only build environment.

### Standard loop (use this every time)

1. Edit code.
2. `npm run dev` — verify at `http://localhost:5180`.
3. `npm run build` — **must pass.** This is the load-bearing gate; it
   mirrors exactly what Cloudflare runs.
4. `git add` → `git commit` straight to `main`.
5. Update `CHANGELOG.md` if the change is user-facing or notable.
6. `git push` → live on aftertale.gg in ~1–2 min.

### Rules

- **Commit directly to `main`.** No feature branches, no PRs.
- **Never create a branch** unless Jeff explicitly asks for one. Every
  non-main branch creates a Cloudflare preview deploy at
  `<branch>.aftertale.pages.dev` and burns CF build minutes.
- **No PR descriptions, no squash discipline, no GitHub Actions setup.**
- Write clear commit messages. That's enough process.

### Rollback

If a push breaks prod: `git revert <sha>` → push → CF redeploys the revert
in ~1 min. **Don't try to forward-fix under pressure** — revert first, then
debug.

---

## When to stop and ask before pushing

Default is "just push." Stop and confirm with Jeff only if the change:

- Touches **auth** (`src/lib/auth.ts`, OTP flow, Supabase auth config)
- Touches **`apiKeys.ts`** or how keys are stored/loaded
- Adds, edits, or deletes a **Supabase migration**
- Deletes or renames anything in `public/` (assets referenced by URL)
- Changes the **landing page above the fold**
- Would be **hard to roll back** (e.g. a destructive DB change)

For anything else, including UI tweaks, copy changes, new components,
refactors, dep bumps, addon edits — **just do it and push.**

---

## What the agent should do itself (not ask Jeff to do)

Jeff has noted that agents ask him to do too much. Defaults:

- **Run commands yourself.** `npm install`, `npm run build`, `npm run dev`,
  `git status`, `git diff`, `git log`, `git commit`, `git push` — all
  yours. Don't tell Jeff "you should run X" — run X.
- **Read files yourself** instead of asking Jeff what's in them.
- **Check the actual current state** (git status, file contents, running
  processes) before asking clarifying questions. Most "clarifying"
  questions are answerable with one tool call.
- **Make the obvious choice** when there's an unambiguous best option.
  Don't present a menu of three options when one is clearly right.
- **Clean up after yourself.** If you create a probe file, scratch
  artifact, or temp script, delete it when done — don't ask permission.
- **Restart the dev server yourself** after `.env` changes, dep bumps, or
  config edits that require it.
- **Apply migrations yourself** via the Supabase CLI / Management API
  when network access is available — don't punt to "next session."

### When to actually ask

- Design decisions with real trade-offs (e.g. "should this be a modal or
  a drawer?")
- Anything in the "stop and confirm" list above
- When the user's intent is genuinely ambiguous and guessing wrong would
  waste meaningful work
- Before doing something destructive that can't be undone with `git revert`

---

## Repo-specific facts worth remembering

- **Stack:** Vite 6 + React 19 + TypeScript, deployed to Cloudflare Pages.
- **Dev port:** `5180` (strict, pinned in `vite.config.ts`).
- **Node:** ≥ 20 (Jeff runs 23.11 locally; CF runner uses its default).
- **Lint command** is just `tsc --noEmit` — there's no ESLint yet.
- **No API keys are baked into the production bundle.** Users paste their
  own OpenRouter key into the in-app ⚙ Keys panel; it's stored in
  `localStorage` only. The `apiKeys.ts` fallback handles this. Don't add
  `VITE_*_KEY` env vars to the production deploy.
- **Supabase project ref:** `zukzghfbldvzbigqdirx`. Anon key is in
  `.env.local` (gitignored). Migrations live in `supabase/`.
- **WoW addon** lives at `addon/Aftertale/`. It's symlinked into
  `C:\Program Files (x86)\World of Warcraft\_retail_\Interface\AddOns\Aftertale`
  via an `mklink /J` junction, so edits are picked up after a `/reload`
  in-game.
- **Network allowlist for agent sandboxes:** `.claude/settings.json`
  already allowlists `*.supabase.co` and `api.supabase.com` for WebFetch
  and curl. If you hit `host_not_allowed` for another host, add it there
  rather than pinging Jeff.

---

## Tone

Jeff is direct, low-ceremony, and dislikes filler. Match that:

- Skip preamble ("Great question!", "I'll help you with that!").
- Skip recaps of what was just done unless asked.
- Short responses for short tasks. Long responses only when complexity
  earns them.
- Push back when you disagree — Jeff prefers honest pushback over
  agreement theater.
