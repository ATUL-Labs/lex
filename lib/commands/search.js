'use strict';

/**
 * CLI commands: search, symbols, grep, refs, links, memory, recall, episode, note, docs
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { openDb, openDbAt, refresh, refreshDocs, updateFile, ftsRows, shouldRefresh } = require('../indexer');
const { normalizeUrl } = require('../extract');
const { tryServer } = require('../cli-utils');

async function searchCmd(root, args) {
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
  const db = openDb(root);
  if (shouldRefresh(db)) refresh(db, root);
  const rows = ftsRows(db, searchTerms, 10, undefined, root, scope);
  for (const r of rows) process.stdout.write(`${r.path}:${r.line || 0}: ${r.snip.replace(/\s+/g, ' ')}\n`);
  if (!rows.length) process.stdout.write('no matches\n');
  db.close();
}

async function symbolsCmd(root, args) {
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
}

async function grepCmd(root, db, pattern, fileFilter) {
  const { grepFiles } = require('../grep');
  const serverOut = await tryServer('grep', pattern + (fileFilter ? '\t' + fileFilter : ''), root);
  if (serverOut !== null) {
    process.stdout.write(serverOut + '\n');
    return;
  }
  const result = grepFiles(root, db, pattern, fileFilter);
  if (result.error) { process.stderr.write(result.error + '\n'); process.exit(1); }
  if (!result.matches.length) { process.stdout.write('no matches\n'); return; }
  for (const m of result.matches) process.stdout.write(m + '\n');
}

function refsCmd(db, root, symbol) {
  const rows = db.prepare('SELECT path, name, kind, line FROM symbols WHERE name = ? ORDER BY path LIMIT 50').all(symbol);
  if (rows.length) {
    process.stdout.write('definitions:\n');
    for (const r of rows) process.stdout.write(`  ${r.path}:${r.line} ${r.kind} ${r.name}\n`);
  }
  const ftsRows = db.prepare("SELECT path, snippet(content_fts, 1, '[[', ']]', '...', 6) AS snip FROM content_fts WHERE content_fts MATCH ? ORDER BY rank LIMIT 30").all('"' + symbol.replace(/"/g, '') + '"');
  const defPaths = new Set(rows.map(r => r.path));
  const refMap = new Map();
  for (const r of ftsRows) { if (!refMap.has(r.path)) refMap.set(r.path, r.snip); }
  const refs = [...refMap.entries()].filter(([p]) => !defPaths.has(p));
  if (refs.length) {
    process.stdout.write('references:\n');
    for (const [p, snip] of refs) process.stdout.write(`  ${p}: ${snip.replace(/\s+/g, ' ')}\n`);
  }
  if (!rows.length && !refs.length) process.stdout.write('no references found for ' + symbol + '\n');
}

function linksCmd(db, root, args) {
  const arg = args[0].startsWith('/') ? args[0] : '/' + args[0];
  const url = normalizeUrl(arg);
  const rows = db.prepare('SELECT side, method, url, path, line FROM links WHERE url = ? OR url LIKE ? ORDER BY side, path LIMIT 40').all(url, url + '/%');
  for (const r of rows) process.stdout.write(`${r.side} ${r.method || '-'} ${r.url} ${r.path}:${r.line}\n`);
  if (!rows.length) process.stdout.write('no links match ' + url + '\n');
}

function memoryCmd(db, root, args) {
  if (shouldRefresh(db)) refresh(db, root);
  const rows = ftsRows(db, args, 20, undefined, root, '.lex/pages');
  for (const r of rows) process.stdout.write(`${r.path}: ${r.snip.replace(/\s+/g, ' ')}\n`);
  if (!rows.length) process.stdout.write('no memory matches\n');
}

function recallCmd(root, args) {
  const { recall, formatRecall } = require('../memory');
  const results = recall(root, args);
  process.stdout.write(formatRecall(results) + '\n');
}

function episodeCmd(root, args) {
  const { writeEpisode } = require('../memory');
  const json = args.join(' ');
  try {
    const ep = JSON.parse(json);
    const filename = writeEpisode(root, ep);
    process.stdout.write('episode written: .lex/sessions/' + filename + '\n');
  } catch (e) {
    process.stderr.write('episode requires JSON: {"title":"...","summary":"...","files":[...]}\n');
    process.exit(1);
  }
}

function noteCmd(root, args) {
  const noteText = args.join(' ');
  const mistakesPath = path.join(root, '.lex', 'pages', 'mistakes.md');
  let existing = '';
  try { existing = fs.readFileSync(mistakesPath, 'utf8'); } catch {}
  let nextNum = (existing.match(/^## (\d+)\./gm) || []).length + 1;
  const date = new Date().toISOString().substring(0, 10);
  if (!existing.endsWith('\n')) existing += '\n';
  existing += '\n## ' + nextNum + '. ' + noteText.substring(0, 60) + '\n';
  existing += '- when: ' + date + '\n';
  existing += '- note: ' + noteText + '\n';
  fs.writeFileSync(mistakesPath, existing, 'utf8');
  process.stdout.write('noted in .lex/pages/mistakes.md (#' + nextNum + ')\n');
}

function docsCmd(args) {
  const docsDir = process.env.LEX_DOCS_DIR || path.join(os.homedir(), '.lex', 'docs');
  const dbFile = process.env.LEX_DOCS_DB || path.join(os.homedir(), '.lex', 'docs.db');
  if (!fs.existsSync(docsDir)) {
    process.stderr.write('no docs cache. Run: lex docs:distill <npm:package | composer:vendor/package | url:https...>\n');
    process.exit(1);
  }
  fs.mkdirSync(path.dirname(dbFile), { recursive: true });
  const docsDb = openDbAt(dbFile);
  refreshDocs(docsDb, docsDir);
  if (!args.length) {
    const rows = docsDb.prepare('SELECT path FROM files ORDER BY path LIMIT 40').all();
    docsDb.close();
    for (const r of rows) process.stdout.write(r.path + '\n');
    if (!rows.length) process.stdout.write('docs cache is empty\n');
    return;
  }
  const rows = ftsRows(docsDb, args, 10);
  docsDb.close();
  if (!rows.length) process.stdout.write('no matches\n');
  for (const r of rows) process.stdout.write(`${r.path}: ${r.snip.replace(/\s+/g, ' ')}\n`);
}

function proactiveCmd(root, args) {
  const { proactive, formatProactive } = require('../memory-proactive');
  const signals = {};
  if (args.length) {
    signals.files = args.filter(a => !a.startsWith('--'));
  }
  const result = proactive(root, signals);
  process.stdout.write(formatProactive(result) + '\n');
}

module.exports = { searchCmd, symbolsCmd, grepCmd, refsCmd, linksCmd, memoryCmd, recallCmd, episodeCmd, noteCmd, docsCmd, proactiveCmd };
