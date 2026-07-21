'use strict';

/**
 * Memory Association Links
 *
 * Lightweight "see also" connections between memories.
 * Not a full knowledge graph — just enough to say:
 *   "this bug is similar to that bug"
 *   "this pattern solves that problem"
 *   "this file is related to that architecture decision"
 *
 * Derived from content analysis (shared terms, shared files, shared symbols).
 * Stored in .lex/links.json as a simple adjacency list.
 */

const fs = require('node:fs');
const path = require('node:path');

function readSafe(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch { return null; }
}

function getLinksPath(root) {
  return path.join(root, '.lex', 'links.json');
}

function loadLinks(root) {
  const data = readSafe(getLinksPath(root));
  if (!data) return { links: {}, version: 1 };
  try { return JSON.parse(data); } catch { return { links: {}, version: 1 }; }
}

function saveLinks(root, data) {
  fs.writeFileSync(getLinksPath(root), JSON.stringify(data, null, 2), 'utf8');
}

function extractTerms(text) {
  if (!text) return [];
  const stop = new Set(['the','a','an','is','are','was','were','be','been','being','have','has','had','do','does','did','will','would','could','should','may','might','must','can','to','of','in','for','on','with','at','by','from','as','into','about','than','then','this','that','these','those','it','its','they','them','their','we','you','your','our','my','me','and','or','but','not','no','if','else','when','while','for','function','const','let','var','require','module','exports','return','class','new','try','catch','error','err','file','path','dir','root','true','false','null','undefined','void','use','strict','async','await','what','why','fix','rule','when','note','how','was','were','been','being','have','has','had','which','that','this','from','with','they','will','would','could','should','may','might','must','can','the','and','but','not','for','are','was','were','been','being','have','has','had','do','does','did','will','would','could','should','may','might','must','can','the','a','an','is','are','was','were','be','been','being','have','has','had','do','does','did','will','would','could','should','may','might','must','can','to','of','in','for','on','with','at','by','from','as','into','about','than','then','this','that','these','those','it','its','they','them','their','we','you','your','our','my','me','and','or','but','not','no','if','else','when','while','for','function','const','let','var','require','module','exports','return','class','new','try','catch','error','err','e','i','j','k','n','x','y','val','value','str','obj','arr','fn','cb','idx','len','num','char','type','key','data','name','file','path','dir','root','true','false','null','undefined','void','use','strict','async','await','yield','import','export','default','extends','super','this']);
  const words = text
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 4 && !stop.has(w.toLowerCase()));
  return [...new Set(words)].slice(0, 30);
}

function buildAssociations(root) {
  const memdb = require('./memory-db');
  memdb.refreshMemoryDb(root);
  const memories = memdb.getAllMemories(root, { limit: 5000 });
  const lastBuiltId = memdb.getLastBuiltId(root);
  const maxId = memories.length ? Math.max(...memories.map(m => m.id)) : 0;

  const indexed = memories.map(m => ({
    id: m.id,
    source: m.source,
    title: m.title,
    terms: new Set((m.terms || []).map(t => t.toLowerCase())),
    symbols: new Set(m.symbols || []),
    type: m.type,
  }));

  const indexedMap = new Map(indexed.map(m => [m.id, m]));
  const newMemories = indexed.filter(m => m.id > lastBuiltId);

  const links = {};
  const THRESHOLD = 2;

  function comparePair(a, b) {
    let sharedTerms = 0;
    for (const t of a.terms) { if (b.terms.has(t)) sharedTerms++; }

    let sharedSymbols = 0;
    for (const s of a.symbols) { if (b.symbols.has(s)) sharedSymbols++; }

    const sameType = a.type === b.type;
    const score = sharedTerms + sharedSymbols * 3 + (sameType ? 1 : 0);

    if (score >= THRESHOLD) {
      const reasons = [];
      if (sharedTerms > 0) reasons.push(`${sharedTerms} shared terms`);
      if (sharedSymbols > 0) reasons.push(`${sharedSymbols} shared symbols`);
      if (sameType) reasons.push(`same type (${a.type})`);

      if (!links[a.id]) links[a.id] = [];
      if (!links[b.id]) links[b.id] = [];

      links[a.id].push({ target_id: b.id, target: b.id, score, reasons });
      links[b.id].push({ target_id: a.id, target: a.id, score, reasons });
    }
  }

  if (lastBuiltId === 0) {
    for (let i = 0; i < indexed.length; i++) {
      for (let j = i + 1; j < indexed.length; j++) {
        comparePair(indexed[i], indexed[j]);
      }
    }
  } else {
    for (const newMem of newMemories) {
      for (const existing of indexed) {
        if (newMem.id === existing.id) continue;
        comparePair(newMem, existing);
      }
    }
    for (let i = 0; i < newMemories.length; i++) {
      for (let j = i + 1; j < newMemories.length; j++) {
        comparePair(newMemories[i], newMemories[j]);
      }
    }
  }

  for (const id in links) {
    links[id].sort((a, b) => b.score - a.score);
    links[id] = links[id].slice(0, 5);
  }

  return { links, version: 3, generated: new Date().toISOString(), memoryCount: indexed.length, newCount: newMemories.length, lastBuiltId, maxId };
}

function buildLinks(root, options) {
  const apply = options && options.apply;
  const result = buildAssociations(root);

  if (apply) {
    const memdb = require('./memory-db');
    const incremental = result.lastBuiltId > 0;
    memdb.saveLinksToDb(root, result.links, { incremental });
    if (result.maxId > 0) memdb.setLastBuiltId(root, result.maxId);
    try { saveLinks(root, result); } catch {}
  }

  return result;
}

function getRelated(root, memoryId) {
  const memdb = require('./memory-db');
  return memdb.getRelatedFromDb(root, parseInt(memoryId), 5);
}

function linksCmd(root, args) {
  const apply = args.includes('--apply');
  const result = buildLinks(root, { apply });

  process.stdout.write(`memories scanned: ${result.memoryCount}\n`);
  process.stdout.write(`associations found: ${Object.keys(result.links).length}\n`);

  if (apply) {
    process.stdout.write('saved to .lex/links.json\n');
  } else {
    process.stdout.write('(dry run - use --apply to save)\n');
  }

  const shown = new Set();
  let count = 0;
  for (const [id, related] of Object.entries(result.links)) {
    if (count >= 10) break;
    for (const r of related.slice(0, 2)) {
      const pair = [id, r.target].sort().join(' <-> ');
      if (shown.has(pair)) continue;
      shown.add(pair);
      const idStr = String(id).substring(0, 50);
      const tgtStr = String(r.target).substring(0, 50);
      process.stdout.write(`  ${idStr} → ${tgtStr} (score: ${r.score}, ${r.reasons.join(', ')})\n`);
      count++;
    }
  }
}

module.exports = { buildLinks, loadLinks, saveLinks, getRelated, linksCmd, buildAssociations };
