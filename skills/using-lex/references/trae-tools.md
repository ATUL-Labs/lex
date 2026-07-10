# Trae Tool Mapping

Trae (ByteDance's AI IDE) exposes file editing, terminal, and search through its
Builder mode agent tools.

| Action | Tool |
|--------|------|
| Read a file | Trae builder file-read tool |
| Write a new file | Trae builder file-write tool |
| Edit an existing file | Trae builder file-edit tool |
| Run a shell command | Trae's integrated terminal |
| Search file contents | Trae workspace search, or `node <lex-repo>/bin/lex.js search` when Node is available |
| Find files by name | Trae workspace search |
| Invoke a skill | Read the SKILL.md file directly via the builder file-read tool |
| Dispatch a subagent | Not available - do the work inline in the main session |
| Track a todo list | Not available - use `.lex/wip.md` as the checklist instead |

## Rules-file delivery

Trae reads project rules from `.trae/rules/project_rules.md`. Copy the lex
bootstrap into that path from `templates/platform/trae-rules.md` per the
project README.

## Notes
- No hooks on Trae: continuity is protocol-driven, not automated. Follow the
  step-cadence in `.lex/wip.md` and update it after every significant step.
- No subagents: all work happens inline in the single Builder session.
- No native todo tool: `.lex/wip.md` is the checklist of record.
- Trae supports MCP servers through its MCP settings. The codegraph MCP can be
  added there once configured.
- `.lex/` files are plain markdown, readable and editable with Trae's standard
  file tools.
