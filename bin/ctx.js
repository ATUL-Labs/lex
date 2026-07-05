#!/usr/bin/env node
'use strict';
process.removeAllListeners('warning');
const fs = require('node:fs');
const path = require('node:path');
const { openDb, refresh, updateFile } = require('../lib/indexer');
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

function ftsQuery(terms) {
  return terms.map(t => '"' + t.replace(/"/g, '') + '"').join(' ');
}

function main() {
  const [cmd, ...args] = process.argv.slice(2);
  if (cmd === 'hook-update') return hookUpdate();
  const root = findRoot(process.cwd());
  if (!root) { process.stderr.write('no .ctx folder found - initialize ctx first\n'); process.exit(1); }
  const db = openDb(root);
  if (cmd === 'refresh') {
    const r = refresh(db, root);
    process.stdout.write(`indexed ${r.indexed}, removed ${r.removed}\n`);
  } else if (cmd === 'search' && args.length) {
    refresh(db, root);
    const rows = db.prepare(
      "SELECT path, snippet(content_fts, 1, '[', ']', '...', 8) AS snip FROM content_fts WHERE content_fts MATCH ? ORDER BY rank LIMIT 10"
    ).all(ftsQuery(args));
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
    const url = normalizeUrl(args[0]);
    const rows = db.prepare('SELECT side, method, url, path, line FROM links WHERE url = ? OR url LIKE ? ORDER BY side, path LIMIT 40').all(url, url + '/%');
    for (const r of rows) process.stdout.write(`${r.side} ${r.method || '-'} ${r.url} ${r.path}:${r.line}\n`);
    if (!rows.length) process.stdout.write('no links match ' + url + '\n');
  } else if (cmd === 'update' && args[0]) {
    updateFile(db, root, path.relative(root, path.resolve(root, args[0])));
  } else {
    process.stderr.write('usage: ctx <refresh|search <terms>|symbols <file>|links <url>|update <file>|hook-update>\n');
    process.exit(1);
  }
}

function hookUpdate() {
  let raw = '';
  try { raw = fs.readFileSync(0, 'utf8'); } catch {}
  try {
    const input = JSON.parse(raw);
    const file = input.tool_input && input.tool_input.file_path;
    if (file) {
      const root = findRoot(path.dirname(file)) || findRoot(process.cwd());
      if (root) {
        const rel = path.relative(root, file);
        if (rel && !rel.startsWith('..')) updateFile(openDb(root), root, rel);
      }
    }
  } catch {}
  process.stdout.write('{}\n');
}

main();
