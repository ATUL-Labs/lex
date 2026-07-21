'use strict';

/**
 * Proactive Memory Retrieval Engine
 *
 * Instead of the agent asking "what do I know about X?", this module
 * takes context signals (current file, current task, recent edits) and
 * surfaces relevant memories ranked by recency × relevance × frequency.
 *
 * Memory that comes to you, not memory you have to ask for.
 */

const fs = require('node:fs');
const path = require('node:path');
const { openDbAt, ftsRows, refreshDocs } = require('./indexer');

function readSafe(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch { return null; }
}

function getAuditEntries(root, limit) {
  const auditPath = path.join(root, '.lex', 'audit.log');
  let lines = [];
  try { lines = readSafe(auditPath).trim().split('\n'); } catch {}
  if (!lines.length || !lines[0]) return [];
  return lines.slice(-limit).map(line => {
    const parts = line.split('|').map(s => s.trim());
    if (parts.length < 5) return null;
    const dateTime = parts[0].split(/\s+/);
    return {
      date: dateTime[0] || '',
      time: dateTime[1] || '',
      agent: parts[1] || '',
      platform: parts[2] || '',
      action: parts[3] || '',
      file: parts[4] || '',
    };
  }).filter(e => e.file);
}

function getRecentFiles(root, limit) {
  const entries = getAuditEntries(root, limit * 3);
  const seen = new Set();
  const files = [];
  for (let i = entries.length - 1; i >= 0 && files.length < limit; i--) {
    const f = entries[i].file;
    if (!seen.has(f)) { seen.add(f); files.push(f); }
  }
  return files;
}

