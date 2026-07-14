#!/usr/bin/env node
'use strict';
process.removeAllListeners('warning');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { openDb, openDbAt, refresh, refreshDocs, updateFile, ftsRows, walk, loadIgnorePrefixes, loadAgentConfig, shouldRefresh, markRefreshed } = require('../lib/indexer');
const { normalizeUrl } = require('../lib/extract');
const tokensLib = require('../lib/tokens');
const http = require('node:http');

function tryServer(cmd, arg, expectedRoot) {
  return new Promise((resolve) => {
    let ports = [4747, 4748, 4749, 4750, 4751, 4752, 4753, 4754, 4755];
    // Try stored port first
    try {
      const info = JSON.parse(fs.readFileSync(path.join(expectedRoot, '.lex', 'server.json'), 'utf8'));
      if (info.port) ports = [info.port, ...ports.filter(p => p !== info.port)];
    } catch {}
    let idx = 0;
    const tryNext = () => {
      if (idx >= ports.length) { resolve(null); return; }
      const port = ports[idx++];
      const req = http.get({
        hostname: '127.0.0.1',
        port,
        path: '/api/cli?cmd=ping&arg=',
        timeout: 100,
      }, (res) => {
        let body = '';
        res.on('data', (d) => body += d);
        res.on('end', () => {
          try {
            const ping = JSON.parse(body);
            if (ping.output === 'pong' && ping.root && expectedRoot &&
                path.resolve(ping.root) === path.resolve(expectedRoot)) {
              const req2 = http.get({
                hostname: '127.0.0.1',
                port,
                path: '/api/cli?cmd=' + encodeURIComponent(cmd) + '&arg=' + encodeURIComponent(arg),
                timeout: 500,
              }, (res2) => {
                let body2 = '';
                res2.on('data', (d) => body2 += d);
                res2.on('end', () => {
                  try {
                    const json = JSON.parse(body2);
                    if (json.output !== undefined) resolve(json.output);
                    else resolve(null);
                  } catch { resolve(null); }
                });
              });
              req2.on('error', () => resolve(null));
              req2.on('timeout', () => { req2.destroy(); resolve(null); });
            } else {
              tryNext();
            }
          } catch { tryNext(); }
        });
      });
      req.on('error', () => tryNext());
      req.on('timeout', () => { req.destroy(); tryNext(); });
    };
    tryNext();
  });
}

function serveWithPortFallback(server, port, maxPort, root) {
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE' && port < maxPort) {
      port += 1;
      server.listen(port, '127.0.0.1');
    } else {
      process.stderr.write('lex serve: ' + err.message + '\n');
      process.exit(1);
    }
  });
  server.listen(port, '127.0.0.1', () => {
    process.stdout.write('lex viewer: http://127.0.0.1:' + port + '\n');
    if (root) {
      try { fs.writeFileSync(path.join(root, '.lex', 'server.json'), JSON.stringify({ port, root, pid: process.pid, started: Date.now() })); } catch {}
    }
  });
  const cleanup = () => { if (root) { try { fs.unlinkSync(path.join(root, '.lex', 'server.json')); } catch {} } server.close(); if (server._watcher) server._watcher.close(); process.exit(0); };
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
}

function findRoot(from) {
  let dir = from;
  for (;;) {
    if (fs.existsSync(path.join(dir, '.lex'))) return dir;
    const up = path.dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}

function isGlobalInstall(pluginRoot) {
  const normalized = pluginRoot.replace(/\\/g, '/').toLowerCase();
  return normalized.includes('/node_modules/@atul-labs/lex') ||
         normalized.includes('/appdata/roaming/npm/node_modules/@atul-labs/lex') ||
         normalized.includes('/usr/local/lib/node_modules/@atul-labs/lex') ||
         normalized.includes('/usr/lib/node_modules/@atul-labs/lex');
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else if (entry.isFile()) fs.copyFileSync(s, d);
  }
}

function countFiles(dir) {
  let n = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) n += countFiles(p);
    else n++;
  }
  return n;
}

const SECRET_PATTERNS = [
  { re: /sk-[a-zA-Z0-9]{20,}/, name: 'OpenAI API key' },
  { re: /pk_[a-zA-Z0-9]{20,}/, name: 'Stripe public key' },
  { re: /sk_[a-zA-Z0-9]{20,}/, name: 'Stripe secret key' },
  { re: /AKIA[0-9A-Z]{16}/, name: 'AWS access key' },
  { re: /ghp_[a-zA-Z0-9]{36}/, name: 'GitHub personal access token' },
  { re: /gho_[a-zA-Z0-9]{36}/, name: 'GitHub OAuth token' },
  { re: /xox[baprs]-[a-zA-Z0-9-]+/, name: 'Slack token' },
  { re: /AIza[0-9A-Za-z\-_]{35}/, name: 'Google API key' },
  { re: /eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/, name: 'JWT token' },
  { re: /postgres:\/\/[^:\s]+:[^@\s]+@/, name: 'Postgres connection string with credentials' },
  { re: /mysql:\/\/[^:\s]+:[^@\s]+@/, name: 'MySQL connection string with credentials' },
  { re: /mongodb(\+srv)?:\/\/[^:\s]+:[^@\s]+@/, name: 'MongoDB connection string with credentials' },
  { re: /redis:\/\/[^:\s]+:[^@\s]+@/, name: 'Redis connection string with credentials' },
];

const INLINE_SECRET_PATTERNS = [
  { re: /(?:password|passwd|pwd)\s*[:=]\s*['"][^'"\s]{4,}['"]/i, name: 'Hardcoded password' },
  { re: /(?:api_key|apikey|api-key)\s*[:=]\s*['"][^'"\s]{10,}['"]/i, name: 'Hardcoded API key' },
  { re: /(?:secret|token)\s*[:=]\s*['"][^'"\s]{10,}['"]/i, name: 'Hardcoded secret/token' },
  { re: /(?:private_key|privatekey)\s*[:=]\s*['"][^'"\s]{20,}['"]/i, name: 'Hardcoded private key' },
];

