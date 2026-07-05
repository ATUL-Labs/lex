#!/usr/bin/env node
'use strict';
process.removeAllListeners('warning');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { openDb, openDbAt, refresh, refreshDocs, updateFile, ftsRows } = require('../lib/indexer');
const { normalizeUrl } = require('../lib/extract');

function findRoot(from) {
  let dir = from;
  for (;;) {
    if (fs.existsSync(path.join(dir, '.ctx'))) return dir;
    const up = path.dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}

function docsCmd(args) {
  const docsDir = process.env.CTX_DOCS_DIR || path.join(os.homedir(), '.ctx', 'docs');
  const dbFile = process.env.CTX_DOCS_DB || path.join(os.homedir(), '.ctx', 'docs.db');
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

function main() {
  const [cmd, ...args] = process.argv.slice(2);
  if (cmd === 'hook-update') return hookUpdate();
  if (cmd === 'docs') return docsCmd(args);
  if (cmd === 'init') return initCmd(args[0] || process.cwd());
  const root = findRoot(process.cwd());
  if (!root) { process.stderr.write('no .ctx folder found - initialize ctx first\n'); process.exit(1); }
  const db = openDb(root);
  if (cmd === 'refresh') {
    const r = refresh(db, root);
    process.stdout.write(`indexed ${r.indexed}, removed ${r.removed}\n`);
  } else if (cmd === 'search' && args.length) {
    refresh(db, root);
    const rows = ftsRows(db, args, 10);
    for (const r of rows) process.stdout.write(`${r.path}: ${r.snip.replace(/\s+/g, ' ')}\n`);
    if (!rows.length) process.stdout.write('no matches\n');
  } else if (cmd === 'symbols' && args[0]) {
    refresh(db, root);
    const rel = args[0].split(path.sep).join('/');
    const rows = db.prepare('SELECT line, kind, name FROM symbols WHERE path = ? ORDER BY line LIMIT 40').all(rel);
    for (const r of rows) process.stdout.write(`${r.line} ${r.kind} ${r.name}\n`);
    if (!rows.length) process.stdout.write('no symbols indexed for ' + rel + '\n');
  } else if (cmd === 'links' && args[0]) {
    refresh(db, root);
    const arg = args[0].startsWith('/') ? args[0] : '/' + args[0];
    const url = normalizeUrl(arg);
    const rows = db.prepare('SELECT side, method, url, path, line FROM links WHERE url = ? OR url LIKE ? ORDER BY side, path LIMIT 40').all(url, url + '/%');
    for (const r of rows) process.stdout.write(`${r.side} ${r.method || '-'} ${r.url} ${r.path}:${r.line}\n`);
    if (!rows.length) process.stdout.write('no links match ' + url + '\n');
  } else if (cmd === 'update' && args[0]) {
    updateFile(db, root, path.relative(root, path.resolve(root, args[0])));
  } else if (cmd === 'serve') {
    const port = parseInt(args[0], 10) || 4747;
    require('../lib/serve').createServer(root).listen(port, '127.0.0.1', () => {
      process.stdout.write('ctx viewer: http://127.0.0.1:' + port + '\n');
    });
    return;
  } else {
    process.stderr.write('usage: ctx <init [dir]|refresh|search <terms>|symbols <file>|links <url>|docs [terms]|update <file>|serve [port]|hook-update>\n');
    process.exit(1);
  }
}

function initCmd(dir) {
  const pluginRoot = path.join(__dirname, '..');
  const templates = path.join(pluginRoot, 'templates');
  const ctx = path.join(dir, '.ctx');
  const created = [];
  const skipped = [];
  const missing = [];

  fs.mkdirSync(ctx, { recursive: true });
  fs.mkdirSync(path.join(ctx, 'pages'), { recursive: true });
  const sessionsDir = path.join(ctx, 'sessions');
  if (!fs.existsSync(sessionsDir)) {
    fs.mkdirSync(sessionsDir, { recursive: true });
    fs.writeFileSync(path.join(sessionsDir, '.gitkeep'), '');
    created.push('.ctx/sessions/');
  }

  const copyIfMissing = (src, dest, label) => {
    if (fs.existsSync(dest)) { skipped.push(label); return; }
    if (!fs.existsSync(src)) { missing.push(label); return; }
    fs.copyFileSync(src, dest);
    created.push(label);
  };

  copyIfMissing(path.join(templates, 'STATUS.md'), path.join(ctx, 'status.md'), '.ctx/status.md');
  copyIfMissing(path.join(templates, 'INDEX.md'), path.join(ctx, 'INDEX.md'), '.ctx/INDEX.md');

  let pageFiles = [];
  try { pageFiles = fs.readdirSync(path.join(templates, 'pages')).filter(f => f.endsWith('.md')); } catch {}
  for (const f of pageFiles) {
    copyIfMissing(path.join(templates, 'pages', f), path.join(ctx, 'pages', f), '.ctx/pages/' + f);
  }

  const giPath = path.join(dir, '.gitignore');
  const needed = ['.ctx/index.db*', '.ctx/live.json'];
  let gi = '';
  try { gi = fs.readFileSync(giPath, 'utf8'); } catch {}
  let giChanged = false;
  for (const line of needed) {
    if (!gi.split('\n').some(l => l.trim() === line)) {
      gi += (gi.endsWith('\n') || gi === '' ? '' : '\n') + line + '\n';
      giChanged = true;
    }
  }
  if (giChanged) { fs.writeFileSync(giPath, gi); created.push('.gitignore entries'); }

  if (created.length) process.stdout.write('created: ' + created.join(', ') + '\n');
  if (skipped.length) process.stdout.write('already present (untouched): ' + skipped.join(', ') + '\n');
  if (missing.length) process.stderr.write('warning: plugin templates missing (reinstall ctx?): ' + missing.join(', ') + '\n');
  process.stdout.write('next: run "node ' + pluginRoot + '/bin/ctx.js serve" for the live viewer\n');
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
            fs.writeFileSync(path.join(root, '.ctx', 'live.json'), JSON.stringify({ file: relPosix, tool, ts: Date.now() }));
          } catch {}
        }
      }
    }
  } catch {}
  process.stdout.write('{}\n');
}

main();
