'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { DatabaseSync } = require('node:sqlite');
const { isTextFile, shouldSkipDir, extractSymbols, extractLinks, extractSchema } = require('./extract');
const { shouldSkipFile, isDataDumpDir } = require('./skip');

const stmtCache = new WeakMap();

const AGENT_CONFIG_DEFAULTS = {
  require_wip: true,
  require_guard_before_commit: true,
  block_commit_on_critical: true,
  auto_audit_log: true,
  warn_no_wip_on_edit: true,
};

function loadAgentConfig(root) {
  try {
    const raw = fs.readFileSync(path.join(root, '.lex', 'agent.json'), 'utf8');
    return { ...AGENT_CONFIG_DEFAULTS, ...JSON.parse(raw) };
  } catch { return { ...AGENT_CONFIG_DEFAULTS }; }
}

function openDbAt(dbFile) {
  const db = new DatabaseSync(dbFile);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    PRAGMA synchronous = NORMAL;
    PRAGMA cache_size = -65536;
    PRAGMA temp_store = MEMORY;
    PRAGMA mmap_size = 268435456;
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
    CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
  `);
  return db;
}

function shouldRefresh(db, maxAgeMs) {
  const REFRESH_TTL = maxAgeMs || 30000;
  try {
    const row = db.prepare("SELECT value FROM meta WHERE key = 'last_refresh'").get();
    if (row) {
      const elapsed = Date.now() - parseInt(row.value, 10);
      if (elapsed < REFRESH_TTL) return false;
    }
  } catch {}
  return true;
}

function markRefreshed(db) {
  try { db.prepare("INSERT OR REPLACE INTO meta(key, value) VALUES('last_refresh', ?)").run(String(Date.now())); } catch {}
}

function openDb(root) {
  return openDbAt(path.join(root, '.lex', 'index.db'));
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
  const prefixes = [];
  for (const p of [path.join(root, '.lexignore'), path.join(root, '.lex', 'ignore')]) {
    let text;
    try { text = fs.readFileSync(p, 'utf8'); } catch { continue; }
    for (const l of text.split('\n')) {
      const cleaned = l.trim().replace(/\\/g, '/');
      if (cleaned && !cleaned.startsWith('#')) prefixes.push(cleaned);
    }
  }
  return prefixes;
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
        if (relDir === '' && d.name === '.lex') { rec(path.join(dir, d.name), rel); continue; }
        if (relDir === '.lex' && (d.name === 'pages' || d.name === 'sessions')) continue;
        if (d.name.startsWith('.') || shouldSkipDir(d.name)) continue;
        if (isDataDumpDir(rel)) continue;
        rec(path.join(dir, d.name), rel);
      } else if (d.isFile()) {
        if (relDir.startsWith('.lex')) { if (d.name.endsWith('.md')) out.push(rel); continue; }
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
  try { text = fs.readFileSync(path.join(root, rel), 'utf8'); } catch { return false; }
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
  return true;
}

const CHUNK_SIZE = 1000;

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
      if (shouldSkipFile(rel, st.size)) continue;
      seen.add(rel);
      const row = s.selFile.get(rel);
      if (!row || row.mtime_ms !== Math.trunc(st.mtimeMs) || row.size !== st.size) {
        if (indexFile(db, baseDir, rel, st)) {
          indexed++;
          if (indexed % CHUNK_SIZE === 0) { db.exec('COMMIT'); db.exec('BEGIN'); }
        }
      }
    }
    for (const { path: rel } of s.selAllFiles.all()) {
      if (!seen.has(rel)) { removeRows(db, rel); removed++; }
    }
    db.exec('COMMIT');
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch {}
    throw e;
  }
  return { indexed, removed };
}

function refresh(db, root) {
  const r = syncFiles(db, root, walk(root));
  markRefreshed(db);
  invalidateSearchCache();
  try { db.exec('PRAGMA wal_checkpoint(PASSIVE)'); } catch {}
  return r;
}

const MAX_WORKERS = 4;
const WORKER_THRESHOLD = 200;

function getWorkerCount() {
  const numCpus = os.cpus().length;
  return Math.max(1, Math.min(numCpus - 1, MAX_WORKERS));
}

function refreshWithWorkers(db, root, onProgress) {
  const { Worker } = require('node:worker_threads');
  const allFiles = walk(root);
  const s = stmts(db);

  const stale = [];
  const seen = new Set();
  for (const rel of allFiles) {
    let st;
    try { st = fs.statSync(path.join(root, rel)); } catch { continue; }
    if (shouldSkipFile(rel, st.size)) continue;
    seen.add(rel);
    const row = s.selFile.get(rel);
    if (!row || row.mtime_ms !== Math.trunc(st.mtimeMs) || row.size !== st.size) {
      stale.push(rel);
    }
  }

  if (stale.length < WORKER_THRESHOLD) {
    let indexed = 0;
    let removed = 0;
    db.exec('BEGIN');
    try {
      for (const rel of stale) {
        let st;
        try { st = fs.statSync(path.join(root, rel)); } catch { continue; }
        if (indexFile(db, root, rel, st)) {
          indexed++;
          if (indexed % CHUNK_SIZE === 0) { db.exec('COMMIT'); db.exec('BEGIN'); }
        }
      }
      for (const { path: rel } of s.selAllFiles.all()) {
        if (!seen.has(rel)) { removeRows(db, rel); removed++; }
      }
      db.exec('COMMIT');
    } catch (e) {
      try { db.exec('ROLLBACK'); } catch {}
      return Promise.reject(e);
    }
    markRefreshed(db);
    invalidateSearchCache();
    try { db.exec('PRAGMA wal_checkpoint(PASSIVE)'); } catch {}
    return Promise.resolve({ indexed, removed });
  }

  const numWorkers = getWorkerCount();
  const chunkSize = Math.ceil(stale.length / numWorkers);
  const chunks = [];
  for (let i = 0; i < numWorkers; i++) {
    chunks.push(stale.slice(i * chunkSize, (i + 1) * chunkSize));
  }

  let indexed = 0;
  let removed = 0;
  let workersDone = 0;
  let batchBuffer = [];
  let finished = false;
  const workerRefs = [];

  return new Promise((resolve, reject) => {
    const writeBatch = () => {
      if (!batchBuffer.length) return;
      db.exec('BEGIN');
      try {
        for (const result of batchBuffer) {
          writeExtractedResult(db, result, root);
          indexed++;
          if (indexed % CHUNK_SIZE === 0) { db.exec('COMMIT'); db.exec('BEGIN'); }
        }
        db.exec('COMMIT');
      } catch (e) {
        try { db.exec('ROLLBACK'); } catch {}
        throw e;
      }
      batchBuffer = [];
    };

    const terminateAllWorkers = () => {
      for (const w of workerRefs) {
        try { w.terminate(); } catch {}
      }
    };

    const finishUp = () => {
      if (finished) return;
      finished = true;
      terminateAllWorkers();
      try {
        writeBatch();
        db.exec('BEGIN');
        for (const { path: rel } of s.selAllFiles.all()) {
          if (!seen.has(rel)) { removeRows(db, rel); removed++; }
        }
        db.exec('COMMIT');
      } catch (e) {
        try { db.exec('ROLLBACK'); } catch {}
        reject(e);
        return;
      }
      markRefreshed(db);
      invalidateSearchCache();
      try { db.exec('PRAGMA wal_checkpoint(PASSIVE)'); } catch {}
      resolve({ indexed, removed });
    };

    for (let i = 0; i < numWorkers; i++) {
      const worker = new Worker(path.join(__dirname, 'index-worker.js'), {
        workerData: { root, files: chunks[i] },
      });
      workerRefs.push(worker);

      worker.on('message', (msg) => {
        if (finished) return;
        if (msg.type === 'file') {
          batchBuffer.push(msg.data);
          if (batchBuffer.length >= 50) {
            try { writeBatch(); } catch (e) {
              if (!finished) { finished = true; terminateAllWorkers(); }
              reject(e);
              return;
            }
          }
        } else if (msg.type === 'progress') {
          if (onProgress) onProgress(msg.done, msg.total, indexed);
        } else if (msg.type === 'done') {
          workersDone++;
          if (workersDone === numWorkers) finishUp();
        }
      });

      worker.on('error', (err) => {
        if (finished) return;
        finished = true;
        terminateAllWorkers();
        try { console.error('[lex] Worker error, falling back to sync:', err.message); } catch {}
        try {
          for (let j = 0; j < numWorkers; j++) {
            for (const rel of chunks[j]) {
              try {
                const st = fs.statSync(path.join(root, rel));
                if (shouldSkipFile(rel, st.size)) continue;
                db.exec('BEGIN');
                try {
                  if (indexFile(db, root, rel, st)) {
                    db.exec('COMMIT');
                    indexed++;
                  } else {
                    db.exec('COMMIT');
                  }
                } catch {
                  try { db.exec('ROLLBACK'); } catch {}
                }
              } catch {}
            }
          }
          db.exec('BEGIN');
          for (const { path: rel } of s.selAllFiles.all()) {
            if (!seen.has(rel)) { removeRows(db, rel); removed++; }
          }
          db.exec('COMMIT');
        } catch (e) {
          try { db.exec('ROLLBACK'); } catch {}
          reject(e);
          return;
        }
        markRefreshed(db);
        invalidateSearchCache();
        try { db.exec('PRAGMA wal_checkpoint(PASSIVE)'); } catch {}
        resolve({ indexed, removed });
      });
    }
  });
}

function writeExtractedResult(db, result, root) {
  const s = stmts(db);
  removeRows(db, result.path);
  s.insFile.run(result.path, result.mtimeMs, result.size);
  for (const sym of result.symbols) s.insSym.run(result.path, sym.name, sym.kind, sym.line);
  for (const l of result.links) s.insLink.run(l.side, l.method, l.url, result.path, l.line);
  for (const t of result.schemaTables) s.insSchemaTable.run(t.name, result.path, t.line);
  for (const c of result.schemaColumns) s.insSchemaColumn.run(c.table, c.name, c.type, c.fkTable, c.fkColumn, result.path, c.line);
  let text = '';
  try { text = fs.readFileSync(path.join(root, result.path), 'utf8'); } catch {}
  s.insFts.run(result.path, text);
}

const SEARCH_CACHE_TTL = 5000;
const SEARCH_CACHE_MAX = 100;
const searchCache = new Map();

function invalidateSearchCache() {
  searchCache.clear();
}

function evictSearchCache() {
  if (searchCache.size > SEARCH_CACHE_MAX) {
    const oldest = searchCache.keys().next().value;
    searchCache.delete(oldest);
  }
}

function ftsRows(db, terms, limit, mark, root, scope) {
  const m = mark || ['[', ']'];
  const cacheKey = terms.join('\u0000') + '|' + limit + '|' + (scope || '') + '|' + m[0] + m[1];
  const cached = searchCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < SEARCH_CACHE_TTL) {
    return cached.rows.map(r => ({ path: r.path, snip: r.snip, line: r.line }));
  }

  const cleanTerms = terms.map(t => t.replace(/"/g, ''));
  const quoted = cleanTerms.map(t => '"' + t + '"');
  const safeTerms = cleanTerms.map(t => t.replace(/[+\-*()":]/g, ' ').trim()).filter(Boolean);
  const prefixQ = safeTerms.map(t => t + '*');
  const scopeFilter = scope ? " AND path LIKE ? || '%' " : '';
  const scopeArg = scope ? [scope.replace(/\\/g, '/').replace(/\/+$/, '') + '/'] : [];
  const sql = "SELECT path, snippet(content_fts, 1, ?, ?, '...', 8) AS snip FROM content_fts WHERE content_fts MATCH ?" + scopeFilter + " ORDER BY rank LIMIT " + limit;

  const runQ = (matchExpr) => scope ? db.prepare(sql).all(m[0], m[1], matchExpr, ...scopeArg) : db.prepare(sql).all(m[0], m[1], matchExpr);

  // 1. Exact phrase match
  let rows = runQ(quoted.join(' '));
  // 2. OR match (any term)
  if (!rows.length && cleanTerms.length > 1) rows = runQ(quoted.join(' OR '));
  // 3. Prefix match (col* matches color, column)
  if (!rows.length && prefixQ.length) rows = runQ(prefixQ.join(' '));
  if (!rows.length && prefixQ.length > 1) rows = runQ(prefixQ.join(' OR '));
  // 4. Fuzzy: try progressively shorter prefixes for typo tolerance
  if (!rows.length && safeTerms.length) {
    for (let plen = Math.max(2, safeTerms[0].length - 2); plen >= 2 && !rows.length; plen--) {
      const fuzzy = safeTerms.map(t => t.substring(0, Math.min(plen, t.length)) + '*');
      rows = runQ(fuzzy.join(' OR '));
    }
  }

  for (const r of rows) {
    r.line = 0;
    const stripped = r.snip.replace(/[\[\]<>]/g, '').replace(/\.\.\./g, '').trim();
    for (const term of cleanTerms) {
      const idx = stripped.toLowerCase().indexOf(term.toLowerCase());
      if (idx >= 0) {
        r.line = findLineNumber(r.path, term, root);
        if (r.line) break;
      }
    }
  }

  evictSearchCache();
  searchCache.set(cacheKey, { ts: Date.now(), rows });
  return rows;
}

function findLineNumber(relPath, fragment, root) {
  try {
    const full = root ? path.join(root, relPath) : relPath;
    const content = fs.readFileSync(full, 'utf8');
    const lines = content.split(/\r?\n/);
    const search = fragment.toLowerCase();
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].toLowerCase().includes(search)) {
        return i + 1;
      }
    }
  } catch {}
  return 0;
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
  const inCtx = rel.startsWith('.lex/');
  if (inCtx && (rel.startsWith('.lex/pages/') || rel.startsWith('.lex/sessions/'))) return false;
  if (!inCtx && !isTextFile(rel)) return false;
  if (isIgnored(rel, loadIgnorePrefixes(root))) return false;
  let st;
  try { st = fs.statSync(path.join(root, rel)); } catch {
    invalidateSearchCache();
    db.exec('BEGIN');
    try {
      removeRows(db, rel);
      db.exec('COMMIT');
    } catch (err) {
      try { db.exec('ROLLBACK'); } catch {}
      throw err;
    }
    return true;
  }
  if (shouldSkipFile(rel, st.size)) return false;
  invalidateSearchCache();
  db.exec('BEGIN');
  try {
    indexFile(db, root, rel, st);
    db.exec('COMMIT');
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch {}
    throw err;
  }
  return true;
}

module.exports = { openDb, openDbAt, refresh, refreshWithWorkers, refreshDocs, updateFile, ftsRows, walk, loadIgnorePrefixes, loadAgentConfig, shouldRefresh, markRefreshed, invalidateSearchCache, shouldSkipFile };
