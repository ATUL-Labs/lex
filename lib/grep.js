'use strict';

const fs = require('node:fs');
const path = require('node:path');

const MAX_MATCHES = 10;
const MAX_LINE_LEN = 120;

function extractLiteralTokens(pattern) {
  const tokens = [];
  let current = '';
  let inClass = false;
  let inGroup = false;
  let escaped = false;

  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (escaped) {
      if (/[a-zA-Z0-9_]/.test(c)) current += c;
      escaped = false;
      continue;
    }
    if (c === '\\') { escaped = true; continue; }
    if (c === '[') { inClass = true; if (current) { tokens.push(current); current = ''; } continue; }
    if (c === ']' && inClass) { inClass = false; continue; }
    if (inClass) continue;
    if (c === '(') { inGroup = true; if (current) { tokens.push(current); current = ''; } continue; }
    if (c === ')' && inGroup) { inGroup = false; continue; }
    if (c === '?' || c === '*' || c === '+' || c === '.' || c === '|' || c === '^' || c === '$' || c === '{' || c === '}') {
      if (current) { tokens.push(current); current = ''; }
      continue;
    }
    if (/[a-zA-Z0-9_]/.test(c)) {
      current += c;
    } else {
      if (current) { tokens.push(current); current = ''; }
    }
  }
  if (current) tokens.push(current);
  return tokens.filter(t => t.length >= 2);
}

function grepFiles(root, db, pattern, fileFilter) {
  let regex;
  try { regex = new RegExp(pattern); } catch (e) { return { error: 'invalid regex: ' + e.message }; }

  const tokens = extractLiteralTokens(pattern);
  let candidatePaths = null;

  if (tokens.length > 0) {
    const ftsTerm = tokens.map(t => '"' + t.replace(/"/g, '') + '"').join(' ');
    try {
      const ftsRows = db.prepare("SELECT DISTINCT path FROM content_fts WHERE content_fts MATCH ? ORDER BY rank LIMIT 50").all(ftsTerm);
      candidatePaths = ftsRows.map(r => r.path);
    } catch {}
  }

  let rows;
  if (candidatePaths) {
    const placeholders = candidatePaths.map(() => '?').join(',');
    if (candidatePaths.length > 0) {
      rows = db.prepare("SELECT path FROM files WHERE path IN (" + placeholders + ") AND path NOT LIKE '.lex/%' ORDER BY path").all(...candidatePaths);
    } else {
      rows = [];
    }
  } else {
    rows = db.prepare("SELECT path FROM files WHERE path NOT LIKE '.lex/%' ORDER BY path").all();
  }

  if (fileFilter) {
    const filter = fileFilter.replace(/\\/g, '/');
    rows = rows.filter(r => r.path === filter || r.path.startsWith(filter + '/'));
  }

  const matches = [];
  for (const row of rows) {
    if (matches.length >= MAX_MATCHES) break;
    const full = path.join(root, row.path);
    let content;
    try { content = fs.readFileSync(full, 'utf8'); } catch { continue; }
    const lines = content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      if (regex.test(lines[i])) {
        matches.push(row.path + ':' + (i + 1) + ': ' + lines[i].trim().substring(0, MAX_LINE_LEN));
        if (matches.length >= MAX_MATCHES) break;
      }
    }
  }
  return { matches };
}

module.exports = { grepFiles, extractLiteralTokens };
