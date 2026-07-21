'use strict';

const fs = require('node:fs');
const path = require('node:path');

function getSessionsDir(root) {
  return path.join(root, '.lex', 'sessions');
}

function listSessions(root, limit) {
  const dir = getSessionsDir(root);
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.md') && f !== '.gitkeep').sort().reverse();
  return files.slice(0, limit || 10).map(f => {
    const content = fs.readFileSync(path.join(dir, f), 'utf8');
    const titleMatch = content.match(/^#\s+(.+)/m);
    const summaryMatch = content.match(/^##\s+Summary\s*\n(.+)/m);
    return {
      file: f,
      date: f.replace('.md', ''),
      title: titleMatch ? titleMatch[1] : f,
      summary: summaryMatch ? summaryMatch[1].trim() : '',
      preview: content.substring(0, 200),
    };
  });
}

function searchSessions(root, terms) {
  const dir = getSessionsDir(root);
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.md') && f !== '.gitkeep').sort().reverse();
  const lower = terms.map(t => t.toLowerCase());
  const results = [];
  for (const f of files) {
    const content = fs.readFileSync(path.join(dir, f), 'utf8').toLowerCase();
    let score = 0;
    for (const term of lower) {
      const matches = (content.match(new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
      score += matches;
    }
    if (score > 0) {
      const full = fs.readFileSync(path.join(dir, f), 'utf8');
      const titleMatch = full.match(/^#\s+(.+)/m);
      results.push({
        file: f,
        date: f.replace('.md', ''),
        title: titleMatch ? titleMatch[1] : f,
        score,
        preview: full.substring(0, 300),
      });
    }
  }
  return results.sort((a, b) => b.score - a.score).slice(0, 5);
}

function searchSessionsDb(root, terms) {
  try {
    const memdb = require('./memory-db');
    const rows = memdb.searchMemoryDb(root, terms, { type: 'episode', limit: 5 });
    return rows.map(r => ({
      file: r.source.replace('sessions/', ''),
      date: r.date || r.source.replace('sessions/', '').replace('.md', ''),
      title: r.title,
      score: 1,
      preview: r.preview,
    }));
  } catch {
    return searchSessions(root, terms);
  }
}

function writeEpisode(root, episode) {
  const dir = getSessionsDir(root);
  fs.mkdirSync(dir, { recursive: true });
  const date = new Date().toISOString().substring(0, 10);
  const existing = fs.readdirSync(dir).filter(f => f.startsWith(date) && f.endsWith('.md'));
  let suffix = '';
  if (existing.length > 0) {
    const nums = existing.map(f => {
      const m = f.match(/-(\d+)\.md$/);
      return m ? parseInt(m[1]) : 0;
    });
    suffix = '-' + (Math.max(...nums) + 1);
  }
  const filename = date + suffix + '.md';
  const filepath = path.join(dir, filename);

  const lines = [`# ${episode.title || 'Session ' + date}`];
  lines.push('');
  lines.push(`- date: ${date}`);
  lines.push(`- agent: ${episode.agent || 'unknown'}`);
  lines.push(`- platform: ${episode.platform || 'unknown'}`);
  if (episode.duration) lines.push(`- duration: ${episode.duration}`);
  lines.push('');

  if (episode.summary) {
    lines.push('## Summary');
    lines.push(episode.summary);
    lines.push('');
  }

  if (episode.files && episode.files.length) {
    lines.push('## Files modified');
    for (const f of episode.files) lines.push(`- ${f}`);
    lines.push('');
  }

  if (episode.decisions && episode.decisions.length) {
    lines.push('## Decisions');
    for (const d of episode.decisions) lines.push(`- ${d}`);
    lines.push('');
  }

  if (episode.bugs && episode.bugs.length) {
    lines.push('## Bugs fixed');
    for (const b of episode.bugs) lines.push(`- ${b}`);
    lines.push('');
  }

  if (episode.learnings && episode.learnings.length) {
    lines.push('## Learnings');
    for (const l of episode.learnings) lines.push(`- ${l}`);
    lines.push('');
  }

  if (episode.nextSteps && episode.nextSteps.length) {
    lines.push('## Next steps');
    for (const n of episode.nextSteps) lines.push(`- ${n}`);
    lines.push('');
  }

  fs.writeFileSync(filepath, lines.join('\n'), 'utf8');
  return filename;
}

function recall(root, terms) {
  const results = { persistent: [], episodic: [] };

  if (terms && terms.length) {
    try {
      const memdb = require('./memory-db');
      memdb.refreshMemoryDb(root);
      const rows = memdb.searchMemoryDb(root, terms, { limit: 5 });
      results.persistent = rows.map(r => ({
        path: r.source,
        snippet: r.preview.replace(/\s+/g, ' ').trim(),
        line: 0,
        type: r.type,
        title: r.title,
      }));
    } catch {
      const { openDbAt, ftsRows } = require('./indexer');
      const pagesDir = path.join(root, '.lex', 'pages');
      const dbFile = path.join(root, '.lex', 'pages.db');
      if (fs.existsSync(pagesDir)) {
        fs.mkdirSync(path.dirname(dbFile), { recursive: true });
        try {
          const { refreshDocs } = require('./indexer');
          const db = openDbAt(dbFile);
          refreshDocs(db, pagesDir);
          const rows = ftsRows(db, terms, 5, ['[', ']'], root);
          db.close();
          results.persistent = rows.map(r => ({
            path: r.path,
            snippet: r.snip.replace(/\s+/g, ' ').trim(),
            line: r.line,
          }));
        } catch {}
      }
    }
    results.episodic = searchSessionsDb(root, terms);
  } else {
    results.persistent = fs.existsSync(path.join(root, '.lex', 'pages'))
      ? fs.readdirSync(path.join(root, '.lex', 'pages')).filter(f => f.endsWith('.md')).map(f => ({ path: f }))
      : [];
    results.episodic = listSessions(root, 5);
  }

  return results;
}

function formatRecall(results) {
  const lines = [];
  if (results.persistent && results.persistent.length) {
    lines.push('## Persistent memory (mistakes, patterns, design)');
    for (const p of results.persistent) {
      if (p.snippet) {
        lines.push(`${p.path}: ${p.snippet}`);
      } else {
        lines.push(`- ${p.path}`);
      }
    }
  } else {
    lines.push('## Persistent memory');
    lines.push('(no matches in mistakes.md, patterns.md, design.md)');
  }

  lines.push('');
  if (results.episodic && results.episodic.length) {
    lines.push('## Episodic memory (past sessions)');
    for (const e of results.episodic) {
      lines.push(`### ${e.date}: ${e.title}`);
      if (e.summary) lines.push(`  ${e.summary}`);
      if (e.preview) lines.push(`  ${e.preview.substring(0, 150).replace(/\n/g, ' ')}...`);
    }
  } else {
    lines.push('## Episodic memory');
    lines.push('(no past sessions recorded)');
  }

  return lines.join('\n');
}

module.exports = { recall, formatRecall, writeEpisode, listSessions, searchSessions };
