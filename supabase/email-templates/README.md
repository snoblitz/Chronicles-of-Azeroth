# Aftertale email templates

These are the source-of-truth HTML files for Supabase Auth's transactional
emails. They're pushed to the live project via the Supabase Management API
(see `tools/supabase-push-email-templates.mjs`).

## Design constraints (the email-rendering gauntlet)

Email is not the web. Templates here follow these rules:

- **Tables for layout** — Outlook on Windows still uses the Word HTML renderer,
  which ignores `flex`, `grid`, modern positioning, and most CSS.
- **Inline styles only** — Gmail strips `<style>` blocks in some clients (notably
  Gmail's Android app rendering forwarded mail). We ship every rule inline.
- **System fonts only** — no `@import`, no `<link rel="preload">`, no webfonts.
  We use a serif stack (`Iowan Old Style → Palatino → Georgia → serif`) for
  display, matching the spirit of the Aftertale UI without depending on
  Cinzel/etc. loading.
- **Single-column, ≤600px wide** — the iPhone Mail safe width.
- **Preheader text** — the first ~90 chars after the subject in inbox lists.
  Rendered as a hidden span at the top of `<body>`.
- **Single CTA per message** — no link soup.
- **No hosted images** — keeps deliverability clean (no embedded images to
  trip spam filters) and means nothing breaks if we ever move CDNs.
- **Palette pulled from `src/index.css`** — `--bg`, `--gold`, `--fg`, etc.

## Templates

| File | Supabase event | Triggered by |
| --- | --- | --- |
| `save-chronicle.html` | `email_change` | `auth.updateUser({ email })` — i.e. "Save your chronicle" on an anonymous session |
| `sign-in.html` | `magic_link` | `auth.signInWithOtp({ email })` — i.e. returning-user sign in |

## Supabase template variables

These get string-substituted server-side before send. We only use:

- `{{ .ConfirmationURL }}` — the magic link (PKCE-flow URL ending in `?code=…`)
- `{{ .NewEmail }}` — only valid in `email_change`; the email the user just entered
- `{{ .SiteURL }}` — the site_url configured in Supabase Auth settings

## Shipping changes

After editing an `.html` file, run:

    node tools/supabase-push-email-templates.mjs

The script reads each file, posts to the Management API, and verifies the
update by reading the config back. Requires `SUPABASE_ACCESS_TOKEN` and
`SUPABASE_PROJECT_REF` in the environment.
