'use strict';

/**
 * Gateway code commands: symbols, grep, read, patch, insert, rename, delete
 */

const fs = require('node:fs');
const path = require('node:path');

function handle(cmd, args, root, ensureFreshIndex) {
  // --- symbols ---
  if (cmd === 'symbols') {
    const db = ensureFreshIndex(root);
    const rel = (Array.isArray(args) ? args[0] : args).split(path.sep).join('/');
    const rows = db.prepare('SELECT line, kind, name FROM symbols WHERE path = ? ORDER BY line LIMIT 40').all(rel);
    if (!rows.length) return { ok: true, output: 'no symbols indexed for ' + rel };
    const lines = rows.map(r => `${r.line} ${r.kind} ${r.name}`);
    return { ok: true, output: lines.join('\n'), count: rows.length };
  }

  // --- grep ---
  if (cmd === 'grep') {
    const { grepFiles } = require('../grep');
    const db = ensureFreshIndex(root);
    const pattern = Array.isArray(args) ? args[0] : args;
    const fileFilter = Array.isArray(args) ? args[1] : null;
    const result = grepFiles(root, db, pattern, fileFilter);
    if (result.error) return { ok: false, error: result.error };
    if (!result.matches.length) return { ok: true, output: 'no matches', count: 0 };
    return { ok: true, output: result.matches.join('\n'), count: result.matches.length };
  }

  // --- read ---
  if (cmd === 'read') {
    const file = Array.isArray(args) ? args[0] : args;
    const range = Array.isArray(args) && args[1] ? args[1].split('-').map(Number) : [null, null];
    const full = path.isAbsolute(file) ? file : path.join(root, file);
    if (!fs.existsSync(full)) return { ok: false, error: 'file not found: ' + file };
    const content = fs.readFileSync(full, 'utf8');
    const lines = content.split(/\r?\n/);
    const start = range[0] ? Math.max(0, range[0] - 1) : 0;
    const end = range[1] ? Math.min(lines.length, range[1]) : lines.length;
    const result = [];
    for (let i = start; i < end; i++) {
      result.push(`${i + 1}\t${lines[i]}`);
    }
    return { ok: true, output: result.join('\n'), count: end - start };
  }

  // --- patch ---
  if (cmd === 'patch') {
    const { patch } = require('../patch');
    const p = Array.isArray(args) ? args[0] : args;
    if (!p.file || !p.anchor) return { ok: false, error: 'patch requires file and anchor' };
    const filePath = path.isAbsolute(p.file) ? p.file : path.join(root, p.file);
    const r = patch(filePath, p.anchor, p.insertion || '', p.mode || 'after', { root, preview: p.preview, occurrence: p.occurrence, line: p.line });
    const parts = [];
    if (r.ok) {
      parts.push(`OK  ${p.file}  ${r.message}`);
      if (r.backup) parts.push(`backup: ${r.backup}`);
      if (r.diff) { parts.push('--- diff ---'); parts.push(r.diff); }
      if (r.context) { parts.push('--- context ---'); parts.push(r.context); }
    } else {
      parts.push(`FAIL  ${p.file}  ${r.message}`);
      if (r.context) { parts.push('--- context ---'); parts.push(r.context); }
      if (r.suggestion) parts.push('hint: ' + r.suggestion);
    }
    return { ok: r.ok, output: parts.join('\n'), backup: r.backup };
  }

  // --- insert ---
  if (cmd === 'insert') {
    const { patch } = require('../patch');
    const p = Array.isArray(args) ? args[0] : args;
    if (!p.file || (!p.after && !p.before)) return { ok: false, error: 'insert requires file and after/before anchor' };
    const anchor = p.after || p.before;
    const mode = p.after ? 'after' : 'before';
    const filePath = path.isAbsolute(p.file) ? p.file : path.join(root, p.file);
    const r = patch(filePath, anchor, p.line || p.insertion || '', mode, { root, preview: p.preview, occurrence: p.occurrence, line: p.lineNum });
    const parts = [];
    if (r.ok) {
      parts.push(`OK  ${p.file}  ${r.message}`);
      if (r.backup) parts.push(`backup: ${r.backup}`);
      if (r.diff) { parts.push('--- diff ---'); parts.push(r.diff); }
      if (r.context) { parts.push('--- context ---'); parts.push(r.context); }
    } else {
      parts.push(`FAIL  ${p.file}  ${r.message}`);
      if (r.context) { parts.push('--- context ---'); parts.push(r.context); }
      if (r.suggestion) parts.push('hint: ' + r.suggestion);
    }
    return { ok: r.ok, output: parts.join('\n'), backup: r.backup };
  }

  // --- rename ---
  if (cmd === 'rename') {
    const { renameAll } = require('../patch');
    const p = Array.isArray(args) ? args[0] : args;

    if (!p.file) {
      if (!p.from || !p.to) return { ok: false, error: 'rename requires from and to (and optionally file for single-file mode)' };
      const { openDb } = require('../indexer');
      let db;
      try { db = openDb(root); } catch { return { ok: false, error: 'index not found - run lex refresh first' }; }
      const ftsRows = db.prepare("SELECT DISTINCT path FROM content_fts WHERE content_fts MATCH ? LIMIT 50").all('"' + p.from.replace(/"/g, '') + '"');
      const symRows = db.prepare("SELECT DISTINCT path FROM symbols WHERE name = ? LIMIT 50").all(p.from);
      db.close();
      const allPaths = [...new Set([...ftsRows.map(r => r.path), ...symRows.map(r => r.path)])];
      if (!allPaths.length) return { ok: false, error: `symbol "${p.from}" not found in any indexed file` };

      const results = [];
      let totalRenamed = 0;
      let failed = 0;
      for (const relPath of allPaths) {
        const filePath = path.join(root, relPath);
        if (!fs.existsSync(filePath)) continue;
        const r = renameAll(filePath, p.from, p.to, { root, preview: p.preview });
        if (r.ok) {
          totalRenamed += r.matches ? r.matches.length : 0;
          results.push(`  ${relPath}: ${r.matches.length} occurrences (lines ${r.matches.map(m => m.line).join(',')})`);
        } else {
          failed++;
          results.push(`  ${relPath}: SKIP - ${r.message}`);
        }
      }
      const parts = [];
      parts.push(`renamed "${p.from}" -> "${p.to}" in ${allPaths.length - failed} files (${totalRenamed} total occurrences)`);
      parts.push(...results);
      return { ok: true, output: parts.join('\n'), filesChanged: allPaths.length - failed, totalRenamed };
    }

    if (!p.from || !p.to) return { ok: false, error: 'rename requires file, from, and to' };
    const filePath = path.isAbsolute(p.file) ? p.file : path.join(root, p.file);
    const r = renameAll(filePath, p.from, p.to, { root, preview: p.preview });
    const parts = [];
    if (r.ok) {
      parts.push(`OK  ${p.file}  ${r.message}`);
      if (r.backup) parts.push(`backup: ${r.backup}`);
      if (r.matches) parts.push(`lines: ${r.matches.map(m => m.line).join(', ')}`);
      if (r.diff) { parts.push('--- diff ---'); parts.push(r.diff); }
      if (r.context) { parts.push('--- context ---'); parts.push(r.context); }
    } else {
      parts.push(`FAIL  ${p.file}  ${r.message}`);
    }
    return { ok: r.ok, output: parts.join('\n'), backup: r.backup };
  }

  // --- delete ---
  if (cmd === 'delete') {
    const { rm } = require('../fileops');
    const fileArg = Array.isArray(args) ? args[0] : args;
    if (!fileArg) return { ok: false, error: 'delete requires a file path' };
    const r = rm(root, fileArg);
    if (!r.ok) return { ok: false, error: r.message };
    return { ok: true, output: `deleted ${fileArg} -> ${r.message}` };
  }

  return null;
}

module.exports = { handle };
