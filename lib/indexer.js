'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { isTextFile, shouldSkipDir, extractSymbols, extractLinks } = require('./extract');

const MAX_SIZE = 1024 * 1024;

function openDb(root) {
  const db = new DatabaseSync(path.join(root, '.ctx', 'index.db'));
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS files (path TEXT PRIMARY KEY, mtime_ms INTEGER NOT NULL, size INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS symbols (path TEXT NOT NULL, name TEXT NOT NULL, kind TEXT NOT NULL, line INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS idx_symbols_name ON symbols(name);
    CREATE INDEX IF NOT EXISTS idx_symbols_path ON symbols(path);
    CREATE TABLE IF NOT EXISTS links (side TEXT NOT NULL, method TEXT, url TEXT NOT NULL, path TEXT NOT NULL, line INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS idx_links_url ON links(url);
    CREATE VIRTUAL TABLE IF NOT EXISTS content_fts USING fts5(path, text);
  `);
  return db;
}

function walk(root) {
  const out = [];
  const rec = (dir, relDir) => {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const d of entries) {
      const rel = relDir ? relDir + '/' + d.name : d.name;
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
  db.prepare('DELETE FROM symbols WHERE path = ?').run(rel);
  db.prepare('DELETE FROM links WHERE path = ?').run(rel);
  db.prepare('DELETE FROM content_fts WHERE path = ?').run(rel);
  db.prepare('DELETE FROM files WHERE path = ?').run(rel);
}

function indexFile(db, root, rel, st) {
  let text;
  try { text = fs.readFileSync(path.join(root, rel), 'utf8'); } catch { return; }
  removeRows(db, rel);
  db.prepare('INSERT INTO files (path, mtime_ms, size) VALUES (?, ?, ?)').run(rel, Math.trunc(st.mtimeMs), st.size);
  const insSym = db.prepare('INSERT INTO symbols (path, name, kind, line) VALUES (?, ?, ?, ?)');
  for (const s of extractSymbols(rel, text)) insSym.run(rel, s.name, s.kind, s.line);
  const insLink = db.prepare('INSERT INTO links (side, method, url, path, line) VALUES (?, ?, ?, ?, ?)');
  for (const l of extractLinks(rel, text)) insLink.run(l.side, l.method, l.url, rel, l.line);
  db.prepare('INSERT INTO content_fts (path, text) VALUES (?, ?)').run(rel, text);
}

function refresh(db, root) {
  let indexed = 0;
  const seen = new Set();
  for (const rel of walk(root)) {
    let st;
    try { st = fs.statSync(path.join(root, rel)); } catch { continue; }
    if (st.size > MAX_SIZE) continue;
    seen.add(rel);
    const row = db.prepare('SELECT mtime_ms, size FROM files WHERE path = ?').get(rel);
    if (!row || row.mtime_ms !== Math.trunc(st.mtimeMs) || row.size !== st.size) {
      indexFile(db, root, rel, st);
      indexed++;
    }
  }
  let removed = 0;
  for (const { path: rel } of db.prepare('SELECT path FROM files').all()) {
    if (!seen.has(rel)) { removeRows(db, rel); removed++; }
  }
  return { indexed, removed };
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
  let st;
  try { st = fs.statSync(path.join(root, rel)); } catch {
    removeRows(db, rel);
    return true;
  }
  if (st.size > MAX_SIZE) return false;
  indexFile(db, root, rel, st);
  return true;
}

module.exports = { openDb, refresh, updateFile };
