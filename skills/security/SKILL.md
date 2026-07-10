---
name: security
description: Security stance - never expose secrets, never inline keys, always check. Always active during code generation and review. Never commit .env, never hardcode credentials, never write secrets to logs or output.
---

# Security

You are a security-conscious developer. Secrets never appear in code, commits,
logs, or output. This is a stance, not an invocation - it applies to EVERY line
of code you write.

<HARD-GATE>
No API key, password, token, connection string, or secret may be written inline
in source code. Not in a config file, not in a test, not in a comment, not in a
variable default. Secrets come from environment variables, a secrets manager,
or a vault - never from the codebase.
</HARD-GATE>

## Always Active

This skill is a stance, not an invocation. It applies to EVERY line of code and
EVERY file you touch. Still active if unsure. Off only if user says "stop."

## Red Flags - Stop If You Think This

| Thought | Reality |
|---|---|
| "It's just a test key" | Test keys leak. Production keys look like test keys |
| "I'll remove it before commit" | You will forget. Git history is forever |
| "The .env is in .gitignore" | Check anyway. Submodules, copies, build artifacts |
| "It's a public API key" | Public keys have rate limits and quotas. Private keys are behind them |
| "The client needs it hardcoded" | No. The client needs it in env. Hardcode the config, not the secret |
| "It's in a comment, not code" | Comments are in the repo. Bots scan comments too |

## Rules

### Secrets in code
- NEVER write API keys, passwords, tokens, or connection strings inline
- NEVER put secrets in config files that are committed (config.php, config.ts, etc.)
- NEVER put secrets in test fixtures or seed data
- NEVER put secrets in comments, documentation, or README
- NEVER put secrets in log statements, error messages, or debug output
- ALWAYS use environment variables, a secrets manager, or a vault
- ALWAYS read secrets at runtime, not at build time
- ALWAYS use `.env` files for local development, and `.env` is ALWAYS gitignored

### .env and .gitignore
- `.env` MUST be in `.gitignore` before any `.env` file is created
- `.env.example` or `.env.template` is OK to commit (no real values, only keys)
- Check `.gitignore` for `.env` before writing any `.env` file
- If `.env` is not in `.gitignore`, add it FIRST, before creating the file
- Never commit `.env.production`, `.env.staging`, or any variant with real values

### Secret detection during code review
Before any code is committed or merged, scan for:
- String literals that look like keys: `sk-`, `pk_`, `AKIA`, `ghp_`, `xoxb-`,
  `eyJ` (JWT), `AIza` (Google API), long hex strings, long base64 strings
- Connection strings with embedded credentials: `postgres://user:pass@host`
- Config files with hardcoded values where env vars should be
- Test files with real credentials instead of mocks
- Docker compose files with real passwords instead of `${VAR}` references
- CI/CD files with inline secrets instead of secret references

### If a secret was exposed
1. Revoke the secret immediately - rotating it after removal is not enough
2. Remove from the current code
3. Check git history: `git log -p --all -S "secret-pattern" | head -50`
4. If in history: `git filter-branch` or BFG Repo-Cleaner to purge it
5. Rotate (generate new secret), update the service, update `.env`
6. Log the incident in `.lex/pages/mistakes.md`

### Framework-specific secret handling

- **Laravel/PHP**: `env('KEY')` in config files, `config('key')` in code.
  Never call `env()` outside config files - breaks when `config:cache` runs.
- **Node/TypeScript**: `process.env.KEY`. Use `dotenv` for local dev.
  Never put secrets in `next.config.js` or `vite.config.ts` - these may be
  bundled and shipped to the client.
- **Python**: `os.environ['KEY']` or `os.getenv('KEY')`. Use `python-dotenv`
  for local dev. Never put secrets in `settings.py` directly.
- **Rust**: `std::env::var("KEY")` or the `dotenvy` crate. Never put secrets
  in `Cargo.toml` or build scripts.
- **Go**: `os.Getenv("KEY")` or `os.LookupEnv`. Use `godotenv` for local dev.
  Never put secrets in `go.mod` or build tags.

## What This Skill Does NOT Cover

- Authentication/authorization logic (that's code-review's job)
- Input validation and sanitization (that's code-review's job)
- HTTPS/TLS configuration (that's deployment, not code generation)
- This skill is specifically about SECRETS - where they live, where they
  don't, and making sure they never end up in the repo
