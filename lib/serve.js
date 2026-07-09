'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { openDb, refresh, ftsRows } = require('./indexer');

const PAGE_RE = /^[a-z0-9-]+\.md$/;
const REFRESH_MS = 30000;

function readSafe(p) { try { return fs.readFileSync(p, 'utf8'); } catch { return null; } }
function listMd(dir) { try { return fs.readdirSync(dir).filter(f => f.endsWith('.md')).sort(); } catch { return []; } }

function overview(db, root, refreshedAt) {
  const ctx = path.join(root, '.ctx');
  const audit = (readSafe(path.join(ctx, 'audit.log')) || '').trim();
  let version = '';
  try { version = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '.claude-plugin', 'plugin.json'), 'utf8')).version; } catch {}
  return {
    project: path.basename(root),
    version,
    refreshedAt,
    status: readSafe(path.join(ctx, 'status.md')),
    wip: readSafe(path.join(ctx, 'wip.md')),
    pages: listMd(path.join(ctx, 'pages')).filter(f => PAGE_RE.test(f)),
    sessions: listMd(path.join(ctx, 'sessions')).reverse().slice(0, 10),
    audit: audit ? audit.split('\n').slice(-20) : [],
    index: {
      files: db.prepare('SELECT COUNT(*) c FROM files').get().c,
      symbols: db.prepare('SELECT COUNT(*) c FROM symbols').get().c,
      links: db.prepare('SELECT COUNT(*) c FROM links').get().c,
    },
  };
}

function send(res, code, body) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

// stack token (matched against manifest text) -> MCP suggestion
const MCP_MAP = [
  ['"laravel/framework"', 'Laravel', 'laravel-boost plugin (artisan, tinker, docs)'],
  ['"next"', 'Next.js', 'Playwright MCP (E2E) + Vercel MCP (deploys)'],
  ['"react"', 'React', 'shadcn/ui MCP (components) + Playwright MCP (E2E)'],
  ['"tailwindcss"', 'Tailwind', 'shadcn/ui MCP (component search)'],
  ['snowflake', 'Snowflake', 'Snowflake MCP (warehouse queries)'],
  ['"stripe"', 'Stripe', 'Stripe MCP (payments API)'],
  ['stripe/stripe-php', 'Stripe', 'Stripe MCP (payments API)'],
  ['"redis"', 'Redis', 'Redis MCP'],
  ['predis/predis', 'Redis', 'Redis MCP'],
  ['psycopg', 'PostgreSQL', 'Postgres MCP (schema + queries)'],
  ['"pg"', 'PostgreSQL', 'Postgres MCP (schema + queries)'],
  ['mysql', 'MySQL', 'MySQL MCP (schema + queries)'],
  ['sqlite', 'SQLite', 'SQLite MCP (schema + queries)'],
  ['fastapi', 'FastAPI', 'mcp-run-python (sandboxed execution)'],
  ['django', 'Django', 'mcp-run-python (sandboxed execution)'],
  ['flask', 'Flask', 'mcp-run-python (sandboxed execution)'],
  ['supabase', 'Supabase', 'Supabase MCP'],
  ['sentry', 'Sentry', 'Sentry MCP (error triage)'],
  ['inertiajs', 'Inertia.js', 'Playwright MCP (E2E through the SPA layer)'],
];

const MANIFEST_NAMES = new Set(['package.json', 'composer.json', 'requirements.txt', 'pyproject.toml', 'go.mod']);
const MANIFEST_SKIP = new Set(['node_modules', 'vendor', '.git', 'dist', 'build', 'storage']);

// manifests (.json/.txt/.toml) are deliberately not indexed; scan disk two levels deep
function findManifests(root) {
  const found = [];
  let hasDocker = false;
  const scan = (dir, depth) => {
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.isFile()) {
        if (MANIFEST_NAMES.has(e.name)) found.push(path.join(dir, e.name));
        if (e.name === 'Dockerfile' || e.name.startsWith('docker-compose')) hasDocker = true;
      } else if (e.isDirectory() && depth < 2 && !MANIFEST_SKIP.has(e.name) && !e.name.startsWith('.')) {
        scan(path.join(dir, e.name), depth + 1);
      }
    }
  };
  scan(root, 0);
  return { found, hasDocker };
}

// names of MCP servers already configured (project .mcp.json + user ~/.claude.json)
function configuredMcpNames(root) {
  const names = [];
  const collect = (obj) => {
    if (!obj || typeof obj !== 'object') return;
    if (obj.mcpServers) names.push(...Object.keys(obj.mcpServers));
    if (obj.projects) for (const k of Object.keys(obj.projects)) collect(obj.projects[k]);
  };
  for (const p of [path.join(root, '.mcp.json'), path.join(require('node:os').homedir(), '.claude.json')]) {
    try { collect(JSON.parse(readSafe(p) || '')); } catch {}
  }
  return names.map(n => n.toLowerCase());
}

