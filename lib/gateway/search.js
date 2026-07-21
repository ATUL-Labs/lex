'use strict';

/**
 * Gateway search commands: search, memory, recall, episode, note, docs
 */

const fs = require('node:fs');
const path = require('node:path');

let indexDbCache = null;
let indexDbRoot = null;

function ensureFreshIndex(root) {
  const { openDb, shouldRefresh, refresh, walk, updateFile } = require('../indexer');
  if (indexDbCache && indexDbRoot === root) {
    if (shouldRefresh(indexDbCache)) {
      refresh(indexDbCache, root);
    } else {
      const diskFiles = walk(root);
      const indexedMap = new Map();
      for (const f of indexDbCache.prepare('SELECT path, mtime_ms, size FROM files').all()) indexedMap.set(f.path, f);
      let staleCount = 0;
      const staleFiles = [];
      for (const rel of diskFiles) {
        let st;
        try { st = fs.statSync(path.join(root, rel)); } catch { continue; }
        const row = indexedMap.get(rel);
        if (!row || row.mtime_ms !== Math.trunc(st.mtimeMs) || row.size !== st.size) {
          staleCount++;
          staleFiles.push(rel);
        }
      }
      if (staleCount > 0 && staleCount <= 20) {
        for (const rel of staleFiles) { try { updateFile(indexDbCache, root, rel); } catch {} }
      } else if (staleCount > 20) {
        refresh(indexDbCache, root);
      }
    }
    return indexDbCache;
  }
  const db = openDb(root);
  indexDbCache = db;
  indexDbRoot = root;
  if (shouldRefresh(db)) {
    refresh(db, root);
  } else {
    const diskFiles = walk(root);
    const indexedMap = new Map();
    for (const f of db.prepare('SELECT path, mtime_ms, size FROM files').all()) indexedMap.set(f.path, f);
    let staleCount = 0;
    const staleFiles = [];
    for (const rel of diskFiles) {
      let st;
      try { st = fs.statSync(path.join(root, rel)); } catch { continue; }
      const row = indexedMap.get(rel);
      if (!row || row.mtime_ms !== Math.trunc(st.mtimeMs) || row.size !== st.size) {
        staleCount++;
        staleFiles.push(rel);
      }
    }
    if (staleCount > 0 && staleCount <= 20) {
      for (const rel of staleFiles) { try { updateFile(db, root, rel); } catch {} }
    } else if (staleCount > 20) {
      refresh(db, root);
    }
  }
  return db;
}

function closeIndexDb() {
  if (indexDbCache) { try { indexDbCache.close(); } catch {} }
  indexDbCache = null;
  indexDbRoot = null;
}

function handle(cmd, args, root) {
  // --- search ---
  if (cmd === 'search') {
    const { ftsRows } = require('../indexer');
    const db = ensureFreshIndex(root);
    const terms = Array.isArray(args) ? args : [String(args)];
    const scope = Array.isArray(args) && args.length > 1 && args[args.length - 1].endsWith('/') ? args[args.length - 1].replace(/\/+$/, '') : null;
    const searchTerms = scope ? terms.slice(0, -1) : terms;
    const rows = ftsRows(db, searchTerms, 10, undefined, root, scope);
    if (!rows.length) return { ok: true, output: 'no results' };
    const lines = rows.map(r => `${r.path}:${r.line || 0}: ${r.snip.replace(/\s+/g, ' ')}`);
    return { ok: true, output: lines.join('\n'), count: rows.length };
  }

  // --- recall ---
  if (cmd === 'recall') {
    const { recall: recallMem, formatRecall } = require('../memory');
    const terms = Array.isArray(args) ? args : (args ? [String(args)] : []);
    const results = recallMem(root, terms);
    return { ok: true, output: formatRecall(results), count: results.persistent.length + results.episodic.length };
  }

  // --- episode ---
  if (cmd === 'episode') {
    const { writeEpisode } = require('../memory');
    const ep = Array.isArray(args) ? args[0] : args;
    if (typeof ep === 'string') {
      try {
        const parsed = JSON.parse(ep);
        const filename = writeEpisode(root, parsed);
        return { ok: true, output: 'episode written: .lex/sessions/' + filename };
      } catch {
        return { ok: false, error: 'episode requires JSON object with title, summary, files, etc.' };
      }
    }
    if (typeof ep === 'object' && ep !== null) {
      const filename = writeEpisode(root, ep);
      return { ok: true, output: 'episode written: .lex/sessions/' + filename };
    }
    return { ok: false, error: 'episode requires an object with title, summary, etc.' };
  }

  // --- note ---
  if (cmd === 'note') {
    const noteText = Array.isArray(args) ? args.join(' ') : String(args);
    if (!noteText.trim()) return { ok: false, error: 'note text required' };
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
    return { ok: true, output: 'noted in .lex/pages/mistakes.md (#' + nextNum + ')' };
  }

  // --- memory ---
  if (cmd === 'memory') {
    const memdb = require('../memory-db');
    memdb.refreshMemoryDb(root);
    const terms = Array.isArray(args) ? args : [String(args)];
    const rows = memdb.searchMemoryDb(root, terms, { limit: 20 });
    if (!rows.length) return { ok: true, output: 'no memory matches' };
    const lines = rows.map(r => `${r.source}: ${r.preview.replace(/\s+/g, ' ').trim()}`);
    return { ok: true, output: lines.join('\n'), count: rows.length };
  }

  // --- docs ---
  if (cmd === 'docs') {
    const os = require('node:os');
    const docsDir = process.env.LEX_DOCS_DIR || path.join(os.homedir(), '.lex', 'docs');
    const dbFile = process.env.LEX_DOCS_DB || path.join(os.homedir(), '.lex', 'docs.db');
    if (!fs.existsSync(docsDir)) return { ok: true, output: 'no docs cache yet - run: lex docs:distill <package>', count: 0 };
    const { openDbAt, ftsRows: fts, refreshDocs } = require('../indexer');
    fs.mkdirSync(path.dirname(dbFile), { recursive: true });
    const docsDb = openDbAt(dbFile);
    refreshDocs(docsDb, docsDir);
    if (!args.length) {
      const rows = docsDb.prepare('SELECT path FROM files ORDER BY path LIMIT 40').all();
      docsDb.close();
      if (!rows.length) return { ok: true, output: 'docs cache is empty', count: 0 };
      return { ok: true, output: rows.map(r => r.path).join('\n'), count: rows.length };
    }
    const terms = Array.isArray(args) ? args : [String(args)];
    const rows = fts(docsDb, terms, 10);
    docsDb.close();
    if (!rows.length) return { ok: true, output: 'no doc matches', count: 0 };
    const lines = rows.map(r => `${r.path}: ${r.snip.replace(/\s+/g, ' ')}`);
    return { ok: true, output: lines.join('\n'), count: rows.length };
  }

  if (cmd === 'proactive') {
    const { proactive, formatProactive } = require('../memory-proactive');
    const signals = {};
    if (args.length) signals.files = args.filter(a => typeof a === 'string' && !a.startsWith('--'));
    const result = proactive(root, signals);
    return { ok: true, output: formatProactive(result), memories: result.memories.length, context: result.context };
  }

  return null;
}

module.exports = { handle, ensureFreshIndex, closeIndexDb };
