'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { openDb, refresh, refreshWithWorkers, ftsRows, shouldRefresh } = require('./indexer');
const { startWatcher } = require('./watcher');
const { startGatewayWatcher } = require('./gateway-watcher');
const { startTaskProcessor } = require('./task-processor');
const consoleErrors = require('./console-errors');
const appErrors = require('./app-errors');
const { queryTableData } = require('./db-connector');

const PAGE_RE = /^[a-z0-9-]+\.md$/;
const REFRESH_MS = 30000;

function readSafe(p) { try { return fs.readFileSync(p, 'utf8'); } catch { return null; } }
function listMd(dir) { try { return fs.readdirSync(dir).filter(f => f.endsWith('.md')).sort(); } catch { return []; } }

function overview(db, root, refreshedAt, indexing) {
  const lex = path.join(root, '.lex');
  const audit = (readSafe(path.join(lex, 'audit.log')) || '').trim();
  let version = '';
  try { version = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '.claude-plugin', 'plugin.json'), 'utf8')).version; } catch {}
  return {
    project: path.basename(root),
    version,
    refreshedAt,
    indexing: !!indexing,
    status: readSafe(path.join(lex, 'status.md')),
    wip: readSafe(path.join(lex, 'wip.md')),
    pages: listMd(path.join(lex, 'pages')).filter(f => PAGE_RE.test(f)),
    sessions: listMd(path.join(lex, 'sessions')).reverse().slice(0, 10),
    audit: audit ? audit.split('\n').slice(-20) : [],
    index: {
      files: db.prepare("SELECT COUNT(*) c FROM files WHERE path NOT LIKE '.lex/%'").get().c,
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

function createServer(root, opts) {
  if (!fs.existsSync(path.join(root, '.lex'))) {
    throw new Error('createServer requires a project root containing a .lex folder: ' + root);
  }
  const db = openDb(root);
  let indexing = false;
  let lastIndex = 0;
  const fileCount = db.prepare('SELECT COUNT(*) as c FROM files').get().c;
  if (fileCount === 0) {
    indexing = true;
    refreshWithWorkers(db, root).then(() => {
      indexing = false;
      lastIndex = Date.now();
    }).catch(() => {
      indexing = false;
      try { refresh(db, root); } catch {}
      lastIndex = Date.now();
    });
  } else {
    refresh(db, root);
    lastIndex = Date.now();
  }
  let watcher = null;
  if (opts && opts.watch) {
    watcher = startWatcher(db, root);
  }
  // Gateway watcher: process .lex/in/ requests on any platform
  const gwWatcher = startGatewayWatcher(root);
  // Task processor: process .lex/tasks/ for async background tasks
  const taskProc = startTaskProcessor(root);
  const server = http.createServer((req, res) => {
    if (!/^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(req.headers.host || '')) {
      return send(res, 403, { error: 'forbidden' });
    }
    const url = new URL(req.url, 'http://localhost');
    try {
      if (url.pathname === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(fs.readFileSync(path.join(__dirname, '..', 'viewer.html'), 'utf8'));
      } else if (url.pathname.startsWith('/public/')) {
        const rel = url.pathname.slice('/public/'.length).replace(/\.\./g, '');
        const filePath = path.join(__dirname, '..', 'public', rel);
        if (!filePath.startsWith(path.join(__dirname, '..', 'public'))) return send(res, 403, { error: 'forbidden' });
        if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) return send(res, 404, { error: 'not found' });
        const ext = path.extname(filePath);
        const types = { '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
        res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
        res.end(fs.readFileSync(filePath));
      } else if (url.pathname === '/api/overview') {
        if (Date.now() - lastIndex > REFRESH_MS && !indexing) { refresh(db, root); lastIndex = Date.now(); }
        send(res, 200, overview(db, root, lastIndex, indexing));
      } else if (url.pathname === '/api/page') {
        const name = url.searchParams.get('name') || '';
        if (!PAGE_RE.test(name)) return send(res, 400, { error: 'bad name' });
        const inPages = path.join(root, '.lex', 'pages', name);
        const text = readSafe(fs.existsSync(inPages) ? inPages : path.join(root, '.lex', name));
        if (text === null) return send(res, 404, { error: 'not found' });
        send(res, 200, { name, text });
      } else if (url.pathname === '/api/search') {
        const q = (url.searchParams.get('q') || '').trim();
        if (!q) return send(res, 200, { rows: [] });
        if (shouldRefresh(db) && !indexing) { refresh(db, root); lastIndex = Date.now(); }
        send(res, 200, { rows: ftsRows(db, q.split(/\s+/), 20, ['[[', ']]'], root) });
      } else if (url.pathname === '/api/cli') {
        const cmd = url.searchParams.get('cmd') || '';
        const arg = url.searchParams.get('arg') || '';
        if (cmd === 'search' && arg) {
          if (shouldRefresh(db) && !indexing) { refresh(db, root); lastIndex = Date.now(); }
          const parts = arg.split('\t');
          const searchTerms = parts[0].split(/\s+/).filter(Boolean);
          const scope = parts[1] || null;
          const rows = ftsRows(db, searchTerms, 10, undefined, root, scope);
          const lines = rows.map(r => `${r.path}:${r.line || 0}: ${r.snip.replace(/\s+/g, ' ')}`);
          if (!rows.length) lines.push('no matches');
          send(res, 200, { output: lines.join('\n') });
        } else if (cmd === 'memory' && arg) {
          const memdb = require('./memory-db');
          memdb.refreshMemoryDb(root);
          const searchTerms = arg.split(/\s+/).filter(Boolean);
          const rows = memdb.searchMemoryDb(root, searchTerms, { limit: 20 });
          const lines = rows.map(r => `${r.source}: ${r.preview.replace(/\s+/g, ' ').trim()}`);
          if (!rows.length) lines.push('no memory matches');
          send(res, 200, { output: lines.join('\n') });
        } else if (cmd === 'recall' && arg) {
          const { recall, formatRecall } = require('./memory');
          const searchTerms = arg.split(/\s+/).filter(Boolean);
          const results = recall(root, searchTerms);
          send(res, 200, { output: formatRecall(results) });
        } else if (cmd === 'proactive') {
          const { proactive, formatProactive } = require('./memory-proactive');
          const files = arg ? arg.split(/\s+/).filter(Boolean) : [];
          const result = proactive(root, { files });
          send(res, 200, { output: formatProactive(result), memories: result.memories.length });
        } else if (cmd === 'symbols' && arg) {
          const rel = arg.replace(/\\/g, '/');
          const rows = db.prepare('SELECT line, kind, name FROM symbols WHERE path = ? ORDER BY line LIMIT 40').all(rel);
          const lines = rows.map(r => `${r.line} ${r.kind} ${r.name}`);
          if (!rows.length) lines.push('no symbols indexed for ' + rel);
          send(res, 200, { output: lines.join('\n') });
        } else if (cmd === 'grep' && arg) {
          const parts = arg.split('\t');
          const pattern = parts[0];
          const fileFilter = parts[1] || null;
          const { grepFiles } = require('./grep');
          const result = grepFiles(root, db, pattern, fileFilter);
          if (result.error) { send(res, 200, { output: result.error }); return; }
          const output = result.matches.length ? result.matches.join('\n') : 'no matches';
          send(res, 200, { output });
        } else if (cmd === 'ping') {
          send(res, 200, { output: 'pong', root });
        } else {
          send(res, 400, { error: 'bad cmd' });
        }
      } else if (url.pathname === '/api/memory') {
        const q = (url.searchParams.get('q') || '').trim();
        if (!q) return send(res, 200, { rows: [] });
        const memdb = require('./memory-db');
        memdb.refreshMemoryDb(root);
        const rows = memdb.searchMemoryDb(root, q.split(/\s+/), { limit: 20 });
        send(res, 200, { rows });
      } else if (url.pathname === '/api/proactive') {
        const file = url.searchParams.get('file') || '';
        const { proactive, formatProactive } = require('./memory-proactive');
        const signals = file ? { files: [file] } : {};
        const result = proactive(root, signals);
        send(res, 200, { output: formatProactive(result), memories: result.memories.length, context: result.context });
      } else if (url.pathname === '/api/memory-stats') {
        const memdb = require('./memory-db');
        memdb.refreshMemoryDb(root);
        send(res, 200, memdb.getStats(root));
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
        const text = readSafe(path.join(root, '.lex', 'live.json'));
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
      } else if (url.pathname === '/api/schema/data') {
        const table = url.searchParams.get('table') || '';
        const page = parseInt(url.searchParams.get('page') || '1', 10);
        if (!table) return send(res, 400, { error: 'table name required' });
        try {
          const result = queryTableData(root, table, page, 10);
          send(res, 200, result);
        } catch (e) {
          send(res, 500, { error: e.message });
        }
      } else if (url.pathname === '/api/session') {
        const name = url.searchParams.get('name') || '';
        if (!PAGE_RE.test(name)) return send(res, 400, { error: 'bad name' });
        const text = readSafe(path.join(root, '.lex', 'sessions', name));
        if (text === null) return send(res, 404, { error: 'not found' });
        send(res, 200, { name, text });
      } else if (url.pathname === '/api/error-capture.js') {
        res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(`(function(){var LEX_PORT=${JSON.stringify(server.address() ? server.address().port : 4747)};var q=[];var s=false;function f(){if(!q.length||s)return;s=true;var b=q.splice(0);fetch('http://127.0.0.1:'+LEX_PORT+'/api/console-errors',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({errors:b})}).then(function(){s=false;f()}).catch(function(){s=false})}function r(t,d){q.push(Object.assign({type:t,url:location.href,ts:Date.now()},d));f()}var oe=console.error;console.error=function(){var a=Array.from(arguments);r('console.error',{message:a.map(function(x){return typeof x==='object'?JSON.stringify(x).substring(0,500):String(x)}).join(' ')});oe.apply(console,a)};var ow=console.warn;console.warn=function(){var a=Array.from(arguments);r('console.warn',{message:a.map(function(x){return typeof x==='object'?JSON.stringify(x).substring(0,500):String(x)}).join(' ')});ow.apply(console,a)};window.addEventListener('error',function(e){r('uncaught',{message:e.message,filename:e.filename,lineno:e.lineno,colno:e.colno,stack:e.error&&e.error.stack?e.error.stack.substring(0,1000):''})});window.addEventListener('unhandledrejection',function(e){r('unhandledrejection',{message:e.reason&&e.reason.message?e.reason.message:String(e.reason),stack:e.reason&&e.reason.stack?e.reason.stack.substring(0,1000):''})})();`);
      } else if (url.pathname === '/api/console-errors' && req.method === 'OPTIONS') {
        res.writeHead(200, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, GET', 'Access-Control-Allow-Headers': 'Content-Type' });
        res.end();
      } else if (url.pathname === '/api/console-errors' && req.method === 'GET') {
        const since = parseInt(url.searchParams.get('since') || '0', 10);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ errors: consoleErrors.getErrors(since) }));
      } else if (url.pathname === '/api/console-errors' && req.method === 'POST') {
        let body = '';
        req.on('data', (d) => body += d);
        req.on('end', () => {
          try {
            const data = JSON.parse(body);
            if (data.errors && Array.isArray(data.errors)) {
              for (const e of data.errors) consoleErrors.addError(e);
              res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
              res.end(JSON.stringify({ ok: true, count: data.errors.length }));
            } else if (data.message) {
              consoleErrors.addError(data);
              res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
              res.end(JSON.stringify({ ok: true }));
            } else {
              res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
              res.end(JSON.stringify({ error: 'bad body' }));
            }
          } catch {
            res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify({ error: 'bad json' }));
          }
        });
      } else if (url.pathname === '/api/console-errors/clear' && req.method === 'POST') {
        consoleErrors.clearErrors();
        send(res, 200, { ok: true });
      } else if (url.pathname === '/api/app-errors' && req.method === 'GET') {
        send(res, 200, { errors: appErrors.getErrors() });
      } else if (url.pathname === '/api/app-errors' && req.method === 'POST') {
        let body = '';
        req.on('data', (d) => body += d);
        req.on('end', () => {
          try {
            const data = JSON.parse(body);
            if (data.errors && Array.isArray(data.errors)) {
              for (const e of data.errors) appErrors.addError(e);
              send(res, 200, { ok: true, count: data.errors.length });
            } else if (data.message) {
              appErrors.addError(data);
              send(res, 200, { ok: true });
            } else { send(res, 400, { error: 'bad body' }); }
          } catch { send(res, 400, { error: 'bad json' }); }
        });
      } else if (url.pathname === '/api/app-errors/clear' && req.method === 'POST') {
        appErrors.clearErrors();
        send(res, 200, { ok: true });
      } else if (url.pathname === '/api/test' && req.method === 'POST') {
        let body = '';
        req.on('data', (d) => body += d);
        req.on('end', () => {
          try {
            const opts = JSON.parse(body);
            if (!opts.url) { send(res, 400, { error: 'url is required' }); return; }
            const { sendRequest } = require('./api-tester');
            sendRequest(opts).then(result => {
              send(res, 200, result);
            }).catch(err => {
              send(res, 502, { error: err.message });
            });
          } catch (e) {
            send(res, 400, { error: 'bad json: ' + e.message });
          }
        });
      } else if (url.pathname === '/api/test/xss' && req.method === 'POST') {
        let body = '';
        req.on('data', (d) => body += d);
        req.on('end', () => {
          try {
            const opts = JSON.parse(body);
            if (!opts.url) { send(res, 400, { error: 'url is required' }); return; }
            const { runXssTests } = require('./api-tester');
            runXssTests(opts.url, opts.method || 'GET', opts.param).then(result => {
              send(res, 200, result);
            }).catch(err => {
              send(res, 502, { error: err.message });
            });
          } catch (e) {
            send(res, 400, { error: 'bad json: ' + e.message });
          }
        });
      } else if (url.pathname === '/api/gateway' && req.method === 'POST') {
        let body = '';
        req.on('data', (d) => body += d);
        req.on('end', () => {
          try {
            const request = JSON.parse(body);
            if (!request.cmd) { send(res, 400, { ok: false, error: 'missing "cmd" field' }); return; }
            if (request.cmd === 'test') {
              const { sendRequest, runXssTests } = require('./api-tester');
              const argObj = Array.isArray(request.args) ? request.args[0] : request.args;
              if (!argObj || !argObj.url) { send(res, 400, { ok: false, error: 'test requires {url}' }); return; }
              if (argObj.mode === 'xss') {
                runXssTests(argObj.url, argObj.method || 'GET', argObj.param).then(result => {
                  send(res, 200, { ok: true, output: result.summary, result });
                }).catch(err => send(res, 502, { ok: false, error: err.message }));
              } else {
                sendRequest(argObj).then(result => {
                  const lines = [result.status + ' ' + (result.statusText || '') + ' (' + result.responseTime + 'ms)'];
                  if (result.findings && result.findings.length) {
                    lines.push('Security findings (' + result.findings.length + '):');
                    for (const f of result.findings) lines.push('  [' + f.severity + '] ' + f.type + ': ' + f.message);
                  } else if (result.findings) lines.push('Security findings: none');
                  lines.push('Body (' + (result.bodyTruncated ? 'truncated, ' : '') + result.body.length + ' chars):');
                  lines.push(result.body.substring(0, 2000));
                  send(res, 200, { ok: true, output: lines.join('\n'), result });
                }).catch(err => send(res, 502, { ok: false, error: err.message }));
              }
              return;
            }
            if (request.cmd === 'devloop') {
              const { runDevLoop, formatReport, detectAppUrl, detectBaseUrl, resolveAppUrl } = require('./dev-loop');
              const argObj = Array.isArray(request.args) ? (typeof request.args[0] === 'string' ? { file: request.args[0] } : request.args[0]) : (typeof request.args === 'string' ? { file: request.args } : request.args);
              if (argObj && argObj.baseUrl) {
                runDevLoop(db, root, { ...(argObj || {}), baseUrl: argObj.baseUrl }).then(report => {
                  send(res, 200, { ok: true, output: formatReport(report), report });
                }).catch(err => send(res, 500, { ok: false, error: err.message }));
              } else {
                resolveAppUrl(root).then(function(resolvedUrl) {
                  const baseUrl = resolvedUrl || detectAppUrl(root) || detectBaseUrl(root);
                  runDevLoop(db, root, { ...(argObj || {}), baseUrl }).then(report => {
                    send(res, 200, { ok: true, output: formatReport(report), report });
                  }).catch(err => send(res, 500, { ok: false, error: err.message }));
                });
              }
              return;
            }
            const gateway = require('./gateway');
            const result = gateway.processRequest(root, request);
            send(res, 200, result);
          } catch (e) {
            send(res, 500, { ok: false, error: e.message });
          }
        });
      } else if (url.pathname === '/api/app-url' && req.method === 'GET') {
        const { detectAppUrl, detectBaseUrl, checkServerAlive, resolveAppUrl } = require('./dev-loop');
        const fallbackUrl = detectAppUrl(root) || detectBaseUrl(root);
        resolveAppUrl(root).then(function(resolvedUrl) {
          const appUrl = resolvedUrl || fallbackUrl;
          checkServerAlive(appUrl).then(function(alive) {
            send(res, 200, { appUrl, viewerUrl: `http://127.0.0.1:${server.address().port}`, appRunning: alive });
          });
        });
      } else if (url.pathname === '/api/devloop' && req.method === 'POST') {
        let body = '';
        req.on('data', (d) => body += d);
        req.on('end', () => {
          try {
            const opts = JSON.parse(body);
            const { runDevLoop, detectAppUrl, detectBaseUrl, resolveAppUrl } = require('./dev-loop');
            if (opts.baseUrl) {
              runDevLoop(db, root, { ...opts }).then(report => {
                send(res, 200, report);
              }).catch(err => {
                send(res, 500, { ok: false, error: err.message });
              });
            } else {
              resolveAppUrl(root).then(function(resolvedUrl) {
                const baseUrl = resolvedUrl || detectAppUrl(root) || detectBaseUrl(root);
                runDevLoop(db, root, { ...opts, baseUrl }).then(report => {
                  send(res, 200, report);
                }).catch(err => {
                  send(res, 500, { ok: false, error: err.message });
                });
              });
            }
          } catch (e) {
            send(res, 400, { error: 'bad json: ' + e.message });
          }
        });
      } else {
        send(res, 404, { error: 'not found' });
      }
    } catch {
      send(res, 500, { error: 'server error' });
    }
  });
  server._watcher = watcher;
  server._gwWatcher = gwWatcher;
  server._taskProc = taskProc;
  server._db = db;
  return server;
}

module.exports = { createServer, overview };
