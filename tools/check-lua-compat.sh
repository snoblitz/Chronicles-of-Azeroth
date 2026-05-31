#!/usr/bin/env bash
# tools/check-lua-compat.sh
#
# Catches Lua 5.2+ syntax that WoW's Lua 5.1 runtime will silently
# mis-render. Run by the Edit/Write PostToolUse hook in .claude/settings.json
# so every time the addon source is touched, we catch incompatibilities
# before they ship.
#
# Current checks:
#   * \xNN hex escapes  --  Lua 5.2 only. WoW eats the backslash and renders
#                           the rest of the string as literal text, producing
#                           the infamous "xE2x9CxA6" tofu bug.

set -u

# Limit search to the addon tree. Other Lua-like files in the repo (none yet
# but room for vendor/) shouldn't trip this.
SCAN_ROOT="addon"

if [ ! -d "$SCAN_ROOT" ]; then
  exit 0
fi

# Pattern: literal backslash + x + hex digit. Single-quoted so the shell
# doesn't interpret the backslash; grep treats \\ as the regex for \.
hex_hits=$(grep -rn '\\x[0-9A-Fa-f]' --include='*.lua' "$SCAN_ROOT" 2>/dev/null || true)

if [ -n "$hex_hits" ]; then
  cat >&2 <<EOF
Lua 5.2 hex escape (\xNN) detected in WoW addon code.

WoW uses Lua 5.1 -- hex escapes aren't supported and the runtime will
strip the backslash, rendering "\xE2\x9C\xA6" as the literal text "xE2x9CxA6".

Convert to a decimal escape or string.char() instead:

  "\xE2\x9C\xA6"     ->  "\226\156\166"      (4-point star)
  "\xC3\x97"         ->  "\195\151"          (multiplication sign)
  string.char(0xC3, 0x97)                    (equivalent, more explicit)

Offending lines:
$hex_hits
EOF
  # Exit 2 surfaces the message to the model so the next action fixes it.
  exit 2
fi

exit 0
