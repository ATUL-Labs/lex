# Windsurf Tool Mapping

Windsurf uses the same tool names as Cursor/Claude Code.

| Action | Tool |
|--------|------|
| Read a file | `Read` |
| Write a new file | `Write` |
| Edit an existing file | `Edit` |
| Search file contents | `Grep` |
| Find files by name | `Glob` |
| Run a shell command | `Bash` or `PowerShell` |
| Invoke a skill | Read the SKILL.md file directly with `Read` |
| Dispatch a subagent | `Agent` tool if available |

## Notes
- Windsurf reads `AGENTS.md` at session start for instructions
- Skills are loaded by reading SKILL.md files directly
- `.lex/` files are plain markdown readable with `Read`
