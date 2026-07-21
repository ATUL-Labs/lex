'use strict';

/**
 * Gateway meta commands: diff, refs, recent, links, guard, check
 */

const fs = require('node:fs');
const path = require('node:path');

function handle(cmd, args, root, ensureFreshIndex) {
  // --- diff ---
  if (cmd === 'diff') {
    const { openDb, walk } = require('../indexer');
    let db;
    try { db = openDb(root); } catch { return { ok: false, error: 'index not found - run lex refresh first' }; }
    const indexedFiles = db.prepare('SELECT path, mtime_ms, size FROM files').all();
    const indexedMap = new Map();
    for (const f of indexedFiles) indexedMap.set(f.path, f);
    const onDisk = new Set();
    const diskFiles = walk(root);
    const modified = [];
    const added = [];
    const deleted = [];
    for (const rel of diskFiles) {
      onDisk.add(rel);
      let st;
      try { st = fs.statSync(path.join(root, rel)); } catch { continue; }
      const row = indexedMap.get(rel);
      if (!row) {
        added.push(rel);
      } else if (row.mtime_ms !== Math.trunc(st.mtimeMs) || row.size !== st.size) {
        modified.push({ path: rel, mtime: st.mtimeMs, size: st.size });
      }
    }
    for (const f of indexedFiles) {
      if (!onDisk.has(f.path) && !f.path.startsWith('.lex/')) deleted.push(f.path);
    }
    const modifiedWithChanges = [];
    if (modified.length) {
      const placeholders = modified.map(() => '?').join(',');
      const contentRows = db.prepare(`SELECT path, text FROM content_fts WHERE path IN (${placeholders})`).all(...modified.map(m => m.path));
      const contentMap = new Map();
      for (const r of contentRows) contentMap.set(r.path, r.text);
      for (const m of modified) {
        let addedLines = 0, removedLines = 0;
        try {
          const newContent = fs.readFileSync(path.join(root, m.path), 'utf8');
          const oldLines = (contentMap.get(m.path) || '').split(/\r?\n/);
          const newLines = newContent.split(/\r?\n/);
          let prefix = 0;
          while (prefix < oldLines.length && prefix < newLines.length && oldLines[prefix] === newLines[prefix]) prefix++;
          let suffix = 0;
          while (suffix < oldLines.length - prefix && suffix < newLines.length - prefix && oldLines[oldLines.length - 1 - suffix] === newLines[newLines.length - 1 - suffix]) suffix++;
          removedLines = oldLines.length - prefix - suffix;
          addedLines = newLines.length - prefix - suffix;
        } catch {}
        modifiedWithChanges.push({ path: m.path, added: addedLines, removed: removedLines });
      }
    }
    db.close();
    if (!modifiedWithChanges.length && !added.length && !deleted.length) {
      return { ok: true, output: 'no changes - index is in sync' };
    }
    const lines = [];
    let totalAdd = 0, totalRem = 0;
    for (const m of modifiedWithChanges) {
      const sign = m.added > m.removed ? '+' : m.added < m.removed ? '-' : '~';
      lines.push(`M  ${m.path}  ${sign}${m.added}+${m.removed}-`);
      totalAdd += m.added;
      totalRem += m.removed;
    }
    for (const f of added) lines.push(`A  ${f}`);
    for (const f of deleted) lines.push(`D  ${f}`);
    lines.push(`${modifiedWithChanges.length}M ${added.length}A ${deleted.length}D  ${totalAdd}+ ${totalRem}-`);
    return { ok: true, output: lines.join('\n'), modified: modifiedWithChanges.length, added: added.length, deleted: deleted.length };
  }

  // --- refs ---
  if (cmd === 'refs') {
    const db = ensureFreshIndex(root);
    const symbol = Array.isArray(args) ? args[0] : args;
    const rows = db.prepare('SELECT path, name, kind, line FROM symbols WHERE name = ? ORDER BY path LIMIT 50').all(symbol);
    const ftsRows = db.prepare("SELECT path, snippet(content_fts, 1, '[[', ']]', '...', 6) AS snip FROM content_fts WHERE content_fts MATCH ? ORDER BY rank LIMIT 30").all('"' + symbol.replace(/"/g, '') + '"');
    const parts = [];
    if (rows.length) {
      parts.push('definitions:');
      for (const r of rows) parts.push('  ' + r.path + ':' + r.line + ' ' + r.kind + ' ' + r.name);
    }
    const defPaths = new Set(rows.map(r => r.path));
    const refMap = new Map();
    for (const r of ftsRows) { if (!refMap.has(r.path)) refMap.set(r.path, r.snip); }
    const refs = [...refMap.entries()].filter(([p]) => !defPaths.has(p));
    if (refs.length) {
      parts.push('references:');
      for (const [p, snip] of refs) parts.push('  ' + p + ': ' + snip.replace(/\s+/g, ' '));
    }
    if (!parts.length) return { ok: true, output: 'no references found for ' + symbol };
    return { ok: true, output: parts.join('\n') };
  }

  // --- recent ---
  if (cmd === 'recent') {
    const limit = (Array.isArray(args) ? args[0] : args) || 20;
    const auditPath = path.join(root, '.lex', 'audit.log');
    let lines = [];
    try { lines = fs.readFileSync(auditPath, 'utf8').trim().split('\n'); } catch {}
    if (!lines.length || !lines[0]) return { ok: true, output: 'no recent activity' };
    const seen = new Set();
    const results = [];
    for (let i = lines.length - 1; i >= 0 && results.length < limit; i--) {
      const parts = lines[i].split('|').map(s => s.trim());
      if (parts.length < 5) continue;
      const file = parts[4];
      if (seen.has(file)) continue;
      seen.add(file);
      results.push(`${parts[0]}  ${parts[3].padEnd(8)} ${file}`);
    }
    return { ok: true, output: results.join('\n') };
  }

  // --- links ---
  if (cmd === 'links') {
    const { openDb } = require('../indexer');
    const { normalizeUrl } = require('../extract');
    let db;
    try { db = openDb(root); } catch { return { ok: false, error: 'index not found - run lex refresh first' }; }
    const urlArg = Array.isArray(args) ? args[0] : args;
    if (!urlArg) {
      const all = db.prepare('SELECT side, method, url, path, line FROM links ORDER BY url, side LIMIT 50').all();
      db.close();
      if (!all.length) return { ok: true, output: 'no links indexed' };
      const lines = all.map(r => `${r.side} ${r.method || '-'} ${r.url} ${r.path}:${r.line}`);
      return { ok: true, output: lines.join('\n'), count: all.length };
    }
    const url = normalizeUrl(urlArg.startsWith('/') ? urlArg : '/' + urlArg);
    const rows = db.prepare('SELECT side, method, url, path, line FROM links WHERE url = ? OR url LIKE ? ORDER BY side, path LIMIT 40').all(url, url + '/%');
    db.close();
    if (!rows.length) return { ok: true, output: 'no links match ' + url };
    const lines = rows.map(r => `${r.side} ${r.method || '-'} ${r.url} ${r.path}:${r.line}`);
    return { ok: true, output: lines.join('\n'), count: rows.length };
  }

  // --- guard ---
  if (cmd === 'guard') {
    const patterns = [
      { re: /(?:api[_-]?key|apikey|secret|token|password|passwd|pwd)\s*[:=]\s*['"][^'"]{8,}['"]/i, msg: 'possible hardcoded secret' },
      { re: /AKIA[0-9A-Z]{16}/, msg: 'AWS access key' },
      { re: /ghp_[A-Za-z0-9]{36}/, msg: 'GitHub personal access token' },
      { re: /sk-[A-Za-z0-9]{20,}/, msg: 'OpenAI API key' },
    ];
    const { walk } = require('../indexer');
    const files = walk(root);
    const findings = [];
    for (const f of files) {
      if (f.startsWith('.lex/') || f.startsWith('node_modules/')) continue;
      let content;
      try { content = fs.readFileSync(path.join(root, f), 'utf8'); } catch { continue; }
      const lines = content.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        for (const p of patterns) {
          if (p.re.test(lines[i])) {
            findings.push(`[CRITICAL] ${f}:${i + 1} - ${p.msg}`);
          }
        }
      }
    }
    if (!findings.length) return { ok: true, output: 'no issues found' };
    return { ok: true, output: findings.join('\n'), count: findings.length };
  }

  // --- check ---
  if (cmd === 'check') {
    const { openDb, refresh, updateFile, walk, loadAgentConfig } = require('../indexer');
    const config = loadAgentConfig(root);
    const failures = [];
    const warnings = [];
    const fixed = [];
    const lex = path.join(root, '.lex');

    const db = openDb(root);

    const indexedFiles = db.prepare("SELECT COUNT(*) c FROM files WHERE path NOT LIKE '.lex/%'").get().c;
    if (indexedFiles === 0) {
      try {
        refresh(db, root);
        fixed.push('indexed ' + db.prepare("SELECT COUNT(*) c FROM files WHERE path NOT LIKE '.lex/%'").get().c + ' files (was empty)');
      } catch (e) {
        warnings.push('index empty, refresh failed: ' + e.message);
      }
    } else {
      const diskFiles = walk(root);
      const indexedMap = new Map();
      for (const f of db.prepare('SELECT path, mtime_ms, size FROM files').all()) indexedMap.set(f.path, f);
      let stale = 0;
      const staleFiles = [];
      for (const rel of diskFiles) {
        let st;
        try { st = fs.statSync(path.join(root, rel)); } catch { continue; }
        const row = indexedMap.get(rel);
        if (!row || row.mtime_ms !== Math.trunc(st.mtimeMs) || row.size !== st.size) { stale++; staleFiles.push(rel); }
      }
      if (stale > 0 && stale <= 50) {
        for (const rel of staleFiles) { try { updateFile(db, root, rel); } catch {} }
        fixed.push('reindexed ' + stale + ' stale file(s)');
      } else if (stale > 50) {
        try { refresh(db, root); fixed.push('full refresh (' + stale + ' stale files)'); } catch (e) { warnings.push(stale + ' files stale, refresh failed: ' + e.message); }
      }
      const onDisk = new Set(diskFiles);
      let deletedCount = 0;
      for (const f of db.prepare('SELECT path FROM files').all()) {
        if (!onDisk.has(f.path) && !f.path.startsWith('.lex/')) { try { updateFile(db, root, f.path); } catch {} deletedCount++; }
      }
      if (deletedCount > 0) fixed.push('cleaned ' + deletedCount + ' deleted file(s)');
    }
    db.close();

    if (config.require_wip && !fs.existsSync(path.join(lex, 'wip.md'))) {
      failures.push('no .lex/wip.md - create one before starting work');
    }
    if (!fs.existsSync(path.join(lex, 'status.md'))) {
      warnings.push('no .lex/status.md - project state unknown');
    }

    const parts = [];
    if (fixed.length) parts.push('FIXED: ' + fixed.join('; '));
    if (failures.length) parts.push('FAIL: ' + failures.join('; '));
    if (warnings.length) parts.push('WARN: ' + warnings.join('; '));
    const allGood = !failures.length && !warnings.length;
    if (allGood) parts.push('OK: all checks passed - ready to work');

    return { ok: !failures.length, output: parts.join('\n'), fixed, failures, warnings };
  }

  if (cmd === 'decay') {
    const { runDecay, findRecurringPatterns } = require('../memory-decay');
    const apply = args.includes('--apply');
    const result = runDecay(root, { apply });
    const patterns = findRecurringPatterns(root);
    return { ok: true, output: JSON.stringify({ ...result, patterns: patterns.slice(0, 5) }, null, 2) };
  }

  if (cmd === 'assoc') {
    const { buildLinks } = require('../memory-links');
    const apply = args.includes('--apply');
    const result = buildLinks(root, { apply });
    return { ok: true, output: JSON.stringify({ memoryCount: result.memoryCount, associations: Object.keys(result.links).length, saved: apply }, null, 2) };
  }

  if (cmd === 'promote') {
    const { runPromotion } = require('../memory-promotion');
    const apply = args.includes('--apply');
    const result = runPromotion(root, { apply });
    return { ok: true, output: JSON.stringify(result, null, 2) };
  }

  if (cmd === 'capture') {
    const { runCapture } = require('../memory-capture');
    const apply = args.includes('--apply');
    const result = runCapture(root, { apply });
    return { ok: true, output: JSON.stringify(result, null, 2) };
  }

  if (cmd === 'synth') {
    const { autoEpisode, synthesize } = require('../memory-synthesis');
    const dryRun = args.includes('--dry-run');
    const dateArg = args.find(a => typeof a === 'string' && a.startsWith('--date='));
    const date = dateArg ? dateArg.slice(7) : null;
    if (dryRun) {
      const result = synthesize(root, { date });
      return { ok: true, output: JSON.stringify(result, null, 2) };
    }
    const result = autoEpisode(root, { date, force: true });
    if (!result) return { ok: true, output: 'no activity to synthesize' };
    return { ok: true, output: 'episode written: .lex/sessions/' + result.filename, synthesis: result.synthesis };
  }

  return null;
}

module.exports = { handle };