const DB_ANTI_PATTERNS = [
  { re: /create_table\s+['"](\w+_profiles?)['"]|Schema::create\s*\(\s*['"](\w+_profiles?)['"]/, name: '1-to-1 profile table - merge into parent table instead' },
  { re: /create_table\s+['"](\w+_settings?)['"]|Schema::create\s*\(\s*['"](\w+_settings?)['"]/, name: 'Settings table - use a JSON column on the parent table instead' },
  { re: /['"](?:key|name|attribute)['"]\s*,\s*['"](?:value|val)['"]/, name: 'EAV pattern detected - use JSON/JSONB column instead' },
];

const SCAN_EXTS = new Set(['.js', '.ts', '.jsx', '.tsx', '.py', '.rb', '.php', '.go', '.rs', '.java', '.kt', '.swift', '.c', '.cpp', '.h', '.cs', '.vue', '.svelte', '.json', '.yml', '.yaml', '.env', '.sh', '.bash', '.ps1', '.sql', '.toml', '.cfg', '.conf', '.ini', '.xml']);
const SCAN_SKIP = new Set(['node_modules', 'vendor', '.git', 'dist', 'build', 'storage', '.lex', '.superpowers', '__pycache__', '.next', '.nuxt', 'target', 'deps', '_build']);

function walkFiles(dir, out) {
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (e.isDirectory()) {
      if (!SCAN_SKIP.has(e.name) && !e.name.startsWith('.')) walkFiles(path.join(dir, e.name), out);
    } else if (e.isFile()) {
      const ext = path.extname(e.name);
      if (SCAN_EXTS.has(ext) || e.name === '.env' || e.name.startsWith('.env.')) {
        out.push(path.join(dir, e.name));
      }
    }
  }
}

function guardCmd(root) {
  const findings = [];
  const files = [];
  walkFiles(root, files);

  for (const file of files) {
    const rel = path.relative(root, file).split(path.sep).join('/');
    let content = '';
    try { content = fs.readFileSync(file, 'utf8'); } catch { continue; }
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const { re, name } of SECRET_PATTERNS) {
        if (re.test(line)) {
          findings.push({ severity: 'CRITICAL', file: rel, line: i + 1, rule: name, snippet: line.trim().substring(0, 80) });
        }
      }
      for (const { re, name } of INLINE_SECRET_PATTERNS) {
        if (re.test(line)) {
          const isEnv = rel.endsWith('.env') || rel.endsWith('.env.example') || rel.endsWith('.env.template');
          if (!isEnv) {
            findings.push({ severity: 'CRITICAL', file: rel, line: i + 1, rule: name, snippet: line.trim().substring(0, 80) });
          }
        }
      }
      for (const { re, name } of DB_ANTI_PATTERNS) {
        if (re.test(line)) {
          findings.push({ severity: 'IMPORTANT', file: rel, line: i + 1, rule: name, snippet: line.trim().substring(0, 80) });
        }
      }
    }
  }

  if (fs.existsSync(path.join(root, '.env'))) {
    let gi = '';
    try { gi = fs.readFileSync(path.join(root, '.gitignore'), 'utf8'); } catch {}
    if (!/^\.env$/m.test(gi)) {
      findings.push({ severity: 'CRITICAL', file: '.env', line: 0, rule: '.env file exists but is not in .gitignore', snippet: 'add .env to .gitignore immediately' });
    }
  }

  if (!findings.length) {
    process.stdout.write('lex guard: no violations found - codebase is clean\n');
    return;
  }

  const critical = findings.filter(f => f.severity === 'CRITICAL');
  const important = findings.filter(f => f.severity === 'IMPORTANT');

  if (critical.length) {
    process.stdout.write(`\nCRITICAL (${critical.length}) - secrets exposed in code:\n`);
    for (const f of critical) {
      process.stdout.write(`  ${f.file}:${f.line} - ${f.rule}\n    ${f.snippet}\n`);
    }
  }

  if (important.length) {
    process.stdout.write(`\nIMPORTANT (${important.length}) - database anti-patterns:\n`);
    for (const f of important) {
      process.stdout.write(`  ${f.file}:${f.line} - ${f.rule}\n    ${f.snippet}\n`);
    }
  }

  process.stdout.write(`\nlex guard: ${findings.length} violation(s) found\n`);
  if (critical.length) process.exit(1);
}

function docsCmd(args) {
  const docsDir = process.env.LEX_DOCS_DIR || path.join(os.homedir(), '.lex', 'docs');
  const dbFile = process.env.LEX_DOCS_DB || path.join(os.homedir(), '.lex', 'docs.db');
  if (!fs.existsSync(docsDir)) {
    process.stdout.write('no docs cache yet - distilled sheets live in ' + docsDir + '\n');
    return;
  }
  const db = openDbAt(dbFile);
  refreshDocs(db, docsDir);
  if (!args.length) {
    const rows = db.prepare('SELECT path FROM files ORDER BY path LIMIT 40').all();
    for (const r of rows) process.stdout.write(r.path + '\n');
    if (!rows.length) process.stdout.write('cache is empty - no sheets distilled yet\n');
    return;
  }
  const rows = ftsRows(db, args, 10);
  for (const r of rows) process.stdout.write(`${r.path}: ${r.snip.replace(/\s+/g, ' ')}\n`);
  if (!rows.length) process.stdout.write('no matches\n');
}

function statusCmd(root, db) {
  const lex = path.join(root, '.lex');
  const status = (() => { try { return fs.readFileSync(path.join(lex, 'status.md'), 'utf8'); } catch { return null; } })();
  const wip = (() => { try { return fs.readFileSync(path.join(lex, 'wip.md'), 'utf8'); } catch { return null; } })();
  const files = db.prepare("SELECT COUNT(*) c FROM files WHERE path NOT LIKE '.lex/%'").get().c;
  const symbols = db.prepare('SELECT COUNT(*) c FROM symbols').get().c;
  const links = db.prepare('SELECT COUNT(*) c FROM links').get().c;

  process.stdout.write('project: ' + path.basename(root) + '\n');
  process.stdout.write('files: ' + files + ' indexed, ' + symbols + ' symbols, ' + links + ' links\n');

  if (wip) {
    const firstLines = wip.split('\n').filter(l => l.trim());
    const taskLine = firstLines.find(l => l.toLowerCase().startsWith('task:'));
    const startedLine = firstLines.find(l => l.toLowerCase().startsWith('started:'));
    process.stdout.write('wip: yes' + (taskLine ? ' - ' + taskLine.replace(/^task:\s*/i, '') : '') + (startedLine ? ' (' + startedLine.replace(/^started:\s*/i, '') + ')' : '') + '\n');
  } else {
    process.stdout.write('wip: no\n');
  }

  if (status) {
    const phase = status.split('\n').find(l => l.toLowerCase().startsWith('phase:'));
    if (phase) process.stdout.write('phase: ' + phase.replace(/^phase:\s*/i, '') + '\n');
  }

  const sessionsDir = path.join(lex, 'sessions');
  let sessions = [];
  try { sessions = fs.readdirSync(sessionsDir).filter(f => f.endsWith('.md')).sort().reverse(); } catch {}
  if (sessions.length) process.stdout.write('last session: ' + sessions[0].replace(/\.md$/, '') + '\n');
  else process.stdout.write('last session: none\n');

  const audit = (() => { try { return fs.readFileSync(path.join(lex, 'audit.log'), 'utf8').trim().split('\n'); } catch { return []; } })();
  if (audit.length) {
    const last = audit[audit.length - 1];
    process.stdout.write('last audit: ' + last + '\n');
  }
}

function diffCmd(root, db) {
  const indexedFiles = db.prepare('SELECT path, mtime_ms, size FROM files').all();
  const indexedMap = new Map();
  for (const f of indexedFiles) indexedMap.set(f.path, f);

  const onDisk = new Set();
  const diskFiles = walk(root);
  const modified = [];
  const added = [];
  const deleted = [];

  for (const rel of diskFiles) {
    onDisk.add(rel);
    let st;
    try { st = fs.statSync(path.join(root, rel)); } catch { continue; }
    const row = indexedMap.get(rel);
    if (!row) {
      added.push(rel);
    } else if (row.mtime_ms !== Math.trunc(st.mtimeMs) || row.size !== st.size) {
      modified.push(rel);
    }
  }

  for (const f of indexedFiles) {
    if (!onDisk.has(f.path) && !f.path.startsWith('.lex/')) deleted.push(f.path);
  }

  for (const f of modified) process.stdout.write('M  ' + f + '\n');
  for (const f of added) process.stdout.write('A  ' + f + '\n');
  for (const f of deleted) process.stdout.write('D  ' + f + '\n');

  if (!modified.length && !added.length && !deleted.length) {
    process.stdout.write('no changes - index is in sync\n');
  } else {
    process.stdout.write('\n' + modified.length + ' modified, ' + added.length + ' added, ' + deleted.length + ' deleted\n');
  }
}

function refsCmd(db, root, symbol) {
  const rows = db.prepare('SELECT path, name, kind, line FROM symbols WHERE name = ? ORDER BY path LIMIT 50').all(symbol);
  if (rows.length) {
    process.stdout.write('definitions:\n');
    for (const r of rows) process.stdout.write('  ' + r.path + ':' + r.line + ' ' + r.kind + ' ' + r.name + '\n');
  }

  const ftsRows = db.prepare("SELECT path, snippet(content_fts, 1, '[[', ']]', '...', 6) AS snip FROM content_fts WHERE content_fts MATCH ? ORDER BY rank LIMIT 30").all('"' + symbol.replace(/"/g, '') + '"');
  const refMap = new Map();
  for (const r of ftsRows) {
    if (refMap.has(r.path)) continue;
    refMap.set(r.path, r.snip);
  }

  const defPaths = new Set(rows.map(r => r.path));
  const refs = [...refMap.entries()].filter(([p]) => !defPaths.has(p));
  if (refs.length) {
    process.stdout.write('\nreferences:\n');
    for (const [p, snip] of refs) process.stdout.write('  ' + p + ': ' + snip.replace(/\s+/g, ' ') + '\n');
  }

  if (!rows.length && !refs.length) {
    process.stdout.write('no references found for ' + symbol + '\n');
  }
}

function tokensCmd(root) {
  const s = tokensLib.summarize(root);

  process.stdout.write('session token estimate\n');
  process.stdout.write('=======================\n');
  if (s.session_start) process.stdout.write('started: ' + s.session_start + '\n');
  process.stdout.write('entries: ' + s.total_entries + '\n\n');

  process.stdout.write('SENT (input to LLM):\n');
  const inj = s.by_type.injection;
  const reads = s.by_type.read;
  const cmds = s.by_type.command;
  const srch = s.by_type.search;
  if (inj) process.stdout.write('  hook injections:  ' + inj.count + 'x, ~' + inj.tokens + ' tokens (' + inj.bytes + ' bytes)\n');
  if (reads) process.stdout.write('  files read:       ' + reads.count + 'x, ~' + reads.tokens + ' tokens (' + reads.bytes + ' bytes)\n');
  if (cmds) process.stdout.write('  command outputs:  ' + cmds.count + 'x, ~' + cmds.tokens + ' tokens (' + cmds.bytes + ' bytes)\n');
  if (srch) process.stdout.write('  search results:   ' + srch.count + 'x, ~' + srch.tokens + ' tokens (' + srch.bytes + ' bytes)\n');
  process.stdout.write('  ----\n');
  process.stdout.write('  input subtotal:   ~' + s.input_tokens + ' tokens\n\n');

  process.stdout.write('RECEIVED (agent output):\n');
  const writes = s.by_type.write;
  if (writes) process.stdout.write('  files written:    ' + writes.count + 'x, ~' + writes.tokens + ' tokens (' + writes.bytes + ' bytes)\n');
  process.stdout.write('  ----\n');
  process.stdout.write('  output subtotal:  ~' + s.output_tokens + ' tokens\n\n');

  process.stdout.write('TOTAL tracked:     ~' + s.total_tokens + ' tokens (' + Math.round(s.total_bytes / 1024) + ' KB)\n');

  const BUDGETS = [128000, 200000, 1000000];
  for (const budget of BUDGETS) {
    const pct = (s.input_tokens / budget * 100);
    if (pct > 0.1) {
      const remaining = budget - s.input_tokens;
      const bar = '[' + '#'.repeat(Math.min(20, Math.floor(pct / 5))) + '.'.repeat(Math.max(0, 20 - Math.floor(pct / 5))) + ']';
      process.stdout.write('\ncontext budget (~' + (budget / 1000) + 'K window): ' + bar + ' ' + pct.toFixed(1) + '% used, ~' + remaining + ' tokens left');
      if (pct > 80) process.stdout.write('  *** WARN: approaching limit - wrap up soon ***');
      process.stdout.write('\n');
    }
  }

  if (s.files_read.length) {
    process.stdout.write('\nfiles read (' + s.files_read.length + '):\n');
    for (const f of s.files_read.slice(0, 15)) process.stdout.write('  ' + f + '\n');
    if (s.files_read.length > 15) process.stdout.write('  ... and ' + (s.files_read.length - 15) + ' more\n');
  }
  if (s.files_written.length) {
    process.stdout.write('\nfiles written (' + s.files_written.length + '):\n');
    for (const f of s.files_written.slice(0, 15)) process.stdout.write('  ' + f + '\n');
    if (s.files_written.length > 15) process.stdout.write('  ... and ' + (s.files_written.length - 15) + ' more\n');
  }
  if (s.commands.length) {
    process.stdout.write('\ncommands run (' + s.commands.length + '):\n');
    for (const c of s.commands.slice(0, 10)) process.stdout.write('  ' + c + '\n');
    if (s.commands.length > 10) process.stdout.write('  ... and ' + (s.commands.length - 10) + ' more\n');
  }
  if (s.searches.length) {
    process.stdout.write('\nsearches (' + s.searches.length + '):\n');
    for (const q of s.searches.slice(0, 10)) process.stdout.write('  ' + q + '\n');
  }

  process.stdout.write('\nnote: estimates use ~4 chars/token. Actual API tokens may differ.\n');
  process.stdout.write('untracked: user messages, agent text responses, system prompt.\n');
}

function checkCmd(root, db) {
  const config = loadAgentConfig(root);
  const failures = [];
  const warnings = [];
  const lex = path.join(root, '.lex');

  if (config.require_wip) {
    if (!fs.existsSync(path.join(lex, 'wip.md'))) {
      failures.push('no .lex/wip.md found - create one before starting work');
    }
  }

  if (!fs.existsSync(path.join(lex, 'status.md'))) {
    warnings.push('no .lex/status.md found - project state unknown');
  }

  const indexedFiles = db.prepare('SELECT COUNT(*) c FROM files WHERE path NOT LIKE \'.lex/%\'').get().c;
  if (indexedFiles === 0) {
    warnings.push('index is empty - run \'lex refresh\' to index the project');
  }

  const diskFiles = walk(root);
  const indexedMap = new Map();
  for (const f of db.prepare('SELECT path, mtime_ms, size FROM files').all()) indexedMap.set(f.path, f);
  let stale = 0;
  for (const rel of diskFiles) {
    let st;
    try { st = fs.statSync(path.join(root, rel)); } catch { continue; }
    const row = indexedMap.get(rel);
    if (!row || row.mtime_ms !== Math.trunc(st.mtimeMs) || row.size !== st.size) stale++;
  }
  if (stale > 0) {
    warnings.push(stale + ' file(s) changed since last index - run \'lex refresh\'');
  }

  if (fs.existsSync(path.join(root, '.env'))) {
    let gi = '';
    try { gi = fs.readFileSync(path.join(root, '.gitignore'), 'utf8'); } catch {}
    if (!/^\.env$/m.test(gi)) {
      failures.push('.env exists but is not in .gitignore - add it immediately');
    }
  }

  if (failures.length) {
    process.stdout.write('FAIL:\n');
    for (const f of failures) process.stdout.write('  ' + f + '\n');
  }
  if (warnings.length) {
    process.stdout.write('WARN:\n');
    for (const w of warnings) process.stdout.write('  ' + w + '\n');
  }
  if (!failures.length && !warnings.length) {
    process.stdout.write('OK: all checks passed - ready to work\n');
  }
  if (failures.length) process.exit(1);
}

function recentCmd(root, limit) {
  const auditPath = path.join(root, '.lex', 'audit.log');
  let lines = [];
  try { lines = fs.readFileSync(auditPath, 'utf8').trim().split('\n'); } catch {}
  if (!lines.length || !lines[0]) {
    process.stdout.write('no recent activity - audit.log is empty\n');
    return;
  }
  const seen = new Set();
  const results = [];
  for (let i = lines.length - 1; i >= 0 && results.length < limit; i--) {
    const parts = lines[i].split('|').map(s => s.trim());
    if (parts.length < 5) continue;
    const file = parts[4];
    if (seen.has(file)) continue;
    seen.add(file);
    results.push({ ts: parts[0], agent: parts[1], platform: parts[2], action: parts[3], file });
  }
  if (!results.length) {
    process.stdout.write('no file activity in audit.log\n');
    return;
  }
  for (const r of results) {
    process.stdout.write(`${r.ts}  ${r.action.padEnd(8)} ${r.file}\n`);
  }
}

function grepCmd(root, db, pattern, fileFilter) {
  try {
    const regex = new RegExp(pattern);
    let rows = db.prepare("SELECT path FROM files WHERE path NOT LIKE '.lex/%' ORDER BY path").all();
    if (fileFilter) {
      const filter = fileFilter.replace(/\\/g, '/');
      rows = rows.filter(r => r.path === filter || r.path.startsWith(filter + '/'));
    }
    let count = 0;
    for (const row of rows) {
      if (count >= 20) break;
      const full = path.join(root, row.path);
      let content;
      try { content = fs.readFileSync(full, 'utf8'); } catch { continue; }
      const lines = content.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        if (regex.test(lines[i])) {
          process.stdout.write(`${row.path}:${i + 1}: ${lines[i].trim().substring(0, 120)}\n`);
          count++;
          if (count >= 20) break;
        }
      }
    }
    if (!count) process.stdout.write('no matches\n');
  } catch (e) {
    process.stderr.write('invalid regex: ' + e.message + '\n');
    process.exit(1);
  }
}

function errorsCmd(root) {
  return new Promise((resolve) => {
    let ports = [4747, 4748, 4749, 4750, 4751, 4752, 4753, 4754, 4755];
    try {
      const info = JSON.parse(fs.readFileSync(path.join(root, '.lex', 'server.json'), 'utf8'));
      if (info.port) ports = [info.port, ...ports.filter(p => p !== info.port)];
    } catch {}
    let idx = 0;
    const tryNext = () => {
      if (idx >= ports.length) {
        process.stdout.write('no lex server running - start one with: lex watch\n');
        resolve();
        return;
      }
      const port = ports[idx++];
      const req = http.get({
        hostname: '127.0.0.1',
        port,
        path: '/api/cli?cmd=ping&arg=',
        timeout: 100,
      }, (res) => {
        let body = '';
        res.on('data', (d) => body += d);
        res.on('end', () => {
          try {
            const ping = JSON.parse(body);
            if (ping.output === 'pong' && ping.root && path.resolve(ping.root) === path.resolve(root)) {
              const req2 = http.get({
                hostname: '127.0.0.1',
                port,
                path: '/api/console-errors',
                timeout: 500,
              }, (res2) => {
                let body2 = '';
                res2.on('data', (d) => body2 += d);
                res2.on('end', () => {
                  try {
                    const data = JSON.parse(body2);
                    const errs = data.errors || [];
                    if (!errs.length) {
                      process.stdout.write('no console errors captured\n');
                    } else {
                      process.stdout.write('console errors (' + errs.length + '):\n');
                      for (const e of errs) {
                        process.stdout.write(`  [${e.type || 'error'}] ${e.message || ''}${e.filename ? ' (' + e.filename + ':' + (e.lineno || 0) + ')' : ''}\n`);
                        if (e.stack) process.stdout.write('    ' + e.stack.split('\n').slice(0, 3).join('\n    ') + '\n');
                      }
                    }
                  } catch {
                    process.stdout.write('failed to parse error response\n');
                  }
                  resolve();
                });
              });
              req2.on('error', () => { process.stdout.write('failed to fetch errors\n'); resolve(); });
              req2.on('timeout', () => { req2.destroy(); process.stdout.write('timeout fetching errors\n'); resolve(); });
            } else {
              tryNext();
            }
          } catch { tryNext(); }
        });
      });
      req.on('error', () => tryNext());
      req.on('timeout', () => { req.destroy(); tryNext(); });
    };
    tryNext();
  });
}

function patchCmd(root, args) {
  const { patch } = require('../lib/patch');
  const preview = args.includes('--preview');
  args = args.filter(a => a !== '--preview');

  function runPatch(file, anchor, insertion, mode, opts) {
    const filePath = path.isAbsolute(file) ? file : path.join(root, file);
    const r = patch(filePath, anchor, insertion || '', mode || 'after', { preview, root, occurrence: opts && opts.occurrence, line: opts && opts.line });
    if (r.ok) {
      process.stdout.write('OK  ' + file + '  ' + r.message + '\n');
      if (r.backup) process.stdout.write('backup: ' + r.backup + '\n');
      if (r.diff) {
        process.stdout.write('--- diff ---\n');
        process.stdout.write(r.diff + '\n');
        process.stdout.write('--- context ---\n');
        process.stdout.write(r.context + '\n');
      }
    } else {
      process.stderr.write('FAIL  ' + file + '  ' + r.message + '\n');
      if (r.context) {
        process.stderr.write('--- context ---\n');
        process.stderr.write(r.context + '\n');
      }
      if (r.suggestion) process.stderr.write('hint: ' + r.suggestion + '\n');
      process.exit(1);
    }
  }

  if (!args.length) {
    let data = '';
    try { data = fs.readFileSync(0, 'utf8'); } catch {
      process.stderr.write('no args and no stdin - nothing to do\n'); process.exit(1);
    }
    data = data.trim();
    if (!data) { process.stderr.write('empty stdin\n'); process.exit(1); }
    args = [data];
  }

  const input = args.join(' ').trim();

  if (input.startsWith('{') || input.startsWith('[')) {
    try {
      const parsed = JSON.parse(input);
      const patches = Array.isArray(parsed) ? parsed : [parsed];
      for (const p of patches) runPatch(p.file, p.anchor, p.insertion, p.mode, { occurrence: p.occurrence, line: p.line });
    } catch (e) {
      process.stderr.write('invalid JSON: ' + e.message + '\n'); process.exit(1);
    }
    return;
  }

  if (input.includes('|')) {
    const lines = input.split('\n').filter(l => l.trim());
    for (const line of lines) {
      const parts = line.split('|');
      if (parts.length < 3) { process.stderr.write('bad patch line: ' + line + '\n'); process.exit(1); }
      const [file, mode, anchor, ...rest] = parts;
      runPatch(file, anchor.replace(/\\n/g, '\n'), rest.join('|').replace(/\\n/g, '\n'), mode);
    }
    return;
  }

  if (args[0] && args[1] && args[2]) {
    let insertion = '';
    const insertIdx = args.indexOf('--insert');
    if (insertIdx >= 0 && args[insertIdx + 1]) insertion = args[insertIdx + 1];
    runPatch(args[0], args[2], insertion, args[1]);
    return;
  }

  process.stderr.write('usage: lex patch <file> <mode> <anchor> [--insert "text"] [--preview]\n');
  process.stderr.write('   or: echo "file|mode|anchor|insertion" | lex patch [--preview]\n');
  process.stderr.write('   or: lex patch \'{"file":...,"anchor":...,"insertion":...,"mode":...}\'\n');
  process.stderr.write('modes: after, before, replace, replace-line\n');
  process.stderr.write('features: auto-anchor, fuzzy match, diff output, context on failure\n');
  process.exit(1);
}

async function main() {
  const [cmd, ...args] = process.argv.slice(2);
  if (cmd === 'hook-update') return hookUpdate();
  if (cmd === 'docs') return docsCmd(args);
  if (cmd === 'init') return initCmd(args[0] || process.cwd());
  if (cmd === 'guard') return guardCmd(findRoot(process.cwd()) || process.cwd());
  const root = findRoot(process.cwd());
  if (!root) { process.stderr.write('no .lex folder found - initialize lex first\n'); process.exit(1); }

  if (cmd === 'watch') {
    const port = parseInt(args[0], 10) || 4747;
    process.stdout.write(`lex watch: server + file watcher on port ${port} (Ctrl+C to stop)\n`);
    serveWithPortFallback(require('../lib/serve').createServer(root, { watch: true }), port, port + 8, root);
    return;
  }

  // Try running server first for search/symbols (eliminates Node startup)
  if (cmd === 'search' && args.length) {
    // Check if last arg is a scope (ends with / or is an existing dir)
    let scope = null;
    let searchTerms = args;
    const lastArg = args[args.length - 1];
    if (lastArg.endsWith('/') || (fs.existsSync(path.join(root, lastArg)) && fs.statSync(path.join(root, lastArg)).isDirectory())) {
      scope = lastArg.replace(/\\/g, '/').replace(/\/+$/, '');
      searchTerms = args.slice(0, -1);
    }
    if (!searchTerms.length) { process.stderr.write('no search terms provided\n'); process.exit(1); }

    const serverOut = await tryServer('search', searchTerms.join(' ') + (scope ? '\t' + scope : ''), root);
    if (serverOut !== null) {
      process.stdout.write(serverOut + '\n');
      return;
    }
    // Fallback: direct DB
    const db = openDb(root);
    if (shouldRefresh(db)) refresh(db, root);
    const rows = ftsRows(db, searchTerms, 10, undefined, root, scope);
    for (const r of rows) process.stdout.write(`${r.path}:${r.line || 0}: ${r.snip.replace(/\s+/g, ' ')}\n`);
    if (!rows.length) process.stdout.write('no matches\n');
    db.close();
    return;
  }

  if (cmd === 'symbols' && args[0]) {
    const serverOut = await tryServer('symbols', args[0], root);
    if (serverOut !== null) {
      process.stdout.write(serverOut + '\n');
      return;
    }
    const db = openDb(root);
    if (shouldRefresh(db)) refresh(db, root);
    const rel = args[0].split(path.sep).join('/');
    const rows = db.prepare('SELECT line, kind, name FROM symbols WHERE path = ? ORDER BY line LIMIT 40').all(rel);
    for (const r of rows) process.stdout.write(`${r.line} ${r.kind} ${r.name}\n`);
    if (!rows.length) process.stdout.write('no symbols indexed for ' + rel + '\n');
    db.close();
    return;
  }

  const db = openDb(root);
  if (cmd === 'refresh') {
    const r = refresh(db, root);
    process.stdout.write(`indexed ${r.indexed}, removed ${r.removed}\n`);
  } else if (cmd === 'links' && args[0]) {
    if (shouldRefresh(db)) refresh(db, root);
    const arg = args[0].startsWith('/') ? args[0] : '/' + args[0];
    const url = normalizeUrl(arg);
    const rows = db.prepare('SELECT side, method, url, path, line FROM links WHERE url = ? OR url LIKE ? ORDER BY side, path LIMIT 40').all(url, url + '/%');
    for (const r of rows) process.stdout.write(`${r.side} ${r.method || '-'} ${r.url} ${r.path}:${r.line}\n`);
    if (!rows.length) process.stdout.write('no links match ' + url + '\n');
  } else if (cmd === 'update' && args[0]) {
    updateFile(db, root, path.relative(root, path.resolve(root, args[0])));
  } else if (cmd === 'status') {
    refresh(db, root);
    statusCmd(root, db);
  } else if (cmd === 'diff') {
    diffCmd(root, db);
  } else if (cmd === 'refs' && args[0]) {
    if (shouldRefresh(db)) refresh(db, root);
    refsCmd(db, root, args[0]);
  } else if (cmd === 'check') {
    checkCmd(root, db);
  } else if (cmd === 'tokens') {
    tokensCmd(root);
  } else if (cmd === 'recent') {
    recentCmd(root, args[0] ? parseInt(args[0], 10) : 20);
  } else if (cmd === 'grep' && args[0]) {
    const pattern = args[0];
    const fileFilter = args[1] || null;
    grepCmd(root, db, pattern, fileFilter);
  } else if (cmd === 'errors') {
    errorsCmd(root);
  } else if (cmd === 'patch') {
    patchCmd(root, args);
  } else if (cmd === 'ls') {
    const fileops = require('../lib/fileops');
    const r = fileops.ls(root, args[0] || '');
    for (const d of r.dirs) process.stdout.write(d + '/\n');
    for (const f of r.files) process.stdout.write(f + '\n');
    if (!r.dirs.length && !r.files.length) process.stdout.write('(empty)\n');
  } else if (cmd === 'read' && args[0]) {
    const fileops = require('../lib/fileops');
    const range = args[1] ? args[1].split('-').map(Number) : [null, null];
    const r = fileops.read(root, args[0], range[0], range[1]);
    if (!r) { process.stderr.write('file not found: ' + args[0] + '\n'); process.exit(1); }
    process.stdout.write(r.content + '\n');
    if (r.shown < r.totalLines) process.stderr.write(`(${r.shown}/${r.totalLines} lines, ${r.start}-${r.end})\n`);
  } else if (cmd === 'write' && args[0]) {
    const fileops = require('../lib/fileops');
    let content = '';
    if (!process.stdin.isTTY) {
      const chunks = [];
      const data = fs.readFileSync(0, 'utf8');
      content = data;
    } else {
      process.stderr.write('reading from stdin - type content, Ctrl+D to finish\n');
      content = fs.readFileSync(0, 'utf8');
    }
    const r = fileops.write(root, args[0], content);
    process.stdout.write(`wrote ${args[0]} (${r.bytes} bytes, ${r.lines} lines)\n`);
  } else if (cmd === 'rm' && args[0]) {
    const fileops = require('../lib/fileops');
    const force = args.includes('--force');
    const target = args.filter(a => a !== '--force')[0];
    const r = fileops.rm(root, target, { force });
    if (!r.ok) { process.stderr.write(r.message + ': ' + target + '\n'); process.exit(1); }
    process.stdout.write(r.message + '\n');
  } else if (cmd === 'mv' && args[0] && args[1]) {
    const fileops = require('../lib/fileops');
    const r = fileops.mv(root, args[0], args[1]);
    if (!r.ok) { process.stderr.write(r.message + '\n'); process.exit(1); }
    process.stdout.write(`moved ${r.from} -> ${r.to}` + (r.backup ? ` (backup: ${r.backup})` : '') + '\n');
  } else if (cmd === 'stat' && args[0]) {
    const fileops = require('../lib/fileops');
    const r = fileops.stat(root, args[0]);
    if (!r) { process.stderr.write('not found: ' + args[0] + '\n'); process.exit(1); }
    process.stdout.write(`path:  ${r.path}\n`);
    process.stdout.write(`size:  ${r.size} bytes (${r.sizeKB} KB)\n`);
    process.stdout.write(`type:  ${r.isDir ? 'directory' : 'file'}\n`);
    process.stdout.write(`mtime: ${r.mtime}\n`);
    if (r.ext) process.stdout.write(`ext:   ${r.ext}\n`);
  } else if (cmd === 'undo') {
    // Restore last patched file from .lex/trash/
    const trashDir = path.join(root, '.lex', 'trash');
    if (!fs.existsSync(trashDir)) { process.stderr.write('no backups found\n'); process.exit(1); }
    const backups = fs.readdirSync(trashDir)
      .filter(f => !f.endsWith('.json'))
      .map(f => ({ name: f, mtime: fs.statSync(path.join(trashDir, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
    if (!backups.length) { process.stderr.write('no backups found\n'); process.exit(1); }
    if (args[0] === '--list') {
      for (const b of backups.slice(0, 10)) {
        const origRel = b.name.replace(/^\d+_/, '').replace(/__/g, '/');
        process.stdout.write(`${b.name} -> ${origRel}\n`);
      }
      return;
    }
    // Restore the most recent backup
    const latest = backups[0];
    const origRel = latest.name.replace(/^\d+_/, '').replace(/__/g, '/');
    const origPath = path.join(root, origRel);
    fs.copyFileSync(path.join(trashDir, latest.name), origPath);
    fs.unlinkSync(path.join(trashDir, latest.name));
    process.stdout.write(`restored ${origRel} from .lex/trash/${latest.name}\n`);
  } else if (cmd === 'snapshot') {
    // Save/restore key files
    const snapDir = path.join(root, '.lex', 'snapshots');
    const action = args[0] || 'save';
    if (action === 'save') {
      const ts = Date.now();
      const dir = path.join(snapDir, String(ts));
      fs.mkdirSync(dir, { recursive: true });
      const files = args.slice(1).length ? args.slice(1) : findTrackedFiles(root);
      let saved = 0;
      for (const f of files) {
        const full = path.isAbsolute(f) ? f : path.join(root, f);
        if (fs.existsSync(full) && fs.statSync(full).isFile()) {
          const rel = path.relative(root, full).replace(/\\/g, '/');
          const dest = path.join(dir, rel.replace(/\//g, '__'));
          fs.copyFileSync(full, dest);
          saved++;
        }
      }
      // Write manifest
      fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ ts, files: files.map(f => path.relative(root, path.isAbsolute(f) ? f : path.join(root, f)).replace(/\\/g, '/')) }));
      process.stdout.write(`snapshot saved: ${saved} files -> .lex/snapshots/${ts}\n`);
    } else if (action === 'restore') {
      const snaps = fs.existsSync(snapDir) ? fs.readdirSync(snapDir).sort((a, b) => Number(b) - Number(a)) : [];
      if (!snaps.length) { process.stderr.write('no snapshots found\n'); process.exit(1); }
      const snapId = args[1] || snaps[0];
      const dir = path.join(snapDir, snapId);
      if (!fs.existsSync(dir)) { process.stderr.write('snapshot not found: ' + snapId + '\n'); process.exit(1); }
      const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
      let restored = 0;
      for (const f of manifest.files) {
        const src = path.join(dir, f.replace(/\//g, '__'));
        const dst = path.join(root, f);
        if (fs.existsSync(src)) {
          fs.mkdirSync(path.dirname(dst), { recursive: true });
          fs.copyFileSync(src, dst);
          restored++;
        }
      }
      process.stdout.write(`restored ${restored} files from snapshot ${snapId}\n`);
    } else if (action === 'list') {
      const snaps = fs.existsSync(snapDir) ? fs.readdirSync(snapDir).sort((a, b) => Number(b) - Number(a)) : [];
      if (!snaps.length) { process.stdout.write('(no snapshots)\n'); return; }
      for (const s of snaps.slice(0, 10)) {
        const manifestPath = path.join(snapDir, s, 'manifest.json');
        let count = '?';
        try { count = JSON.parse(fs.readFileSync(manifestPath, 'utf8')).files.length; } catch {}
        process.stdout.write(`${s} (${count} files)\n`);
      }
    } else {
      process.stderr.write('usage: lex snapshot [save|restore|list] [files...]\n');
      process.exit(1);
    }
  } else if (cmd === 'audit') {
    const { runAudit, formatAuditResult } = require('../lib/browser-audit');
    const { detectUrls } = require('../lib/url-detect');
    const explicitUrls = args.filter(a => a.startsWith('http'));
    const waitArg = args.find(a => a.startsWith('--wait='));
    const waitMs = waitArg ? parseInt(waitArg.split('=')[1], 10) : 3000;
    const jsonOut = args.includes('--json');
    const noCrawl = args.includes('--no-crawl');
    const depthArg = args.find(a => a.startsWith('--depth='));
    const maxDepth = depthArg ? parseInt(depthArg.split('=')[1], 10) : undefined;
    const pagesArg = args.find(a => a.startsWith('--max-pages='));
    const maxPages = pagesArg ? parseInt(pagesArg.split('=')[1], 10) : undefined;

    let urls = explicitUrls;
    if (!urls.length) {
      process.stderr.write('detecting dev server URLs...\n');
      urls = await detectUrls(root);
    }

    if (!urls.length) {
      process.stderr.write('no live dev server found. Start your dev server or pass URLs explicitly:\n');
      process.stderr.write('  lex audit http://localhost:3000 http://localhost:5173\n');
      process.exit(1);
    }

    process.stderr.write('auditing: ' + urls.join(', ') + (noCrawl ? ' (no crawl)' : ' (crawling)') + '\n');
    const result = await runAudit(urls, { waitMs, root, crawl: !noCrawl, maxDepth, maxPages });

    if (jsonOut) {
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    } else {
      process.stdout.write(formatAuditResult(result) + '\n');
    }

    if (!result.ok) process.exit(1);
  } else if (cmd === 'serve') {
    const port = parseInt(args[0], 10) || 4747;
    serveWithPortFallback(require('../lib/serve').createServer(root), port, port + 8, root);
    return;
  } else {
    process.stderr.write('usage: lex <init|guard|check|tokens|status|diff|refs|refresh|search|symbols|links|docs|grep|recent|errors|audit|patch|ls|read|write|rm|mv|stat|undo|snapshot|update|watch|serve|hook-update>\n');
    process.exit(1);
  }
}

function findTrackedFiles(root) {
  // Find tracked text files from the lex index, fallback to git ls-files
  try {
    const db = openDb(root);
    const rows = db.prepare('SELECT DISTINCT path FROM files WHERE path NOT LIKE ? ORDER BY path LIMIT 50').all('node_modules/%');
    db.close();
    if (rows.length) return rows.map(r => r.path);
  } catch {}
  // Fallback: git ls-files
  try {
    const { execSync } = require('child_process');
    const out = execSync('git ls-files', { cwd: root, encoding: 'utf8' });
    return out.split('\n').filter(f => f.trim() && /\.(js|ts|py|go|rs|php|rb|java|c|cpp|h|md|json|yaml|yml|sh|vue|jsx|tsx)$/.test(f)).slice(0, 50);
  } catch {}
  return [];
}

function detectStack(dir) {
  const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } };
  const readText = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch { return null; } };

  const composer = readJson(path.join(dir, 'composer.json'));
  if (composer) {
    const req = (composer.require || {});
    const reqDev = (composer['require-dev'] || {});
    const all = { ...req, ...reqDev };
    if (all['laravel/framework']) return { language: 'php', framework: 'laravel', overlay: 'php', version: all['laravel/framework'] };
    if (all['symfony/framework-bundle']) return { language: 'php', framework: 'symfony', overlay: 'php' };
    return { language: 'php', framework: '', overlay: 'php' };
  }

  const cargo = readText(path.join(dir, 'Cargo.toml'));
  if (cargo) {
    const m = cargo.match(/^name\s*=\s*"([^"]+)"/m);
    return { language: 'rust', framework: '', overlay: 'rust', package: m ? m[1] : '' };
  }

  const pyproject = readText(path.join(dir, 'pyproject.toml'));
  if (pyproject) {
    if (/fastapi/i.test(pyproject)) return { language: 'python', framework: 'fastapi', overlay: 'python' };
    if (/django/i.test(pyproject)) return { language: 'python', framework: 'django', overlay: 'python' };
    if (/flask/i.test(pyproject)) return { language: 'python', framework: 'flask', overlay: 'python' };
    return { language: 'python', framework: '', overlay: 'python' };
  }

  const reqText = readText(path.join(dir, 'requirements.txt'));
  if (reqText) {
    if (/django/i.test(reqText)) return { language: 'python', framework: 'django', overlay: 'python' };
    if (/fastapi/i.test(reqText)) return { language: 'python', framework: 'fastapi', overlay: 'python' };
    if (/flask/i.test(reqText)) return { language: 'python', framework: 'flask', overlay: 'python' };
    return { language: 'python', framework: '', overlay: 'python' };
  }

  const goMod = readText(path.join(dir, 'go.mod'));
  if (goMod) {
    const m = goMod.match(/^module\s+(\S+)/m);
    return { language: 'go', framework: '', overlay: 'go', module: m ? m[1] : '' };
  }

  const pkg = readJson(path.join(dir, 'package.json'));
  if (pkg) {
    const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
    if (deps['next']) return { language: 'typescript', framework: 'nextjs', overlay: 'typescript' };
    if (deps['@angular/core']) return { language: 'typescript', framework: 'angular', overlay: 'typescript' };
    if (deps['vue']) return { language: 'typescript', framework: 'vue', overlay: 'typescript' };
    if (deps['svelte']) return { language: 'typescript', framework: 'svelte', overlay: 'typescript' };
    if (deps['react']) return { language: 'typescript', framework: 'react', overlay: 'typescript' };
    if (deps['express']) return { language: 'typescript', framework: 'express', overlay: 'typescript' };
    if (deps['fastify']) return { language: 'typescript', framework: 'fastify', overlay: 'typescript' };
    return { language: 'typescript', framework: '', overlay: 'typescript' };
  }

  return null;
}

function initCmd(dir) {
  const pluginRoot = path.join(__dirname, '..');
  const templates = path.join(pluginRoot, 'templates');
  const lex = path.join(dir, '.lex');
  const created = [];
  const skipped = [];
  const missing = [];

  fs.mkdirSync(lex, { recursive: true });
  fs.mkdirSync(path.join(lex, 'pages'), { recursive: true });
  const sessionsDir = path.join(lex, 'sessions');
  if (!fs.existsSync(sessionsDir)) {
    fs.mkdirSync(sessionsDir, { recursive: true });
    fs.writeFileSync(path.join(sessionsDir, '.gitkeep'), '');
    created.push('.lex/sessions/');
  }

  const copyIfMissing = (src, dest, label) => {
    if (fs.existsSync(dest)) { skipped.push(label); return; }
    if (!fs.existsSync(src)) { missing.push(label); return; }
    fs.copyFileSync(src, dest);
    created.push(label);
  };

  copyIfMissing(path.join(templates, 'STATUS.md'), path.join(lex, 'status.md'), '.lex/status.md');
  copyIfMissing(path.join(templates, 'INDEX.md'), path.join(lex, 'INDEX.md'), '.lex/INDEX.md');

  let pageFiles = [];
  try { pageFiles = fs.readdirSync(path.join(templates, 'pages')).filter(f => f.endsWith('.md')); } catch {}
  for (const f of pageFiles) {
    copyIfMissing(path.join(templates, 'pages', f), path.join(lex, 'pages', f), '.lex/pages/' + f);
  }

  const stack = detectStack(dir);
  if (stack) {
    const stackPath = path.join(lex, 'pages', 'stack.md');
    let stackContent = '';
    try { stackContent = fs.readFileSync(stackPath, 'utf8'); } catch {}
    if (stackContent) {
      const lines = stackContent.split('\n');
      const updated = lines.map(line => {
        if (line.startsWith('- Language:') || line.startsWith('- Language: ')) return '- Language: ' + stack.language;
        if (line.startsWith('- Framework:') || line.startsWith('- Framework: ')) return '- Framework: ' + (stack.framework || '');
        return line;
      });
      if (!updated.some(l => l.startsWith('- Language:'))) {
        const techIdx = updated.findIndex(l => l.startsWith('## Tech'));
        if (techIdx >= 0) updated.splice(techIdx + 1, 0, '- Language: ' + stack.language, '- Framework: ' + (stack.framework || ''));
      }
      const overlayLine = '\n## Stack Overlay\n- Detected overlay: ' + stack.overlay + '\n- Load skills/<skill>/overlays/' + stack.overlay + '.md alongside each skill SKILL.md\n';
      if (!stackContent.includes('## Stack Overlay')) {
        updated.push('', overlayLine.trim());
      }
      fs.writeFileSync(stackPath, updated.join('\n'));
      created.push('stack.md (detected: ' + stack.language + (stack.framework ? '/' + stack.framework : '') + ')');
    }
  }

  const giPath = path.join(dir, '.gitignore');
  const needed = ['.lex/index.db*', '.lex/live.json', '.lex/token-ledger.json', '.lex/trash/', '.lex/snapshots/', '.lex/in/', '.lex/out/', '.lex/server.json', '.lex/audit.json', '.env', '.env.*', '!.env.example', '!.env.template'];
  let gi = '';
  try { gi = fs.readFileSync(giPath, 'utf8'); } catch {}
  let giChanged = false;
  for (const line of needed) {
    if (!gi.split('\n').some(l => l.trim() === line)) {
      gi += (gi.endsWith('\n') || gi === '' ? '' : '\n') + line + '\n';
      giChanged = true;
    }
  }
  if (giChanged) { fs.writeFileSync(giPath, gi); created.push('.gitignore entries (incl. .env protection)'); }

  // If plugin files are dropped into project root (drop-in install), exclude from index
  const pluginDirs = ['skills', 'hooks', 'lib', 'bin', 'templates'];
  const present = pluginDirs.filter(d => fs.existsSync(path.join(dir, d)));
  if (present.length >= 3) {
    const ignorePath = path.join(lex, 'ignore');
    let ignore = '';
    try { ignore = fs.readFileSync(ignorePath, 'utf8'); } catch {}
    let ignoreChanged = false;
    for (const d of present) {
      const line = d + '/';
      if (!ignore.split('\n').some(l => l.trim() === line)) {
        ignore += (ignore.endsWith('\n') || ignore === '' ? '' : '\n') + line + '\n';
        ignoreChanged = true;
      }
    }
    if (ignoreChanged) {
      fs.writeFileSync(ignorePath, ignore);
      created.push('.lex/ignore (excludes plugin dirs from index)');
    }
  }

  copyIfMissing(path.join(templates, 'agent.json'), path.join(lex, 'agent.json'), '.lex/agent.json');

  // Copy agent instruction files so agents discover lex in this project
  copyIfMissing(path.join(pluginRoot, 'AGENTS.md'), path.join(dir, 'AGENTS.md'), 'AGENTS.md');
  copyIfMissing(path.join(pluginRoot, 'CLAUDE.md'), path.join(dir, 'CLAUDE.md'), 'CLAUDE.md');
  copyIfMissing(path.join(pluginRoot, 'GEMINI.md'), path.join(dir, 'GEMINI.md'), 'GEMINI.md');
  copyIfMissing(path.join(pluginRoot, 'ANTIGRAVITY.md'), path.join(dir, 'ANTIGRAVITY.md'), 'ANTIGRAVITY.md');

  // Copy skills directory so agents can read skill files from the project
  const skillsSrc = path.join(pluginRoot, 'skills');
  const skillsDest = path.join(dir, 'skills');
  if (fs.existsSync(skillsSrc) && !fs.existsSync(skillsDest)) {
    copyDir(skillsSrc, skillsDest);
    created.push('skills/ (' + countFiles(skillsDest) + ' files)');
  }

  const gitDir = path.join(dir, '.git');
  if (fs.existsSync(gitDir)) {
    const hooksDir = path.join(gitDir, 'hooks');
    try { fs.mkdirSync(hooksDir, { recursive: true }); } catch {}
    const preCommit = path.join(hooksDir, 'pre-commit');
    const lexBin = path.join(pluginRoot, 'bin', 'lex.js').replace(/\\/g, '/');
    const hookContent = '#!/usr/bin/env bash\nset -euo pipefail\nLEX_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo .)"\nif [ -d "$LEX_ROOT/.lex" ] && command -v node >/dev/null 2>&1; then\n  LEX_BIN="$(find "$LEX_ROOT" -maxdepth 3 -path "*/bin/lex.js" -not -path "*/.lex/*" 2>/dev/null | head -1)"\n  if [ -z "$LEX_BIN" ] && command -v lex >/dev/null 2>&1; then\n    LEX_BIN="$(node -e "try{process.stdout.write(require.resolve(\'@atul-labs/lex/bin/lex.js\'))}catch{process.stdout.write(\'\')}")"\n  fi\n  if [ -z "$LEX_BIN" ]; then\n    LEX_BIN="' + lexBin + '"\n  fi\n  if [ -n "$LEX_BIN" ] && [ -f "$LEX_BIN" ]; then\n    node "$LEX_BIN" guard "$LEX_ROOT" 2>&1\n    GUARD_EXIT=$?\n    if [ $GUARD_EXIT -ne 0 ]; then\n      echo "lex guard: CRITICAL violations found - commit blocked"\n      echo "Run: node \\"$LEX_BIN\\" guard for details"\n      exit 1\n    fi\n  fi\nfi\nexit 0\n';
    let existing = '';
    try { existing = fs.readFileSync(preCommit, 'utf8'); } catch {}
    if (!existing.includes('lex guard')) {
      fs.writeFileSync(preCommit, hookContent, { mode: 0o755 });
      created.push('.git/hooks/pre-commit (runs lex guard)');
    }
  }

  if (created.length) process.stdout.write('created: ' + created.join(', ') + '\n');
  if (skipped.length) process.stdout.write('already present (untouched): ' + skipped.join(', ') + '\n');
  if (missing.length) process.stderr.write('warning: plugin templates missing (reinstall lex?): ' + missing.join(', ') + '\n');
  const lexCmd = isGlobalInstall(pluginRoot) ? 'lex' : ('node ' + pluginRoot + '/bin/lex.js');
  process.stdout.write('next: run "' + lexCmd + ' serve" for the live viewer\n');
}

function hookUpdate() {
  let raw = '';
  try { raw = fs.readFileSync(0, 'utf8'); } catch {}
  try {
    const input = JSON.parse(raw);
    const file = input.tool_input && input.tool_input.file_path;
    const tool = input.tool_name || 'edit';
    if (file) {
      const root = findRoot(path.dirname(file)) || findRoot(process.cwd());
      if (root) {
        const rel = path.relative(root, file);
        if (rel && !rel.startsWith('..')) {
          updateFile(openDb(root), root, rel);
          try {
            const relPosix = rel.split(path.sep).join('/');
            fs.writeFileSync(path.join(root, '.lex', 'live.json'), JSON.stringify({ file: relPosix, tool, ts: Date.now() }));
          } catch (e) { process.stderr.write('lex hook: live.json write failed: ' + e.message + '\n'); }
        }
      }
    }
  } catch (e) { process.stderr.write('lex hook: index update failed: ' + e.message + '\n'); }
  process.stdout.write('{}\n');
}

main();
