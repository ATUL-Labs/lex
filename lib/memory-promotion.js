'use strict';

/**
 * Memory Promotion Pipeline
 *
 * Mistakes that recur get promoted to patterns.
 * Patterns that are referenced across multiple sessions get promoted to rules.
 *
 * Flow:
 *   mistake (seen once) → pattern (seen 3x with similar root cause) → rule (validated, permanent)
 *
 * This is NOT deletion — promoted entries stay in their original file.
 * A "promoted from" reference is added so the chain is traceable.
 */

const fs = require('node:fs');
const path = require('node:path');

function readSafe(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch { return null; }
}

function parseMistakes(root) {
  const content = readSafe(path.join(root, '.lex', 'pages', 'mistakes.md'));
  if (!content) return [];
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
    return {
      num,
      title: title.replace(/^\d+\.\s*/, ''),
      date: dateMatch ? dateMatch[1] : null,
      what: whatMatch ? whatMatch[1].trim() : '',
      fix: fixMatch ? fixMatch[1].trim() : '',
      rule: ruleMatch ? ruleMatch[1].trim() : '',
      raw: section.trim(),
      isTodo: section.includes('TODO'),
    };
  });
}

function parsePatterns(root) {
  const content = readSafe(path.join(root, '.lex', 'pages', 'patterns.md'));
  if (!content) return [];
  const sections = content.split(/^## /m).slice(1);
  return sections.map(section => {
    const titleMatch = section.match(/^(.+)/);
    const whereMatch = section.match(/where:\s*(.+)/);
    const whatMatch = section.match(/what:\s*(.+)/);
    return {
      title: titleMatch ? titleMatch[1].trim() : '',
      where: whereMatch ? whereMatch[1].trim() : '',
      what: whatMatch ? whatMatch[1].trim() : '',
      raw: section.trim(),
    };
  });
}

function parseSessions(root) {
  const sessionsDir = path.join(root, '.lex', 'sessions');
  if (!fs.existsSync(sessionsDir)) return [];
  const files = fs.readdirSync(sessionsDir).filter(f => f.endsWith('.md') && f !== '.gitkeep');
  return files.map(f => {
    const content = readSafe(path.join(sessionsDir, f)) || '';
    const titleMatch = content.match(/^#\s+(.+)/m);
    const dateStr = f.replace('.md', '');
    const learningsSection = content.match(/## Learnings\s*\n([\s\S]*?)(?=\n##|$)/);
    const learnings = learningsSection
      ? learningsSection[1].split('\n').map(l => l.replace(/^-\s*/, '').trim()).filter(Boolean)
      : [];
    return { file: f, date: dateStr, title: titleMatch ? titleMatch[1].trim() : f, learnings, content: content.toLowerCase() };
  });
}

function tokenize(text) {
  if (!text) return [];
  return text.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 4);
}

function findClusters(mistakes) {
  const clusters = [];
  const assigned = new Set();

  for (let i = 0; i < mistakes.length; i++) {
    if (assigned.has(i)) continue;
    if (mistakes[i].isTodo) continue;

    const terms = new Set(tokenize(mistakes[i].title + ' ' + mistakes[i].what + ' ' + mistakes[i].rule));
    const cluster = [i];
    assigned.add(i);

    for (let j = i + 1; j < mistakes.length; j++) {
      if (assigned.has(j)) continue;
      if (mistakes[j].isTodo) continue;

      const otherTerms = new Set(tokenize(mistakes[j].title + ' ' + mistakes[j].what + ' ' + mistakes[j].rule));
      let overlap = 0;
      for (const t of terms) { if (otherTerms.has(t)) overlap++; }
      const similarity = overlap / Math.max(terms.size, 1);

      if (similarity >= 0.3 || overlap >= 2) {
        cluster.push(j);
        assigned.add(j);
      }
    }

    if (cluster.length >= 2) {
      clusters.push({
        members: cluster.map(idx => mistakes[idx]),
        count: cluster.length,
        sharedTerms: [...terms].slice(0, 5),
      });
    }
  }

  return clusters.sort((a, b) => b.count - a.count);
}

function findPatternSessionRefs(patterns, sessions) {
  const refs = patterns.map(p => {
    const terms = new Set(tokenize(p.title + ' ' + p.what));
    let refCount = 0;
    const refSessions = [];
    for (const s of sessions) {
      let matchScore = 0;
      for (const t of terms) {
        if (s.content && s.content.includes(t)) matchScore++;
      }
      if (matchScore >= 2) {
        refCount++;
        refSessions.push(s.date || s.file);
      }
    }
    return { pattern: p, refCount, refSessions };
  });
  return refs.sort((a, b) => b.refCount - a.refCount);
}

function promoteMistakesToPatterns(root, clusters, options) {
  const dryRun = !(options && options.apply);
  const patternsPath = path.join(root, '.lex', 'pages', 'patterns.md');
  const existing = readSafe(patternsPath) || '';
  const results = [];

  for (const cluster of clusters) {
    const title = cluster.sharedTerms.slice(0, 3).map(t => t.charAt(0).toUpperCase() + t.slice(1)).join(' ');
    const patternName = `Auto-promoted: ${title} (${cluster.count} occurrences)`;

    if (existing.includes(patternName)) {
      results.push({ action: 'skip', reason: 'already promoted', patternName });
      continue;
    }

    const memberTitles = cluster.members.map(m => `  - mistakes.md #${m.num}: ${m.title}`).join('\n');
    const rules = cluster.members.filter(m => m.rule).map(m => m.rule);
    const combinedRule = rules[0] || '';

    const entry = `## ${patternName}\n- where: ${cluster.sharedTerms.join(', ')}\n- what: Recurring mistake pattern detected across ${cluster.count} entries. Root causes:\n${memberTitles}\n- rule: ${combinedRule}\n- promoted_from: mistakes.md #${cluster.members.map(m => m.num).join(', #')}\n`;

    results.push({
      action: dryRun ? 'would promote' : 'promoted',
      patternName,
      count: cluster.count,
      members: cluster.members.map(m => `#${m.num} ${m.title}`),
    });

    if (!dryRun) {
      fs.appendFileSync(patternsPath, '\n' + entry, 'utf8');
    }
  }

  return results;
}

function promotePatternsToRules(root, patternRefs, options) {
  const dryRun = !(options && options.apply);
  const rulesPath = path.join(root, '.lex', 'pages', 'rules.md');
  const existing = readSafe(rulesPath) || '';
  const results = [];
  const THRESHOLD = 3;

  for (const ref of patternRefs) {
    if (ref.refCount < THRESHOLD) continue;

    const ruleName = `Auto-promoted rule: ${ref.pattern.title}`;
    if (existing.includes(ruleName)) {
      results.push({ action: 'skip', reason: 'already promoted', ruleName });
      continue;
    }

    const entry = `\n## ${ruleName}\n- pattern: ${ref.pattern.title}\n- referenced_in: ${ref.refSessions.length} sessions (${ref.refSessions.join(', ')})\n- rule: ${ref.pattern.what}\n- promoted_from: patterns.md\n`;

    results.push({
      action: dryRun ? 'would promote' : 'promoted',
      ruleName,
      refCount: ref.refCount,
      sessions: ref.refSessions,
    });

    if (!dryRun) {
      fs.appendFileSync(rulesPath, entry, 'utf8');
    }
  }

  return results;
}

function runPromotion(root, options) {
  const dryRun = !(options && options.apply);

  const mistakes = parseMistakes(root);
  const patterns = parsePatterns(root);
  const sessions = parseSessions(root);

  const clusters = findClusters(mistakes);
  const patternRefs = findPatternSessionRefs(patterns, sessions);

  const mistakePromotions = promoteMistakesToPatterns(root, clusters, options);
  const patternPromotions = promotePatternsToRules(root, patternRefs, options);

  return {
    dryRun,
    stats: {
      mistakesAnalyzed: mistakes.length,
      mistakesTodo: mistakes.filter(m => m.isTodo).length,
      clustersFound: clusters.length,
      patternsAnalyzed: patterns.length,
      sessionsAnalyzed: sessions.length,
      patternsReferenced3Plus: patternRefs.filter(p => p.refCount >= 3).length,
    },
    mistakePromotions,
    patternPromotions,
  };
}

function promoteCmd(root, args) {
  const apply = args.includes('--apply');
  const result = runPromotion(root, { apply });

  process.stdout.write(`mistakes analyzed: ${result.stats.mistakesAnalyzed} (${result.stats.mistakesTodo} TODO)\n`);
  process.stdout.write(`clusters found: ${result.stats.clustersFound}\n`);
  process.stdout.write(`patterns analyzed: ${result.stats.patternsAnalyzed}\n`);
  process.stdout.write(`sessions analyzed: ${result.stats.sessionsAnalyzed}\n`);
  process.stdout.write(`patterns referenced 3+: ${result.stats.patternsReferenced3Plus}\n\n`);

  if (result.mistakePromotions.length) {
    process.stdout.write('## Mistake → Pattern promotions\n');
    for (const p of result.mistakePromotions) {
      process.stdout.write(`  [${p.action}] ${p.patternName} (${p.count} occurrences)\n`);
      for (const m of p.members) process.stdout.write(`    - ${m}\n`);
    }
  } else {
    process.stdout.write('## Mistake → Pattern promotions\n  (none found)\n');
  }

  process.stdout.write('\n');

  if (result.patternPromotions.length) {
    process.stdout.write('## Pattern → Rule promotions\n');
    for (const p of result.patternPromotions) {
      process.stdout.write(`  [${p.action}] ${p.ruleName} (referenced in ${p.refCount} sessions)\n`);
      process.stdout.write(`    sessions: ${p.sessions.join(', ')}\n`);
    }
  } else {
    process.stdout.write('## Pattern → Rule promotions\n  (none found)\n');
  }

  if (!apply) {
    process.stdout.write('\n(dry run - use --apply to write promotions)\n');
  }
}

module.exports = { runPromotion, promoteCmd, parseMistakes, parsePatterns, parseSessions, findClusters, findPatternSessionRefs };
