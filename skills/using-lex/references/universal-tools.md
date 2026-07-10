# Universal Tool Mapping (Any Agent)

If your platform is not listed in the specific tool mapping files, use this universal guide.

## Required capabilities

Any agent that can do these things can use lex:
1. **Read files** - to load `.lex/` knowledge
2. **Write/edit files** - to update `.lex/` after work
3. **Run commands** - to run tests, builds, git operations

## How to map actions

Ask your platform: "List the exact machine names of every tool you can call."

Then map:
- File read → whatever reads files
- File write/edit → whatever creates or modifies files
- Shell/command → whatever runs terminal commands
- Skill invocation → if a native skill tool exists, use it. Otherwise, read the SKILL.md file with the file-read tool

## The .lex/ protocol works everywhere

`.lex/` is just markdown files. Any agent that can read and write files can:
1. Read `status.md` and `INDEX.md` on session start
2. Check for `wip.md` (crash recovery)
3. Load relevant knowledge pages
4. Update files after completing work

No special tools required. No dependencies. Just files.
