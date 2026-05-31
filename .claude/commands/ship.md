---
description: Run the build, update CHANGELOG.md, commit to main, and push. The repeated end-of-edit ritual for this repo.
---

# `/ship`

The standard end-of-edit ritual for Aftertale. Cloudflare auto-deploys
on every push to `main`, so this is the deploy. Per `CLAUDE.md`:
direct-to-main, no feature branches, no PRs.

Optional argument: `$ARGUMENTS` becomes a short hint about what the
commit is. If empty, infer from the diff.

## Steps

Run these in order. Stop and report back if any step fails.

### 1. Verify the working tree

Run in parallel:

```bash
git status
git --no-pager diff --stat
git --no-pager log --oneline -3
```

If `git status` shows nothing to commit, stop here and tell the user
there's nothing to ship.

### 2. Run the build

```bash
npm run build
```

This is the load-bearing gate. **If the build fails, stop. Do not
commit.** Report the error so the user can decide whether to fix or
abort.

### 3. Review what's changing

Look at the diff:

```bash
git --no-pager diff
```

Decide whether the change is **user-facing or notable** enough to deserve
a CHANGELOG entry. User-facing = anything Jeff would care to see in a
release-notes scan: new features, UX changes, bug fixes that affect
behavior, art swaps, addon changes, deployed copy. Skip for: internal
refactors, dependency bumps with no behavior change, tooling-only
changes (like a script in `tools/`).

### 4. Update CHANGELOG.md (if warranted)

If the change is user-facing, prepend an entry under the existing
`## [Unreleased]` section. Match the surrounding style — a short
`### Added` / `### Changed` / `### Fixed` heading with the date
`*(YYYY-MM-DD)*`, followed by a 2–5 sentence description that focuses
on the *why* and the *user-visible effect*, not the file list.

Don't restructure existing entries. Just prepend the new one above
the most recent dated section.

### 5. Stage + commit

Stage by **specific path**, not `-A` and not `.`, to avoid grabbing
sandbox artifacts or accidentally-included files. Look at `git status`
output and pick exactly the paths that should ship.

Commit with a clear message via HEREDOC:

```bash
git commit -m "$(cat <<'EOF'
short, present-tense subject line under 70 chars

Body that explains why this change exists. What user problem does it
solve, or what design intent does it deliver? Reference specific files
or functions when it helps a future reader navigate. Keep it tight --
two or three short paragraphs at most.
EOF
)"
```

**Never amend.** If a hook blocks the commit, fix the underlying issue
and create a new commit. Don't use `--no-verify` or any signing-bypass
flags.

### 6. Push to main

```bash
git push -u origin main
```

If the push fails due to a fast-forward rejection (`! [rejected]`):
that means someone (likely Jeff on another device) pushed in the
meantime. Run `git pull --rebase origin main` then retry the push.

If the push fails due to a network error (timeout, 5xx, connection
reset): retry with exponential backoff — wait 2s, retry, then 4s,
8s, 16s. Give up after the 4th attempt and report.

### 7. Report

End with a one-line summary: commit SHA + what shipped. Example:

> Pushed `a1b2c3d` — Hub overview tab gets illustrated icons; live in
> ~1–2 min.

Don't recap the steps. Don't list the files. The user can run
`git log` themselves if they want detail.

## Things `/ship` will refuse to do

- Push to any branch other than `main`
- Force push
- Commit secrets (`.env`, credentials, anything matching the gitignore'd
  patterns)
- Bypass hooks with `--no-verify`
- Amend the previous commit

If any of these would be needed, stop and ask Jeff explicitly.
