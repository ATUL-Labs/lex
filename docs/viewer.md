# Viewer

```bash
node <lex-repo>/bin/lex.js serve        # http://127.0.0.1:4747 (or next free port)
node <lex-repo>/bin/lex.js serve 3000   # specific port
```

A live mission-control dashboard for your project. Read-only and localhost-bound —
never modifies your project.

## Panels

### Now panel

Real-time project status at a glance:

- **App server status** — green/red dot showing whether your dev server is running. Auto-detects port from multiple sources (see below). Polls every 10 seconds
- **Agent activity banner** — shows the current agent platform (Claude Code, Cursor, Windsurf, etc.) and session start time
- **Task list** — live view of `wip.md` steps and their completion status. Updates as the agent works through tasks
- **Token budget** — shows tokens spent vs. context window limit for the current session

### Codebase panel

Explore your codebase without opening files:

- **File/symbol/link stats** — total indexed files, symbols, and API-to-frontend links
- **Full-text search** — search the entire codebase instantly. Results show file path, line number, and matching line content. Powered by SQLite FTS5 with fuzzy matching
- **MCP suggestions** — if codebase-memory-mcp is connected, shows call-graph suggestions alongside search results

### Graph panel

Visual API-to-frontend dependency mapping:

- **Link graph** — every API route (`/api/users`, `/api/journals`, etc.) shown as a node with edges to every frontend file that consumes it
- **Filter by URL** — type a route path to filter the graph to just that route and its consumers
- **Color-coded by HTTP method** — GET (blue), POST (green), PUT (orange), DELETE (red), PATCH (purple)
- **Dev Loop button** — one click tests all indexed endpoints (see Dev Loop section below)

### Schema panel

Database schema visualization from real migrations:

- **Tables** — every table with columns, types, nullable, defaults
- **Foreign keys** — FK relationships shown as edges in the ERD
- **Fullscreen ERD canvas** — pannable, zoomable canvas showing all tables and their relationships. Click a table to highlight its FK connections
- **Column details** — click any column to see type, nullable status, default value, and auto_increment

### Memory panel

Browse your project's accumulated knowledge:

- **Knowledge pages** — rendered markdown from `.lex/pages/`:
  - `stack.md` — detected tech stack and tooling
  - `run.md` — how to run the app (port, commands, env vars)
  - `mistakes.md` — bugs that were hit and fixed (auto-captured from errors)
  - `patterns.md` — recurring code patterns and conventions
  - `design.md` — design system and UI guidelines
  - `rules.md` — project-specific rules and constraints
- **Session summaries** — past agent sessions with title, date, files touched, and summary. Read what was done and why without scrolling through chat history
- **Activity timeline** — chronological log of every file edit, search, and command from `audit.log`

### API tester

Built into the viewer UI. Test any endpoint without leaving the browser:

1. URL field auto-populates with detected app server URL
2. Pick HTTP method (GET, POST, PUT, PATCH, DELETE)
3. Add headers or request body if needed
4. Send request — get back:
   - **Status code** and response time
   - **Response headers** and body (truncated to 50K for display)
   - **Security findings** categorized by severity:
     - **High** — missing CSP header, SQL error signatures, XSS reflection
     - **Medium** — missing X-Frame-Options, HSTS, X-Content-Type-Options, Referrer-Policy, Permissions-Policy
     - **Low** — framework version leaks (X-Powered-By), debug mode indicators

No need to open Postman or curl — test and secure in one place.

## App server status

The viewer auto-detects your application's port from multiple sources:
1. `.lex/agent.json` `appUrl` field (manual override)
2. `.lex/pages/run.md` (agent-maintained run instructions)
3. `.env` files (`PORT`, `APP_PORT`, etc.)
4. `docker-compose.yml` port mappings
5. Source code scan (common port patterns)

It probes both IPv4 (`127.0.0.1`) and IPv6 (`[::1]`) localhost to handle servers
that bind to only one address family. The status indicator (green/red dot) in the
Now panel updates every 10 seconds.

The `/api/app-url` endpoint returns the resolved URL and live status:
```json
{
  "appUrl": "http://[::1]:8015",
  "viewerUrl": "http://127.0.0.1:4747",
  "appRunning": true
}
```

## API tester

Built into the viewer UI. Enter a URL, pick an HTTP method, and send the request.
The response includes:

- **Status code** and response time
- **Response headers** and body (truncated to 50K for display)
- **Security findings** categorized by severity:
  - **High** — missing CSP header, SQL error signatures, XSS reflection
  - **Medium** — missing X-Frame-Options, HSTS, X-Content-Type-Options, Referrer-Policy, Permissions-Policy
  - **Low** — framework version leaks (X-Powered-By), debug mode indicators

The URL field auto-populates with the detected app URL. No manual port entry needed.

## Dev loop

Click the **Dev Loop** button in the graph panel to test all indexed endpoints.
Results are categorized instead of simple pass/fail:

| Category | Meaning | Icon |
|----------|---------|------|
| `pass` | 200-299 | OK |
| `auth-required` | 302→/login, 401, 403, 419 | AUTH |
| `redirect` | 302 to non-auth URL | REDIR |
| `not-found` | 404 | 404 |
| `method-not-allowed` | 405 | 405 |
| `server-error` | 500+ | ERR |
| `connection-error` | ECONNREFUSED | CONN |

The summary line shows actionable counts:
```
100 endpoints tested: 5 OK, 55 require auth, 38 not found, 2 method not allowed, 2 findings, 0 actionable errors
```

HSTS findings are suppressed on HTTP dev servers (only flagged on HTTPS).

## Console error capture

The viewer automatically intercepts `console.error`, `console.warn`, uncaught errors,
and unhandled promise rejections from any page it serves. For your own dev pages,
inject the capture script:

```html
<script src="http://127.0.0.1:4747/api/error-capture.js"></script>
```

Then `lex errors` or the gateway `errors` command will show all JS errors from any
page that loaded the script — the agent gets a complete picture of frontend runtime
issues without you copy-pasting from devtools.

## Theme and layout

- **Dark/light theme** — moon/sun toggle in the header. Persists in `localStorage`
- **Collapsible panels** — each panel has a collapse button. The **View** dropdown
  in the header hides/shows any panel. Layout reflows automatically. State persists
  in `localStorage`
- **Keyboard shortcuts** — press `/` to focus search, `Esc` to close modals
