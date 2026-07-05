#!/usr/bin/env bash
# Tests for hooks/session-start rehydration. Run: bash tests/session-start.test.sh
set -u
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
HOOK="$PLUGIN_ROOT/hooks/session-start"
PASS=0; FAIL=0

ok()   { PASS=$((PASS+1)); echo "ok   - $1"; }
fail() { FAIL=$((FAIL+1)); echo "FAIL - $1"; }

# Fixture 1: project WITH .ctx state
TMP="$(mktemp -d)"
mkdir -p "$TMP/.ctx"
printf 'phase: testing\nnext: STATUS_MARKER_123\n' > "$TMP/.ctx/status.md"
printf '# Work In Progress\ntask: WIP_MARKER_456\n' > "$TMP/.ctx/wip.md"

OUT="$(cd "$TMP" && CLAUDE_PLUGIN_ROOT="$PLUGIN_ROOT" bash "$HOOK")"

echo "$OUT" | grep -q "STATUS_MARKER_123" && ok "injects status.md content" || fail "injects status.md content"
echo "$OUT" | grep -q "WIP_MARKER_456"    && ok "injects wip.md content"    || fail "injects wip.md content"
echo "$OUT" | grep -q "CURRENT PROJECT STATE"       && ok "status section title present" || fail "status section title present"
echo "$OUT" | grep -q "INTERRUPTED WORK - RESUME THIS" && ok "wip section title present" || fail "wip section title present"
echo "$OUT" | grep -q "hookSpecificOutput" && ok "claude-code JSON shape" || fail "claude-code JSON shape"

# Fixture 2: project WITHOUT .ctx - bootstrap still injected, no state sections
TMP2="$(mktemp -d)"
OUT2="$(cd "$TMP2" && CLAUDE_PLUGIN_ROOT="$PLUGIN_ROOT" bash "$HOOK")"

echo "$OUT2" | grep -q "universal coding companion" && ok "bootstrap injected without .ctx" || fail "bootstrap injected without .ctx"
if echo "$OUT2" | grep -q "## CURRENT PROJECT STATE"; then
  fail "no state section when .ctx absent"
else
  ok "no state section when .ctx absent"
fi

# Fixture 3: status.md only (no wip) - no wip section
TMP3="$(mktemp -d)"
mkdir -p "$TMP3/.ctx"
printf 'phase: solo status\n' > "$TMP3/.ctx/status.md"
OUT3="$(cd "$TMP3" && CLAUDE_PLUGIN_ROOT="$PLUGIN_ROOT" bash "$HOOK")"
if echo "$OUT3" | grep -q "## INTERRUPTED WORK"; then
  fail "no wip section when wip.md absent"
else
  ok "no wip section when wip.md absent"
fi

# Fixture 4: python3 unavailable - fallback path must still emit valid JSON
SHIM="$(mktemp -d)"
printf '#!/usr/bin/env bash\nexit 127\n' > "$SHIM/python3"
chmod +x "$SHIM/python3"
TMP4="$(mktemp -d)"
mkdir -p "$TMP4/.ctx"
printf 'line with "quotes" and \\ backslash\n' > "$TMP4/.ctx/status.md"
OUT4="$(cd "$TMP4" && PATH="$SHIM:$PATH" CLAUDE_PLUGIN_ROOT="$PLUGIN_ROOT" bash "$HOOK")"
if printf '%s' "$OUT4" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{JSON.parse(d)})' 2>/dev/null; then
  ok "fallback output is valid JSON without python3"
else
  fail "fallback output is valid JSON without python3"
fi

rm -rf "$TMP" "$TMP2" "$TMP3" "$SHIM" "$TMP4"
echo "---"
echo "pass=$PASS fail=$FAIL"
[ "$FAIL" -eq 0 ]
