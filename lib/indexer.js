'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { isTextFile, shouldSkipDir, extractSymbols, extractLinks, extractSchema } = require('./extract');

const MAX_SIZE = 1024 * 1024;
const stmtCache = new WeakMap();

function openDbAt(dbFile) {
  const db = new DatabaseSync(dbFile);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS files (path TEXT PRIMARY KEY, mtime_ms INTEGER NOT NULL, size INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS symbols (path TEXT NOT NULL, name TEXT NOT NULL, kind TEXT NOT NULL, line INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS idx_symbols_name ON symbols(name);
    CREATE INDEX IF NOT EXISTS idx_symbols_path ON symbols(path);
    CREATE TABLE IF NOT EXISTS links (side TEXT NOT NULL, method TEXT, url TEXT NOT NULL, path TEXT NOT NULL, line INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS idx_links_url ON links(url);
    CREATE TABLE IF NOT EXISTS schema_tables (name TEXT NOT NULL, path TEXT NOT NULL, line INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS schema_columns (table_name TEXT NOT NULL, name TEXT NOT NULL, type TEXT, fk_table TEXT, fk_column TEXT, path TEXT NOT NULL, line INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS idx_schema_columns_table ON schema_columns(table_name);
    CREATE VIRTUAL TABLE IF NOT EXISTS content_fts USING fts5(path, text);
  `);
  return db;
}

function openDb(root) {
  return openDbAt(path.join(root, '.ctx', 'index.db'));
}

function stmts(db) {
  let s = stmtCache.get(db);
  if (!s) {
    s = {
      delSymbols: db.prepare('DELETE FROM symbols WHERE path = ?'),
      delLinks: db.prepare('DELETE FROM links WHERE path = ?'),
      delFts: db.prepare('DELETE FROM content_fts WHERE path = ?'),
      delFiles: db.prepare('DELETE FROM files WHERE path = ?'),
      delSchemaTables: db.prepare('DELETE FROM schema_tables WHERE path = ?'),
      delSchemaColumns: db.prepare('DELETE FROM schema_columns WHERE path = ?'),
      insFile: db.prepare('INSERT INTO files (path, mtime_ms, size) VALUES (?, ?, ?)'),
      insSym: db.prepare('INSERT INTO symbols (path, name, kind, line) VALUES (?, ?, ?, ?)'),
      insLink: db.prepare('INSERT INTO links (side, method, url, path, line) VALUES (?, ?, ?, ?, ?)'),
      insFts: db.prepare('INSERT INTO content_fts (path, text) VALUES (?, ?)'),
      insSchemaTable: db.prepare('INSERT INTO schema_tables (name, path, line) VALUES (?, ?, ?)'),
      insSchemaColumn: db.prepare('INSERT INTO schema_columns (table_name, name, type, fk_table, fk_column, path, line) VALUES (?, ?, ?, ?, ?, ?, ?)'),
      selFile: db.prepare('SELECT mtime_ms, size FROM files WHERE path = ?'),
      selAllFiles: db.prepare('SELECT path FROM files'),
    };
    stmtCache.set(db, s);
  }
  return s;
}

function loadIgnorePrefixes(root) {
  let text;
  try { text = fs.readFileSync(path.join(root, '.ctx', 'ignore'), 'utf8'); } catch { return []; }
  return text.split('\n')
    .map(l => l.trim().replace(/\\/g, '/'))
    .filter(l => l && !l.startsWith('#'));
}

function isIgnored(rel, prefixes) {
  for (const p of prefixes) {
    if (rel === p || rel.startsWith(p + '/')) return true;
  }
  return false;
}

function walk(root) {
  const out = [];
  const ignorePrefixes = loadIgnorePrefixes(root);
  const rec = (dir, relDir) => {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const d of entries) {
      const rel = relDir ? relDir + '/' + d.name : d.name;
      if (isIgnored(rel, ignorePrefixes)) continue;
      if (d.isDirectory()) {
        if (relDir === '' && d.name === '.ctx') { rec(path.join(dir, d.name), rel); continue; }
        if (relDir === '.ctx') { if (d.name === 'pages') rec(path.join(dir, d.name), rel); continue; }
        if (d.name.startsWith('.') || shouldSkipDir(d.name)) continue;
        rec(path.join(dir, d.name), rel);
      } else if (d.isFile()) {
        if (relDir.startsWith('.ctx')) { if (d.name.endsWith('.md')) out.push(rel); continue; }
        if (isTextFile(rel)) out.push(rel);
      }
    }
  };
  rec(root, '');
  return out;
}

function removeRows(db, rel) {
  const s = stmts(db);
  s.delSymbols.run(rel);
  s.delLinks.run(rel);
  s.delFts.run(rel);
  s.delFiles.run(rel);
  s.delSchemaTables.run(rel);
  s.delSchemaColumns.run(rel);
}

const SCHEMA_EXT = /\.(php|sql)$/;

function indexFile(db, root, rel, st) {
  let text;
  try { text = fs.readFileSync(path.join(root, rel), 'utf8'); } catch { return; }
  removeRows(db, rel);
  const s = stmts(db);
  s.insFile.run(rel, Math.trunc(st.mtimeMs), st.size);
  for (const sym of extractSymbols(rel, text)) s.insSym.run(rel, sym.name, sym.kind, sym.line);
  for (const l of extractLinks(rel, text)) s.insLink.run(l.side, l.method, l.url, rel, l.line);
  if (SCHEMA_EXT.test(rel)) {
    const schema = extractSchema(rel, text);
    for (const t of schema.tables) s.insSchemaTable.run(t.name, rel, t.line);
    for (const c of schema.columns) s.insSchemaColumn.run(c.table, c.name, c.type, c.fkTable, c.fkColumn, rel, c.line);
  }
  s.insFts.run(rel, text);
}

const CHUNK_SIZE = 200;

function syncFiles(db, baseDir, rels) {
  let indexed = 0;
  let removed = 0;
  const seen = new Set();
  const s = stmts(db);
  db.exec('BEGIN');
  try {
    for (const rel of rels) {
      let st;
      try { st = fs.statSync(path.join(baseDir, rel)); } catch { continue; }
      if (st.size > MAX_SIZE) continue;
      seen.add(rel);
      const row = s.selFile.get(rel);
      if (!row || row.mtime_ms !== Math.trunc(st.mtimeMs) || row.size !== st.size) {
        indexFile(db, baseDir, rel, st);
        indexed++;
        if (indexed % CHUNK_SIZE === 0) { db.exec('COMMIT'); db.exec('BEGIN'); }
      }
    }
    for (const { path: rel } of s.selAllFiles.all()) {
      if (!seen.has(rel)) { removeRows(db, rel); removed++; }
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  return { indexed, removed };
}

function refresh(db, root) {
  return syncFiles(db, root, walk(root));
}

function ftsRows(db, terms, limit, mark) {
  const m = mark || ['[', ']'];
  const quoted = terms.map(t => '"' + t.replace(/"/g, '') + '"');
  const sql = "SELECT path, snippet(content_fts, 1, ?, ?, '...', 8) AS snip FROM content_fts WHERE content_fts MATCH ? ORDER BY rank LIMIT " + limit;
  let rows = db.prepare(sql).all(m[0], m[1], quoted.join(' '));
  if (!rows.length && terms.length > 1) rows = db.prepare(sql).all(m[0], m[1], quoted.join(' OR '));
  return rows;
}

function walkDocs(dir) {
  const out = [];
  const rec = (d, relDir) => {
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const rel = relDir ? relDir + '/' + e.name : e.name;
      if (e.isDirectory()) rec(path.join(d, e.name), rel);
      else if (e.isFile() && e.name.endsWith('.md')) out.push(rel);
    }
  };
  rec(dir, '');
  return out;
}

function refreshDocs(db, docsDir) {
  return syncFiles(db, docsDir, walkDocs(docsDir));
}

function updateFile(db, root, relPath) {
  if (path.isAbsolute(relPath)) return false;
  const rel = relPath.split(path.sep).join('/');
  const abs = path.resolve(root, rel);
  const rootResolved = path.resolve(root);
  if (abs !== rootResolved && !abs.startsWith(rootResolved + path.sep)) return false;
  const inCtx = rel.startsWith('.ctx/');
  if (inCtx && (!rel.endsWith('.md') || rel.startsWith('.ctx/sessions/'))) return false;
  if (!inCtx && !isTextFile(rel)) return false;
  if (isIgnored(rel, loadIgnorePrefixes(root))) return false;
  let st;
  try { st = fs.statSync(path.join(root, rel)); } catch {
    db.exec('BEGIN');
    try {
      removeRows(db, rel);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
    return true;
  }
  if (st.size > MAX_SIZE) return false;
  db.exec('BEGIN');
  try {
    indexFile(db, root, rel, st);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  return true;
}

module.exports = { openDb, openDbAt, refresh, refreshDocs, updateFile, ftsRows };
