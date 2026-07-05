#!/usr/bin/env bash
# Tests for hooks/post-tool-use. Run: bash tests/post-tool-use.test.sh
set -u
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
HOOK="$PLUGIN_ROOT/hooks/post-tool-use"
PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); echo "ok   - $1"; }
fail() { FAIL=$((FAIL+1)); echo "FAIL - $1"; }

# Fixture 1: ctx project - written file gets indexed
TMP="$(mktemp -d)"
mkdir -p "$TMP/.ctx" "$TMP/src"
printf 'export function hookIndexedFn() {}\n' > "$TMP/src/new.ts"
WINTMP="$(cd "$TMP" && pwd -W 2>/dev/null || pwd)"
PAYLOAD="{\"tool_input\":{\"file_path\":\"$(printf '%s' "$WINTMP/src/new.ts" | sed 's/\\/\\\\/g')\"}}"
OUT="$(cd "$TMP" && printf '%s' "$PAYLOAD" | CLAUDE_PLUGIN_ROOT="$PLUGIN_ROOT" bash "$HOOK")"
[ "$(printf '%s' "$OUT" | tail -1)" = "{}" ] && ok "outputs {}" || fail "outputs {} (got: $OUT)"
FOUND="$(cd "$TMP" && node "$PLUGIN_ROOT/bin/ctx.js" search hookIndexedFn)"
printf '%s' "$FOUND" | grep -q "src/new.ts" && ok "file indexed via hook" || fail "file indexed via hook"
LIVE="$TMP/.ctx/live.json"
[ -f "$LIVE" ] && ok "live.json created" || fail "live.json created"
grep -q "src/new.ts" "$LIVE" 2>/dev/null && ok "live.json contains touched file" || fail "live.json contains touched file"

# Fixture 2: no .ctx - silent no-op, exit 0
TMP2="$(mktemp -d)"
OUT2="$(cd "$TMP2" && printf '{}' | CLAUDE_PLUGIN_ROOT="$PLUGIN_ROOT" bash "$HOOK")"; RC=$?
[ "$RC" -eq 0 ] && ok "exit 0 without .ctx" || fail "exit 0 without .ctx"
[ ! -e "$TMP2/.ctx" ] && ok "does not create .ctx" || fail "does not create .ctx"

# Fixture 3: node missing from PATH - still valid output, exit 0
SHIM="$(mktemp -d)"
printf '#!/usr/bin/env bash\nexit 127\n' > "$SHIM/node"; chmod +x "$SHIM/node"
OUT3="$(cd "$TMP" && printf '%s' "$PAYLOAD" | PATH="$SHIM:$PATH" CLAUDE_PLUGIN_ROOT="$PLUGIN_ROOT" bash "$HOOK")"; RC3=$?
[ "$RC3" -eq 0 ] && ok "exit 0 without node" || fail "exit 0 without node"
[ "$(printf '%s' "$OUT3" | tail -1)" = "{}" ] && ok "outputs {} without node" || fail "outputs {} without node"

rm -rf "$TMP" "$TMP2" "$SHIM"
echo "---"; echo "pass=$PASS fail=$FAIL"
[ "$FAIL" -eq 0 ]
