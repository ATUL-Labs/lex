# Antigravity CLI (agy) Tool Mapping

| Action | Antigravity tool |
|--------|-----------------|
| Read a file | `view_file` (set `IsSkillFile: true` when loading skills) |
| Write/create a file | `write_to_file` |
| Edit a file | `replace_file_content` |
| Edit multiple places | `multi_replace_file_content` |
| Run a shell command | `run_command` |
| Search file contents | `grep_search` |
| Find files by name | `list_dir` (combine with `grep_search` for patterns) |
| Fetch a URL | `read_url_content` |
| Search the web | `search_web` |
| Ask the user | `ask_question` |
| Dispatch a subagent | `invoke_subagent` with `TypeName: "self"` (full) or `"research"` (read-only) |
| Parallel dispatch | Multiple entries in one `invoke_subagent` call's `Subagents` array |
| Task tracking | Task artifact via `write_to_file` with `IsArtifact: true`, `ArtifactType: "task"` |

## Invoking a skill

Antigravity has no `Skill` tool. To load a skill, read its `SKILL.md` with `view_file` and set `IsSkillFile: true`. This is the sanctioned mechanism on this platform.

## Notes
- `manage_task` manages background processes, NOT todos. Use task artifacts for checklists
- `.lex/` files are plain markdown - read with `view_file`, update with `replace_file_content`
- Subagent `TypeName: "self"` can write files and run commands. `TypeName: "research"` is read-only
