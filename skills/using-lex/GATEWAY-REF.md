# Gateway Command Reference

## Input formats (pick the lightest)

```
# 1. Empty file = no-arg command (filename IS the command)
write_to_file('.lex/in/errors.json', '', true)   # → {cmd:"errors",args:[]}

# 2. Plain text = cmd + args
write_to_file('.lex/in/r.json', 'search ValidationError')
write_to_file('.lex/in/r.json', 'grep res\\.status|src/app.js')

# 3. JSON = full control
write_to_file('.lex/in/req.json', '{"cmd":"search","args":["InputError"]}')
```

## Commands

| cmd | args | example |
|-----|------|---------|
| `search` | `["terms"]` | `{"cmd":"search","args":["InputError"]}` |
| `memory` | `["terms"]` | `{"cmd":"memory","args":["InputError"]}` |
| `recall` | `["terms"?]` | `{"cmd":"recall","args":["FTS5"]}` (persistent + episodic) |
| `episode` | `[{json}]` | `{"cmd":"episode","args":[{"title":"...","summary":"...","files":[...]}]}` |
| `docs` | `["terms"?]` | `{"cmd":"docs","args":["hasMany"]}` |
| `symbols` | `["file.js"]` | `{"cmd":"symbols","args":["src/app.js"]}` |
| `grep` | `["pattern","file?"]` | `{"cmd":"grep","args":["res\\.status","src/app.js"]}` |
| `read` | `["file","start-end?"]` | `{"cmd":"read","args":["src/app.js","10-20"]}` |
| `patch` | `{file,anchor,insertion,mode}` | `{"cmd":"patch","args":{"file":"src/app.js","anchor":"const x=1","insertion":"const y=2;","mode":"after"}}` |
| `insert` | `{file,after?,before?,line}` | `{"cmd":"insert","args":{"file":"src/app.js","after":"const x=1","line":"const y=2;"}}` |
| `rename` | `{file?,from,to}` | `{"cmd":"rename","args":{"from":"oldName","to":"newName"}}` |
| `delete` | `["file"]` | `{"cmd":"delete","args":["src/old.js"]}` (safe delete to .lex/trash/) |
| `batch` | `[cmd1,cmd2,...]` | `{"cmd":"batch","args":[{"cmd":"search","args":["err"]},{"cmd":"symbols","args":["src/app.js"]}]}` |
| `chain` | `[{cmd,args,as?,stopOnError?},...]` | multi-step with context passing |
| `task` | `["list"\|"create",{cmd,...}\|"get","id"\|"clear"]` | background task queue |
| `diff` | `[]` | files changed since last refresh |
| `errors` | `[]` | console + app errors (auto-persists to mistakes.md) |
| `note` | `["text"]` | record a mistake/fix |
| `audit` | `["url1","url2"?]` | omit URLs for auto-detect |
| `integrity` | `["file.html"?]` | orphan CSS, undefined vars, broken refs |
| `test` | `[{url,method?,mode?}]` | set `mode:"xss"` for XSS scan |
| `devloop` | `["file"?]` | test all indexed endpoints |
| `convert` | `{input,output,width?,height?,size?,multi?,scale?}` | SVG→PNG/WebP/ICO, PNG→ICO |
| `config` | `["show"\|"detect"\|"set",key?,value?]` | project config |
| `skills` | `["evolve"\|"review","--approve"?]` | auto-generate/review skills |
| `links` | `["/api/users"?]` | route + frontend consumers |
| `undo` | `[]` | revert last patch |
| `snapshot` | `["save","file1","file2"]` | backup files |
| `refs` | `["symbol"]` | all references to a symbol |
| `recent` | `[limit]` | recent files |
| `guard` | `[]` | scan for secrets + DB anti-patterns |
| `check` | `[]` | health check |
| `proactive` | `["file.js"?]` | context-aware memory surfacing |
| `synth` | `["--dry-run"?,"--date=YYYY-MM-DD"?]` | auto-synthesize session episode |
| `decay` | `["--apply"?]` | compress old episodes |
| `assoc` | `["--apply"?]` | build "see also" links |
| `promote` | `["--apply"?]` | mistakes→patterns, patterns→rules |
| `capture` | `["--apply"?]` | detect edit→run→error→edit patterns |

## Patch modes: `after`, `before`, `replace`, `replace-line`, `delete`, `preview`

Auto-backup to `.lex/trash/` before writing. Use `undo` to revert.

- **`delete`**: removes the anchor. If anchor is the only thing on its line, removes the whole line.
- **`rename`**: word-boundary find-replace across entire file.

**Non-unique anchors**: Add `"occurrence": N` to target match #N, or `"line": N` to target by line number.

```json
{"cmd":"patch","args":{"file":"src/app.js","anchor":"catch (e) {","insertion":"// handler","mode":"after","occurrence":2}}
```

**Short anchors**: 5 chars work if unique. Use 20+ chars for best results.

**Batch mode**: Send multiple commands in one request. Results separated by `---`.
