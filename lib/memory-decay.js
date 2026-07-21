'use strict';

/**
 * Memory Decay & Compression
 *
 * Not deletion — compression. Old episodes get summarized into shorter forms.
 * Patterns reinforced multiple times get promoted to rules (permanent).
 * Patterns never referenced get deprioritized (not deleted).
 *
 * Age tiers:
 *   < 7 days   → full detail
 *   7-30 days  → summary + key decisions
 *   30-90 days → key decisions only
 *   > 90 days  → merged into patterns or dropped
 */

const fs = require('node:fs');
const path = require('node:path');

function readSafe(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch { return null; }
}

function getEpisodeDate(filename) {
  const m = filename.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

function getAgeDays(dateStr) {
  if (!dateStr) return Infinity;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

function compressEpisode(content, ageDays) {
  const lines = content.split('\n');
  const compressed = [];

  let inSection = false;
  let sectionName = '';

  for (const line of lines) {
    if (line.startsWith('# ')) { compressed.push(line); continue; }
    if (line.startsWith('- date:') || line.startsWith('- agent:') || line.startsWith('- platform:')) {
      compressed.push(line); continue;
    }

    if (line.startsWith('## ')) {
      sectionName = line.replace(/^##\s*/, '');
      inSection = true;

      if (ageDays > 90) {
        if (['Summary', 'Decisions', 'Learnings'].includes(sectionName)) {
          compressed.push(line);
        } else { inSection = 'skip'; }
      } else if (ageDays > 30) {
        if (['Summary', 'Decisions', 'Learnings', 'Bugs fixed'].includes(sectionName)) {
          compressed.push(line);
        } else { inSection = 'skip'; }
      } else if (ageDays > 7) {
        if (['Summary', 'Decisions', 'Files modified', 'Bugs fixed', 'Learnings'].includes(sectionName)) {
          compressed.push(line);
        } else { inSection = 'skip'; }
      } else {
        compressed.push(line);
      }
      continue;
    }

    if (inSection === 'skip') continue;
    compressed.push(line);
  }

  return compressed.join('\n');
}

function scanEpisodes(root) {
  const sessionsDir = path.join(root, '.lex', 'sessions');
  if (!fs.existsSync(sessionsDir)) return [];

  const files = fs.readdirSync(sessionsDir).filter(f => f.endsWith('.md') && f !== '.gitkeep');
  const results = [];

  for (const f of files) {
    const content = readSafe(path.join(sessionsDir, f));
    if (!content) continue;
    const dateStr = getEpisodeDate(f);
    const ageDays = getAgeDays(dateStr);
    const lines = content.split('\n').length;

    let tier = 'full';
    if (ageDays > 90) tier = 'minimal';
    else if (ageDays > 30) tier = 'condensed';
    else if (ageDays > 7) tier = 'summary';

    results.push({
      file: f,
      date: dateStr,
      ageDays,
      tier,
      lines,
      needsCompression: (tier === 'minimal' && lines > 10) ||
                        (tier === 'condensed' && lines > 20) ||
                        (tier === 'summary' && lines > 40),
    });
  }

  return results.sort((a, b) => a.ageDays - b.ageDays);
}

function runDecay(root, options) {
  const dryRun = !(options && options.apply);
  const episodes = scanEpisodes(root);
  const toCompress = episodes.filter(e => e.needsCompression);
  const results = {
    scanned: episodes.length,
    wouldCompress: toCompress.length,
    compressed: 0,
    details: [],
  };

  if (dryRun) {
    for (const e of toCompress) {
      results.details.push({
        file: e.file,
        ageDays: e.ageDays,
        tier: e.tier,
        currentLines: e.lines,
        action: 'would compress',
      });
    }
    return results;
  }

  const sessionsDir = path.join(root, '.lex', 'sessions');
  const compressedDir = path.join(root, '.lex', 'sessions', 'archive');
  fs.mkdirSync(compressedDir, { recursive: true });

  for (const e of toCompress) {
    const filePath = path.join(sessionsDir, e.file);
    const content = readSafe(filePath);
    if (!content) continue;

    const backupPath = path.join(compressedDir, e.file);
    fs.copyFileSync(filePath, backupPath);

    const compressed = compressEpisode(content, e.ageDays);
    fs.writeFileSync(filePath, compressed);

    const newLines = compressed.split('\n').length;
    results.compressed++;
    results.details.push({
      file: e.file,
      ageDays: e.ageDays,
      tier: e.tier,
      oldLines: e.lines,
      newLines,
      savedLines: e.lines - newLines,
      backup: 'sessions/archive/' + e.file,
    });
  }

  return results;
}

function findRecurringPatterns(root) {
  const pagesDir = path.join(root, '.lex', 'pages');
  if (!fs.existsSync(pagesDir)) return [];

  const mistakes = readSafe(path.join(pagesDir, 'mistakes.md')) || '';
  const sections = mistakes.split(/^## /m).slice(1);

  const patterns = Object.create(null);
  for (const section of sections) {
    const titleMatch = section.match(/^(.+)/);
    const title = titleMatch ? titleMatch[1].trim() : '';
    const terms = title.toLowerCase().split(/\s+/).filter(w => w.length >= 4);

    for (const term of terms) {
      if (!patterns[term]) patterns[term] = [];
      patterns[term].push(title);
    }
  }

  const recurring = [];
  for (const [term, titles] of Object.entries(patterns)) {
    if (titles.length >= 2) {
      recurring.push({
        term,
        count: titles.length,
        titles,
        suggestion: `Pattern detected: "${term}" appears in ${titles.length} mistakes. Consider promoting to a rule.`,
      });
    }
  }

  return recurring.sort((a, b) => b.count - a.count);
}

function decayCmd(root, args) {
  const apply = args.includes('--apply');
  const result = runDecay(root, { apply });

  process.stdout.write(`scanned: ${result.scanned} episodes\n`);
  process.stdout.write(`${apply ? 'compressed' : 'would compress'}: ${result.wouldCompress}\n`);

  if (apply && result.compressed > 0) {
    process.stdout.write(`compressed: ${result.compressed}\n`);
  }

  for (const d of result.details) {
    if (apply && d.oldLines !== undefined) {
      process.stdout.write(`  ${d.file} (${d.ageDays}d, ${d.tier}): ${d.oldLines} → ${d.newLines} lines (saved ${d.savedLines}, backup: ${d.backup})\n`);
    } else {
      process.stdout.write(`  ${d.file} (${d.ageDays}d, ${d.tier}): ${d.currentLines} lines → ${d.action}\n`);
    }
  }

  const patterns = findRecurringPatterns(root);
  if (patterns.length) {
    process.stdout.write('\nrecurring patterns detected:\n');
    for (const p of patterns.slice(0, 5)) {
      process.stdout.write(`  [${p.count}x] "${p.term}" — ${p.suggestion}\n`);
    }
  }
}

module.exports = { scanEpisodes, runDecay, compressEpisode, findRecurringPatterns, decayCmd };