function getWipTask(root) {
  const wip = readSafe(path.join(root, '.lex', 'wip.md'));
  if (!wip) return null;
  const lines = wip.split('\n');
  const taskLine = lines.find(l => l.startsWith('# '));
  const stepLines = lines.filter(l => l.match(/^\d+\./) || l.startsWith('- [ ]'));
  return {
    title: taskLine ? taskLine.replace(/^#\s*/, '') : 'unknown task',
    steps: stepLines.slice(0, 5).map(l => l.replace(/^\d+\.\s*/, '').replace(/^- \[ \]\s*/, '')),
    raw: wip,
  };
}

function extractSymbolsFromFile(root, filePath) {
  try {
    const { openDb } = require('./indexer');
    const db = openDb(root);
    const rel = filePath.replace(/\\/g, '/').replace(/^\.\//, '');
    const rows = db.prepare('SELECT name, kind FROM symbols WHERE path = ? LIMIT 20').all(rel);
    db.close();
    return rows.map(r => r.name);
  } catch { return []; }
}

function extractTerms(text) {
  if (!text) return [];
  const stop = new Set(['the','a','an','is','are','was','were','be','been','being','have','has','had','do','does','did','will','would','could','should','may','might','must','can','to','of','in','for','on','with','at','by','from','as','into','about','than','then','this','that','these','those','it','its','they','them','their','we','you','your','our','my','me','and','or','but','not','no','if','else','when','while','for','function','const','let','var','require','module','exports','return','class','new','try','catch','error','err','e','i','j','k','n','x','y','val','value','str','obj','arr','fn','cb','idx','len','num','char','type','key','data','name','file','path','dir','root','true','false','null','undefined','void','use','strict','async','await','yield','import','export','default','extends','super','this']);
  const words = text
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 3 && !stop.has(w.toLowerCase()));
  return [...new Set(words)].slice(0, 20);
}

function scoreMemory(memory, context) {
  let score = 0;
  const reasons = [];

  const memTerms = new Set((memory.terms || []).map(t => t.toLowerCase()));
  const ctxTerms = new Set((context.terms || []).map(t => t.toLowerCase()));

  let termOverlap = 0;
  for (const t of memTerms) { if (ctxTerms.has(t)) termOverlap++; }
  if (termOverlap > 0) {
    score += termOverlap * 3;
    reasons.push(`${termOverlap} term overlap`);
  }

  if (memory.path && context.files && context.files.length) {
    for (const f of context.files) {
      if (memory.path === f) { score += 10; reasons.push('exact file match'); break; }
      const memDir = memory.path.split('/').slice(0, -1).join('/');
      const ctxDir = f.split('/').slice(0, -1).join('/');
      if (memDir && ctxDir && memDir === ctxDir) { score += 4; reasons.push('same directory'); break; }
    }
  }

  if (memory.symbols && context.symbols && context.symbols.length) {
    let symOverlap = 0;
    for (const s of memory.symbols) { if (context.symbols.includes(s)) symOverlap++; }
    if (symOverlap > 0) { score += symOverlap * 5; reasons.push(`${symOverlap} symbol overlap`); }
  }

  if (memory.ageDays !== undefined) {
    const recencyScore = Math.max(0, 10 - memory.ageDays * 0.3);
    score += recencyScore;
    if (recencyScore > 5) reasons.push(`recent (${memory.ageDays}d ago)`);
  }

  if (memory.frequency) {
    score += Math.min(memory.frequency * 2, 10);
    if (memory.frequency > 1) reasons.push(`seen ${memory.frequency}x`);
  }

  if (memory.type === 'mistake') { score += 3; reasons.push('past mistake'); }
  if (memory.type === 'rule') { score += 5; reasons.push('project rule'); }

  return { score, reasons };
}

function getPersistentMemories(root, context) {
  const pagesDir = path.join(root, '.lex', 'pages');
  if (!fs.existsSync(pagesDir)) return [];

  const memories = [];
  const files = fs.readdirSync(pagesDir).filter(f => f.endsWith('.md'));

  for (const f of files) {
    const content = readSafe(path.join(pagesDir, f)) || '';
    const type = f.replace('.md', '');

    const sections = content.split(/^## /m).slice(1);
    for (const section of sections) {
      const titleMatch = section.match(/^(.+)/);
      const title = titleMatch ? titleMatch[1].trim() : '';
      const body = section.trim();

      const terms = extractTerms(title + ' ' + body);

      let symbols = [];
      const symMatches = body.match(/\b([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g);
      if (symMatches) symbols = [...new Set(symMatches.map(m => m.replace(/\s*\($/, '')))].slice(0, 10);

      const dateMatch = body.match(/when:\s*(\d{4}-\d{2}-\d{2})/);
      let ageDays = undefined;
      if (dateMatch) {
        ageDays = Math.floor((Date.now() - new Date(dateMatch[1]).getTime()) / 86400000);
      }

      memories.push({
        source: `pages/${f}`,
        type,
        title,
        terms,
        symbols,
        ageDays,
        frequency: 1,
        preview: body.substring(0, 200),
        path: null,
      });
    }
  }

  return memories;
}

function getEpisodicMemories(root, context) {
  const sessionsDir = path.join(root, '.lex', 'sessions');
  if (!fs.existsSync(sessionsDir)) return [];

  const memories = [];
  const files = fs.readdirSync(sessionsDir).filter(f => f.endsWith('.md') && f !== '.gitkeep').sort().reverse().slice(0, 20);

  for (const f of files) {
    const content = readSafe(path.join(sessionsDir, f)) || '';
    const titleMatch = content.match(/^#\s+(.+)/m);
    const title = titleMatch ? titleMatch[1].trim() : f;
    const dateStr = f.replace('.md', '');

    const terms = extractTerms(content);

    const fileSection = content.match(/## Files modified\s*\n([\s\S]*?)(?=\n##|$)/);
    let files = [];
    if (fileSection) {
      files = fileSection[1].split('\n').map(l => l.replace(/^-\s*/, '').trim()).filter(Boolean);
    }

    const ageDays = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);

    memories.push({
      source: `sessions/${f}`,
      type: 'episode',
      title,
      terms,
      symbols: [],
      ageDays,
      frequency: 1,
      preview: content.substring(0, 300),
      path: files[0] || null,
      files,
    });
  }

  return memories;
}

function getRuleMemories(root, context) {
  const rulesPath = path.join(root, '.lex', 'pages', 'rules.md');
  const content = readSafe(rulesPath);
  if (!content) return [];

  const memories = [];
  const sections = content.split(/^## /m).slice(1);
  for (const section of sections) {
    const titleMatch = section.match(/^(.+)/);
    const title = titleMatch ? titleMatch[1].trim() : '';
    memories.push({
      source: 'pages/rules.md',
      type: 'rule',
      title,
      terms: extractTerms(title + ' ' + section),
      symbols: [],
      ageDays: undefined,
      frequency: 1,
      preview: section.trim().substring(0, 200),
      path: null,
    });
  }
  return memories;
}

function proactive(root, signals) {
  const memdb = require('./memory-db');
  memdb.refreshMemoryDb(root);

  const context = {
    files: signals.files || getRecentFiles(root, 5),
    task: signals.task || getWipTask(root),
    symbols: signals.symbols || [],
    terms: [],
  };

  if (context.files.length && !context.symbols.length) {
    for (const f of context.files.slice(0, 3)) {
      context.symbols.push(...extractSymbolsFromFile(root, f));
    }
    context.symbols = [...new Set(context.symbols)].slice(0, 20);
  }

  if (context.task) {
    context.terms.push(...extractTerms(context.task.title + ' ' + context.task.steps.join(' ')));
  }
  for (const f of context.files) {
    context.terms.push(...extractTerms(f.replace(/\\/g, '/')));
  }
  for (const s of context.symbols) {
    if (s.length >= 3) context.terms.push(s);
  }
  context.terms = [...new Set(context.terms.map(t => t.toLowerCase()))].slice(0, 30);

  const allMemories = [];
  const seenIds = new Set();

  if (context.terms.length) {
    const searchResults = memdb.searchMemoryDb(root, context.terms, { limit: 30 });
    for (const m of searchResults) {
      if (!seenIds.has(m.id)) { seenIds.add(m.id); allMemories.push(m); }
    }
  }

  for (const f of context.files.slice(0, 3)) {
    const fileResults = memdb.getMemoriesByFile(root, f.replace(/\\/g, '/'), { limit: 10 });
    for (const m of fileResults) {
      if (!seenIds.has(m.id)) { seenIds.add(m.id); allMemories.push(m); }
    }
  }

  const rules = memdb.getAllMemories(root, { type: 'rules', limit: 20 });
  for (const m of rules) {
    if (!seenIds.has(m.id)) { seenIds.add(m.id); allMemories.push(m); }
  }

  const scored = allMemories.map(m => {
    const { score, reasons } = scoreMemory(m, context);
    return { ...m, score, reasons };
  });

  const ranked = scored
    .filter(m => m.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  let related = [];
  try {
    const memdb2 = require('./memory-db');
    const seenRelIds = new Set(ranked.map(m => m.id));
    const relatedMap = new Map();
    for (const m of ranked) {
      const links = memdb2.getRelatedFromDb(root, m.id, 2);
      for (const link of links) {
        if (!seenRelIds.has(link.id) && !relatedMap.has(link.id)) {
          relatedMap.set(link.id, { target: link.title, score: link.score, reasons: link.reasons, via: m.title });
        }
      }
    }
    related = [...relatedMap.values()].slice(0, 5);
  } catch {}

  return {
    context: {
      files: context.files,
      task: context.task ? context.task.title : null,
      symbols: context.symbols.slice(0, 10),
      terms: context.terms.slice(0, 15),
    },
    memories: ranked,
    related,
  };
}

function formatProactive(result) {
  const lines = [];

  lines.push('## Context detected');
  if (result.context.task) lines.push(`task: ${result.context.task}`);
  if (result.context.files.length) lines.push(`files: ${result.context.files.join(', ')}`);
  if (result.context.symbols.length) lines.push(`symbols: ${result.context.symbols.join(', ')}`);
  lines.push('');

  if (!result.memories.length) {
    lines.push('## Proactive memory');
    lines.push('(no relevant memories surfaced)');
    return lines.join('\n');
  }

  lines.push('## Surfaced memories (ranked)');
  for (const m of result.memories) {
    lines.push(`### [${m.type}] ${m.title}`);
    lines.push(`  source: ${m.source}`);
    lines.push(`  score: ${m.score.toFixed(1)} (${m.reasons.join(', ')})`);
    lines.push(`  preview: ${m.preview.replace(/\n/g, ' ').substring(0, 150)}...`);
    lines.push('');
  }

  if (result.related && result.related.length) {
    lines.push('## Related (via associations)');
    for (const r of result.related) {
      lines.push(`  → ${r.target.substring(0, 60)} (score: ${r.score}, ${r.reasons.join(', ')}, via: ${r.via.substring(0, 40)})`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

module.exports = { proactive, formatProactive, getRecentFiles, getWipTask, extractTerms, getPersistentMemories, getEpisodicMemories };
