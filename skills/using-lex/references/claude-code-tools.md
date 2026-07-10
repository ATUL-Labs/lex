# Claude Code / Cursor / Windsurf Tool Mapping

| Action | Tool |
|--------|------|
| Read a file | `Read` |
| Write a new file | `Write` |
| Edit an existing file | `Edit` |
| Search file contents | `Grep` |
| Find files by name | `Glob` |
| Run a shell command | `Bash` (Unix) or `PowerShell` (Windows) |
| Invoke a skill | `Skill` tool with `skill: "skill-name"` |
| Dispatch a subagent | `Agent` tool with `description` and `prompt` |
| Create/update todos | `TaskCreate`, `TaskUpdate`, `TaskList` - load via `ToolSearch` first |
| Fetch a URL | `WebFetch` - load via `ToolSearch` first |
| Search the web | `WebSearch` - load via `ToolSearch` first |

## Notes
- Use `Read` to load `.lex/` files, never `Bash` with `cat`
- Use `Edit` for modifying existing files, `Write` for creating new ones
- Use `Grep` for finding patterns in code, `Glob` for finding files by name
- Skills are invoked via the `Skill` tool: `skill: "brainstorming"`, `skill: "tdd"`, etc.
- Subagents start cold - include all necessary context in the prompt
