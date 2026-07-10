# Copilot CLI Tool Mapping

| Action | Tool |
|--------|------|
| Read a file | `Read` |
| Write/create a file | `Write` |
| Edit an existing file | `Edit` |
| Search file contents | `Grep` |
| Find files by name | `Glob` |
| Run a shell command | `Bash` |
| Invoke a skill | Read the SKILL.md file directly with `Read` |
| Dispatch a subagent | `Agent` tool if available |

## Notes
- Copilot CLI shares the Claude Code tool names
- If no native skill tool exists, read SKILL.md files directly - this is the sanctioned mechanism
- `.lex/` files are plain markdown readable with `Read`
