# Codex Tool Mapping

| Action | Tool |
|--------|------|
| Read a file | `read_file` |
| Write/create a file | `write_file` |
| Edit an existing file | `apply_patch` |
| Search file contents | `grep` or `shell` with `rg` |
| Find files by name | `shell` with `find` or `fd` |
| Run a shell command | `shell` |
| Invoke a skill | `skill` tool with `name: "skill-name"` |
| Dispatch a subagent | `task` tool with `subagent_type` and `prompt` |
| Create/update todos | `task` tool for tracking |

## Notes
- Codex may need multi-agent enabled in settings for subagent dispatch
- Reading `.lex/` files: use `read_file` with the path
- Skills are invoked via the `skill` tool
- If no `skill` tool available, read the SKILL.md file directly with `read_file`