function mcpSuggestions(root) {
  const { found, hasDocker } = findManifests(root);
  let text = '';
  for (const m of found) text += (readSafe(m) || '').toLowerCase() + '\n';
  const rows = [];
  const seen = new Set();
  for (const [token, tech, mcp] of MCP_MAP) {
    if (!seen.has(tech) && text.includes(token.toLowerCase())) {
      seen.add(tech);
      rows.push({ tech, mcp });
    }
  }
  if (hasDocker) rows.push({ tech: 'Docker', mcp: 'Docker MCP (containers, logs)' });
  if (fs.existsSync(path.join(root, '.github', 'workflows'))) {
    rows.push({ tech: 'GitHub Actions', mcp: 'GitHub MCP (PRs, issues, CI runs)' });
  }
  // drop suggestions the user already has connected
  const have = configuredMcpNames(root);
  return rows.filter(r => {
    const hay = (r.tech + ' ' + r.mcp).toLowerCase();
    return !have.some(n => n.length >= 3 && hay.includes(n.replace(/[-_]/g, ' ').split(' ')[0]));
  });
}

function createServer(root) {
  if (!fs.existsSync(path.join(root, '.ctx'))) {
    throw new Error('createServer requires a project root containing a .ctx folder: ' + root);
  }
  const db = openDb(root);
  refresh(db, root);
  let last = Date.now();
  return http.createServer((req, res) => {
    if (!/^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(req.headers.host || '')) {
      return send(res, 403, { error: 'forbidden' });
    }
    const url = new URL(req.url, 'http://localhost');
    try {
      if (url.pathname === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(fs.readFileSync(path.join(__dirname, '..', 'viewer.html'), 'utf8'));
      } else if (url.pathname === '/api/overview') {
        if (Date.now() - last > REFRESH_MS) { refresh(db, root); last = Date.now(); }
        send(res, 200, overview(db, root, last));
      } else if (url.pathname === '/api/page') {
        const name = url.searchParams.get('name') || '';
        if (!PAGE_RE.test(name)) return send(res, 400, { error: 'bad name' });
        const inPages = path.join(root, '.ctx', 'pages', name);
        const text = readSafe(fs.existsSync(inPages) ? inPages : path.join(root, '.ctx', name));
        if (text === null) return send(res, 404, { error: 'not found' });
        send(res, 200, { name, text });
      } else if (url.pathname === '/api/search') {
        const q = (url.searchParams.get('q') || '').trim();
        if (!q) return send(res, 200, { rows: [] });
        refresh(db, root); last = Date.now();
        send(res, 200, { rows: ftsRows(db, q.split(/\s+/), 20, ['[[', ']]']) });
      } else if (url.pathname === '/api/links') {
        send(res, 200, { rows: db.prepare('SELECT side, method, url, path, line FROM links ORDER BY url, side LIMIT 500').all() });
      } else if (url.pathname === '/api/file') {
        const p = url.searchParams.get('path') || '';
        const row = db.prepare('SELECT path FROM files WHERE path = ?').get(p);
        if (!row) return send(res, 404, { error: 'not indexed' });
        const text = readSafe(path.join(root, row.path));
        if (text === null) return send(res, 404, { error: 'not found' });
        send(res, 200, { path: row.path, text });
      } else if (url.pathname === '/api/mcps') {
        send(res, 200, { rows: mcpSuggestions(root) });
      } else if (url.pathname === '/api/ls') {
        const dir = (url.searchParams.get('dir') || '').replace(/\\/g, '/').replace(/\/+$/, '');
        const prefix = dir ? dir + '/' : '';
        const rows = db.prepare("SELECT path FROM files WHERE path LIKE ? || '%' ORDER BY path LIMIT 2000").all(prefix);
        const dirs = new Set();
        const files = [];
        for (const r of rows) {
          const rest = r.path.slice(prefix.length);
          const slash = rest.indexOf('/');
          if (slash === -1) files.push(rest);
          else dirs.add(rest.slice(0, slash));
        }
        send(res, 200, { dirs: [...dirs].sort(), files });
      } else if (url.pathname === '/api/symbols') {
        const p = url.searchParams.get('path') || '';
        send(res, 200, { rows: db.prepare('SELECT line, kind, name FROM symbols WHERE path = ? ORDER BY line LIMIT 200').all(p) });
      } else if (url.pathname === '/api/activity') {
        const text = readSafe(path.join(root, '.ctx', 'live.json'));
        let data = {};
        try { data = text ? JSON.parse(text) : {}; } catch {}
        send(res, 200, data);
      } else if (url.pathname === '/api/schema') {
        const tableRows = db.prepare('SELECT DISTINCT name FROM schema_tables ORDER BY name').all();
        const tables = tableRows.map(t => ({
          name: t.name,
          columns: db.prepare('SELECT name, type, fk_table AS fkTable, fk_column AS fkColumn FROM schema_columns WHERE table_name = ? ORDER BY line').all(t.name),
        }));
        send(res, 200, { tables });
      } else if (url.pathname === '/api/session') {
        const name = url.searchParams.get('name') || '';
        if (!PAGE_RE.test(name)) return send(res, 400, { error: 'bad name' });
        const text = readSafe(path.join(root, '.ctx', 'sessions', name));
        if (text === null) return send(res, 404, { error: 'not found' });
        send(res, 200, { name, text });
      } else {
        send(res, 404, { error: 'not found' });
      }
    } catch {
      send(res, 500, { error: 'server error' });
    }
  });
}

module.exports = { createServer, overview };
