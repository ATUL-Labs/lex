'use strict';

/**
 * Memory DB — persistent SQLite index for all memory types.
 *
 * Replaces the pattern of re-reading/re-indexing all .md files on every query.
 * One DB, incremental updates via mtime check, FTS5 for text search,
 * metadata table for fast proactive scoring without file I/O.
 *
 * Tables:
 *   memory_meta   — one row per memory entry (type, title, terms, symbols, source, mtime)
 *   memory_fts    — FTS5 virtual table on title + content
 *   memory_files  — file paths associated with each memory
 *   memory_links  — association edges (cached, incremental)
 *
 * The DB is a derived cache. Source of truth is always .lex/pages/*.md and .lex/sessions/*.md.
 * Can be deleted and rebuilt at any time.
 */

const fs = require('node:fs');
const path = require('node:path');

const dbCacheMap = new Map();

function getDbPath(root) {
  return path.join(root, '.lex', 'memory.db');
}

function openMemoryDb(root) {
  const dbPath = getDbPath(root);
  if (dbCacheMap.has(dbPath)) return dbCacheMap.get(dbPath);

  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(dbPath);

  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS memory_meta (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      source TEXT NOT NULL,
      source_line INTEGER DEFAULT 0,
      content TEXT DEFAULT '',
      preview TEXT DEFAULT '',
      date TEXT,
      age_days INTEGER,
      mtime_ms INTEGER NOT NULL,
      terms TEXT,
      symbols TEXT,
      is_todo INTEGER DEFAULT 0,
      promoted_from TEXT
    );

    CREATE TABLE IF NOT EXISTS memory_files (
      memory_id INTEGER NOT NULL,
      file_path TEXT NOT NULL,
      lines TEXT,
      FOREIGN KEY (memory_id) REFERENCES memory_meta(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS memory_links (
      from_id INTEGER NOT NULL,
      to_id INTEGER NOT NULL,
      score REAL NOT NULL,
      reasons TEXT,
      PRIMARY KEY (from_id, to_id)
    );

    CREATE TABLE IF NOT EXISTS memory_meta_kv (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_meta_type ON memory_meta(type);
    CREATE INDEX IF NOT EXISTS idx_meta_source ON memory_meta(source);
    CREATE INDEX IF NOT EXISTS idx_files_path ON memory_files(file_path);
    CREATE INDEX IF NOT EXISTS idx_links_from ON memory_links(from_id);
  `);

  try {
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(
        title, content, source
      );
    `);
  } catch {}

  dbCacheMap.set(dbPath, db);
  return db;
}

function closeMemoryDb() {
  for (const db of dbCacheMap.values()) {
    try { db.close(); } catch {}
  }
  dbCacheMap.clear();
}

function readSafe(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch { return null; }
}

function extractTerms(text) {
  if (!text) return [];
  const stop = new Set(['the','a','an','is','are','was','were','be','been','being','have','has','had','do','does','did','will','would','could','should','may','might','must','can','to','of','in','for','on','with','at','by','from','as','into','about','than','then','this','that','these','those','it','its','they','them','their','we','you','your','our','my','me','and','or','but','not','no','if','else','when','while','for','function','const','let','var','require','module','exports','return','class','new','try','catch','error','err','file','path','dir','root','true','false','null','undefined','void','use','strict','async','await','what','why','fix','rule','note','how','which','that','this','from','with','they','will','would','could','should','type','key','data','name','value','str','obj','arr','fn','cb','idx','len','num','char']);
  const words = text.replace(/[^\w\s]/g, ' ').split(/\s+/).filter(w => w.length >= 4 && !stop.has(w.toLowerCase()));
  return [...new Set(words)].slice(0, 30);
}

function extractSymbols(text) {
  if (!text) return [];
  const matches = text.match(/\b([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g);
  if (!matches) return [];
  return [...new Set(matches.map(m => m.replace(/\s*\($/, '')))].slice(0, 10);
}

function parseMistakeSections(content) {
  const sections = content.split(/^## /m).slice(1);
  return sections.map((section, i) => {
    const titleMatch = section.match(/^(.+)/);
    const title = titleMatch ? titleMatch[1].trim() : '';
    const numMatch = title.match(/^(\d+)\./);
    const num = numMatch ? parseInt(numMatch[1], 10) : i + 1;
    const dateMatch = section.match(/when:\s*(\d{4}-\d{2}-\d{2})/);
    const ruleMatch = section.match(/rule:\s*(.+)/);
    const fixMatch = section.match(/fix:\s*(.+)/);
    const whatMatch = section.match(/what:\s*(.+)/);
    const promotedMatch = section.match(/promoted_from:\s*(.+)/);
    return {
      type: 'mistake',
      title: title.replace(/^\d+\.\s*/, ''),
      num,
      date: dateMatch ? dateMatch[1] : null,
      what: whatMatch ? whatMatch[1].trim() : '',
      fix: fixMatch ? fixMatch[1].trim() : '',
      rule: ruleMatch ? ruleMatch[1].trim() : '',
      isTodo: section.includes('TODO'),
      promotedFrom: promotedMatch ? promotedMatch[1].trim() : null,
      raw: section.trim(),
      sourceLine: 0,
    };
  });
}

function parseGenericSections(content, type) {
  const sections = content.split(/^## /m).slice(1);
  return sections.map(section => {
    const titleMatch = section.match(/^(.+)/);
    const title = titleMatch ? titleMatch[1].trim() : '';
    const whereMatch = section.match(/where:\s*(.+)/);
    const whatMatch = section.match(/what:\s*(.+)/);
    const dateMatch = section.match(/when:\s*(\d{4}-\d{2}-\d{2})/);
    return {
      type,
      title,
      date: dateMatch ? dateMatch[1] : null,
      what: whatMatch ? whatMatch[1].trim() : '',
      where: whereMatch ? whereMatch[1].trim() : '',
      raw: section.trim(),
      sourceLine: 0,
    };
  });
}

function parseSessionFile(content, filename) {
  const titleMatch = content.match(/^#\s+(.+)/m);
  const title = titleMatch ? titleMatch[1].trim() : filename;
  const dateStr = filename.replace('.md', '');
  const fileSection = content.match(/## Files modified\s*\n([\s\S]*?)(?=\n##|$)/);
  let files = [];
  if (fileSection) {
    files = fileSection[1].split('\n').map(l => l.replace(/^-\s*/, '').trim()).filter(Boolean);
  }
  return {
    type: 'episode',
    title,
    date: dateStr,
    raw: content,
    files,
    sourceLine: 0,
  };
}

function indexPages(db, root) {
  const pagesDir = path.join(root, '.lex', 'pages');
  if (!fs.existsSync(pagesDir)) return 0;

  const files = fs.readdirSync(pagesDir).filter(f => f.endsWith('.md'));
  let count = 0;

  for (const f of files) {
    const filePath = path.join(pagesDir, f);
    const stat = fs.statSync(filePath);
    const source = `pages/${f}`;
    const existing = db.prepare('SELECT id, mtime_ms FROM memory_meta WHERE source = ?').get(source);

    if (existing && existing.mtime_ms === Math.trunc(stat.mtimeMs)) continue;

    if (existing) {
      db.prepare('DELETE FROM memory_meta WHERE id = ?').run(existing.id);
      db.prepare('DELETE FROM memory_files WHERE memory_id = ?').run(existing.id);
    }

    const content = readSafe(filePath) || '';
    const type = f.replace('.md', '');
    let entries;

    if (type === 'mistakes') entries = parseMistakeSections(content);
    else if (type === 'rules') entries = parseGenericSections(content, 'rule');
    else if (type === 'patterns') entries = parseGenericSections(content, 'pattern');
    else if (type === 'design') entries = parseGenericSections(content, 'design');
    else if (type === 'approaches') entries = parseGenericSections(content, 'approach');
    else entries = parseGenericSections(content, type);

    for (const entry of entries) {
      const terms = extractTerms(entry.title + ' ' + (entry.what || '') + ' ' + (entry.rule || '') + ' ' + entry.raw);
      const symbols = extractSymbols(entry.raw);
      const ageDays = entry.date ? Math.floor((Date.now() - new Date(entry.date).getTime()) / 86400000) : null;
      const preview = entry.raw.substring(0, 200);

      const result = db.prepare(
        'INSERT INTO memory_meta (type, title, source, source_line, content, preview, date, age_days, mtime_ms, terms, symbols, is_todo, promoted_from) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)'
      ).run(type, entry.title, source, entry.sourceLine || 0, entry.raw, preview, entry.date || '', ageDays || 0, Math.trunc(stat.mtimeMs), terms.join(','), symbols.join(','), entry.isTodo ? 1 : 0, entry.promotedFrom || '');

      const memId = result.lastInsertRowid;
      db.prepare('INSERT INTO memory_fts (rowid, title, content, source) VALUES (?,?,?,?)').run(memId, entry.title, entry.raw, source);

      if (entry.where) {
        for (const fp of entry.where.split(',').map(s => s.trim()).filter(Boolean)) {
          db.prepare('INSERT INTO memory_files (memory_id, file_path) VALUES (?, ?)').run(memId, fp);
        }
      }
    }

    count++;
  }

  return count;
}

function indexSessions(db, root) {
  const sessionsDir = path.join(root, '.lex', 'sessions');
  if (!fs.existsSync(sessionsDir)) return 0;

  const files = fs.readdirSync(sessionsDir).filter(f => f.endsWith('.md') && f !== '.gitkeep');
  let count = 0;

  for (const f of files) {
    const filePath = path.join(sessionsDir, f);
    const stat = fs.statSync(filePath);
    const source = `sessions/${f}`;
    const existing = db.prepare('SELECT id, mtime_ms FROM memory_meta WHERE source = ?').get(source);

    if (existing && existing.mtime_ms === Math.trunc(stat.mtimeMs)) continue;

    if (existing) {
      db.prepare('DELETE FROM memory_meta WHERE id = ?').run(existing.id);
      db.prepare('DELETE FROM memory_files WHERE memory_id = ?').run(existing.id);
    }

    const content = readSafe(filePath) || '';
    const entry = parseSessionFile(content, f);
    const terms = extractTerms(entry.title + ' ' + content);
    const ageDays = Math.floor((Date.now() - new Date(entry.date).getTime()) / 86400000);
    const preview = content.substring(0, 300);

    const result = db.prepare(
      'INSERT INTO memory_meta (type, title, source, source_line, content, preview, date, age_days, mtime_ms, terms, symbols, is_todo) VALUES (?,?,?,?,?,?,?,?,?,?,?,0)'
    ).run('episode', entry.title, source, 0, content, preview, entry.date || '', ageDays || 0, Math.trunc(stat.mtimeMs), terms.join(','), '');

    const memId = result.lastInsertRowid;
    db.prepare('INSERT INTO memory_fts (rowid, title, content, source) VALUES (?,?,?,?)').run(memId, entry.title, content, source);
    for (const fp of entry.files) {
      db.prepare('INSERT INTO memory_files (memory_id, file_path) VALUES (?, ?)').run(memId, fp);
    }

    count++;
  }

  return count;
}

function refreshMemoryDb(root) {
  const db = openMemoryDb(root);
  db.exec('BEGIN');
  try {
    const pages = indexPages(db, root);
    const sessions = indexSessions(db, root);
    cleanupDeletedMemories(db, root);
    db.exec('COMMIT');
    return { pagesUpdated: pages, sessionsUpdated: sessions };
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

function cleanupDeletedMemories(db, root) {
  const validSources = new Set();

  const pagesDir = path.join(root, '.lex', 'pages');
  if (fs.existsSync(pagesDir)) {
    for (const f of fs.readdirSync(pagesDir).filter(f => f.endsWith('.md'))) {
      validSources.add('pages/' + f);
    }
  }

  const sessionsDir = path.join(root, '.lex', 'sessions');
  if (fs.existsSync(sessionsDir)) {
    for (const f of fs.readdirSync(sessionsDir).filter(f => f.endsWith('.md') && f !== '.gitkeep')) {
      validSources.add('sessions/' + f);
    }
  }

  const allRows = db.prepare('SELECT id, source FROM memory_meta').all();
  for (const row of allRows) {
    if (!validSources.has(row.source)) {
      db.prepare('DELETE FROM memory_meta WHERE id = ?').run(row.id);
      db.prepare('DELETE FROM memory_files WHERE memory_id = ?').run(row.id);
      try { db.prepare('DELETE FROM memory_fts WHERE rowid = ?').run(row.id); } catch {}
    }
  }

  try {
    db.prepare('DELETE FROM memory_fts WHERE rowid NOT IN (SELECT id FROM memory_meta)').run();
  } catch {}
}

function searchMemoryDb(root, terms, options) {
  const db = openMemoryDb(root);
  const limit = (options && options.limit) || 10;
  const type = options && options.type;

  const cleanTerms = terms.map(t => t.replace(/"/g, ''));
  const safeTerms = cleanTerms.map(t => t.replace(/[+\-*()":]/g, ' ').trim()).filter(Boolean);
  if (!safeTerms.length) return [];

  const matchExpr = safeTerms.map(t => t + '*').join(' ');
  const typeFilter = type ? ' AND m.type = ?' : '';
  const typeArg = type ? [type] : [];

  try {
    let rows = db.prepare(
      `SELECT m.id, m.type, m.title, m.source, m.preview, m.date, m.age_days, m.terms, m.symbols
       FROM memory_fts f
       JOIN memory_meta m ON m.id = f.rowid
       WHERE memory_fts MATCH ?${typeFilter}
       ORDER BY rank LIMIT ?`
    ).all(matchExpr, ...typeArg, limit);

    if (!rows.length) {
      rows = db.prepare(
        `SELECT m.id, m.type, m.title, m.source, m.preview, m.date, m.age_days, m.terms, m.symbols
         FROM memory_fts f
         JOIN memory_meta m ON m.id = f.rowid
         WHERE memory_fts MATCH ?${typeFilter}
         ORDER BY rank LIMIT ?`
      ).all(safeTerms.join(' OR ') + '*', ...typeArg, limit);
    }

    return rows.map(r => ({
      id: r.id,
      type: r.type,
      title: r.title,
      source: r.source,
      preview: r.preview,
      date: r.date,
      ageDays: r.age_days,
      terms: r.terms ? r.terms.split(',') : [],
      symbols: r.symbols ? r.symbols.split(',') : [],
    }));
  } catch {
    return [];
  }
}

function getMemoriesByFile(root, filePath, options) {
  const db = openMemoryDb(root);
  const limit = (options && options.limit) || 10;

  const rows = db.prepare(
    `SELECT DISTINCT m.id, m.type, m.title, m.source, m.preview, m.date, m.age_days, m.terms, m.symbols
     FROM memory_meta m
     JOIN memory_files mf ON mf.memory_id = m.id
     WHERE mf.file_path = ? OR mf.file_path LIKE ?
     ORDER BY m.age_days ASC NULLS LAST
     LIMIT ?`
  ).all(filePath, '%' + filePath + '%', limit);

  return rows.map(r => ({
    id: r.id,
    type: r.type,
    title: r.title,
    source: r.source,
    preview: r.preview,
    date: r.date,
    ageDays: r.age_days,
    terms: r.terms ? r.terms.split(',') : [],
    symbols: r.symbols ? r.symbols.split(',') : [],
  }));
}

function getAllMemories(root, options) {
  const db = openMemoryDb(root);
  const type = options && options.type;
  const limit = (options && options.limit) || 1000;

  let rows;
  if (type) {
    rows = db.prepare('SELECT * FROM memory_meta WHERE type = ? ORDER BY id LIMIT ?').all(type, limit);
  } else {
    rows = db.prepare('SELECT * FROM memory_meta ORDER BY id LIMIT ?').all(limit);
  }

  return rows.map(r => ({
    id: r.id,
    type: r.type,
    title: r.title,
    source: r.source,
    preview: r.preview,
    date: r.date,
    ageDays: r.age_days,
    terms: r.terms ? r.terms.split(',') : [],
    symbols: r.symbols ? r.symbols.split(',') : [],
    isTodo: r.is_todo,
    promotedFrom: r.promoted_from,
  }));
}

function getRelatedFromDb(root, memoryId, limit) {
  const db = openMemoryDb(root);
  const rows = db.prepare(
    'SELECT to_id, score, reasons FROM memory_links WHERE from_id = ? ORDER BY score DESC LIMIT ?'
  ).all(memoryId, limit || 5);

  const result = [];
  for (const r of rows) {
    const meta = db.prepare('SELECT type, title, source, preview FROM memory_meta WHERE id = ?').get(r.to_id);
    if (meta) {
      result.push({
        id: r.to_id,
        type: meta.type,
        title: meta.title,
        source: meta.source,
        preview: meta.preview,
        score: r.score,
        reasons: r.reasons ? r.reasons.split(',') : [],
      });
    }
  }
  return result;
}

function saveLinksToDb(root, links, options) {
  const db = openMemoryDb(root);
  const incremental = options && options.incremental;
  if (!incremental) {
    db.exec('DELETE FROM memory_links');
  }
  const stmt = db.prepare('INSERT OR REPLACE INTO memory_links (from_id, to_id, score, reasons) VALUES (?,?,?,?)');
  db.exec('BEGIN');
  try {
    for (const [fromId, related] of Object.entries(links)) {
      for (const r of related) {
        stmt.run(parseInt(fromId), parseInt(r.target_id || r.to_id), r.score, (r.reasons || []).join(','));
      }
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

function getStats(root) {
  const db = openMemoryDb(root);
  const total = db.prepare('SELECT COUNT(*) as c FROM memory_meta').get().c;
  const byType = db.prepare('SELECT type, COUNT(*) as c FROM memory_meta GROUP BY type').all();
  const links = db.prepare('SELECT COUNT(*) as c FROM memory_links').get().c;
  return {
    total,
    byType: byType.reduce((acc, r) => { acc[r.type] = r.c; return acc; }, {}),
    links,
  };
}

function getLastBuiltId(root) {
  const db = openMemoryDb(root);
  const row = db.prepare("SELECT value FROM memory_meta_kv WHERE key = 'last_built_id'").get();
  return row ? parseInt(row.value, 10) : 0;
}

function setLastBuiltId(root, id) {
  const db = openMemoryDb(root);
  db.prepare("INSERT OR REPLACE INTO memory_meta_kv (key, value) VALUES ('last_built_id', ?)").run(String(id));
}

module.exports = {
  openMemoryDb,
  closeMemoryDb,
  refreshMemoryDb,
  searchMemoryDb,
  getMemoriesByFile,
  getAllMemories,
  getRelatedFromDb,
  saveLinksToDb,
  getStats,
  getLastBuiltId,
  setLastBuiltId,
  extractTerms,
  extractSymbols,
};
