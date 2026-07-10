# Gemini CLI Tool Mapping

| Action | Tool |
|--------|------|
| Read a file | `read_file` |
| Write/create a file | `write_file` |
| Edit an existing file | `edit_file` |
| Search file contents | `shell` with `grep` or `rg` |
| Find files by name | `shell` with `find` or `ls` |
| Run a shell command | `shell` |
| Invoke a skill | `activate_skill` tool, or read SKILL.md with `read_file` |
| Dispatch a subagent | Not natively available - do tasks sequentially |

## Notes
- Gemini loads lex via the GEMINI.md context file (includes SKILL.md + this mapping)
- To invoke a skill: use `activate_skill` if available, otherwise `read_file` on the skill's SKILL.md
- `.lex/` files are plain markdown - read them with `read_file`
