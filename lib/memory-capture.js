'use strict';

/**
 * Real-time Mistake Capture
 *
 * Watches the audit.log for the pattern: edit → run → error → edit (fix)
 * When detected, auto-extracts the error and fix, writes to mistakes.md.
 *
 * No need to wait for `lex synth` at session end — mistakes are captured as they happen.
 */

const fs = require('node:fs');
const path = require('node:path');

function readSafe(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch { return null; }
}

function getAuditEntries(root) {
  const auditPath = path.join(root, '.lex', 'audit.log');
  const content = readSafe(auditPath);
  if (!content) return [];
  return content.trim().split('\n').map(line => {
    const parts = line.split('|').map(s => s.trim());
    if (parts.length < 5) return null;
    const dateTime = parts[0].split(/\s+/);
    return {
      date: dateTime[0] || '',
      time: dateTime[1] || '',
      agent: parts[1] || 'unknown',
      platform: parts[2] || 'unknown',
      action: parts[3] || '',
      file: parts[4] || '',
    };
  }).filter(Boolean);
}

function detectMistakePatterns(entries) {
  const detected = [];

  for (let i = 0; i < entries.length - 2; i++) {
    const e1 = entries[i];
    const e2 = entries[i + 1];
    const e3 = entries[i + 2];

    if (!e1 || !e2 || !e3) continue;

    if (e1.action === 'edit' && e2.action === 'run' && e3.action === 'edit' && e1.file === e3.file) {
      detected.push({
        type: 'edit-run-edit',
        file: e1.file,
        firstEdit: e1,
        run: e2,
        fixEdit: e3,
        description: `Edited ${e1.file}, ran ${e2.file || 'command'}, then edited ${e1.file} again — likely fixing an error`,
      });
    }

    if (e1.action === 'edit' && e2.action === 'error' && e3.action === 'edit' && e1.file === e3.file) {
      detected.push({
        type: 'edit-error-edit',
        file: e1.file,
        firstEdit: e1,
        error: e2,
        fixEdit: e3,
        description: `Edited ${e1.file}, got error, then edited again to fix`,
      });
    }
  }

  for (let i = 0; i < entries.length - 3; i++) {
    const e1 = entries[i];
    const e2 = entries[i + 1];
    const e3 = entries[i + 2];
    const e4 = entries[i + 3];

    if (!e1 || !e2 || !e3 || !e4) continue;

    if (e1.action === 'edit' && e2.action === 'run' && e3.action === 'run' && e4.action === 'edit' && e1.file === e4.file) {
      detected.push({
        type: 'edit-run-run-edit',
        file: e1.file,
        firstEdit: e1,
        run1: e2,
        run2: e3,
        fixEdit: e4,
        description: `Edited ${e1.file}, ran twice (failed then retried), then edited again — likely fixing a runtime error`,
      });
    }
  }

  const fileEditCounts = {};
  for (const e of entries) {
    if (e.action === 'edit') {
      fileEditCounts[e.file] = (fileEditCounts[e.file] || 0) + 1;
    }
  }
  for (const [file, count] of Object.entries(fileEditCounts)) {
    if (count >= 4) {
      const alreadyDetected = detected.some(d => d.file === file);
      if (!alreadyDetected) {
        detected.push({
          type: 'repeated-edits',
          file,
          editCount: count,
          description: `Edited ${file} ${count} times in one session — likely struggling with errors`,
        });
      }
    }
  }

  return detected;
}

function getExistingMistakeCount(root) {
  const content = readSafe(path.join(root, '.lex', 'pages', 'mistakes.md'));
  if (!content) return 0;
  const matches = content.match(/^## (\d+)\./gm);
  if (!matches) return 0;
  return Math.max(...matches.map(m => parseInt(m.match(/\d+/)[0], 10)));
}

function captureMistake(root, detection, options) {
  const dryRun = !(options && options.apply);
  const mistakesPath = path.join(root, '.lex', 'pages', 'mistakes.md');
  const existing = readSafe(mistakesPath) || '';
  const nextNum = getExistingMistakeCount(root) + 1;

  const descHash = detection.description.substring(0, 60);
  if (existing.includes(descHash)) {
    return { action: 'skip', reason: 'already captured', description: detection.description };
  }

  const date = new Date().toISOString().substring(0, 10);
  let entry;

  if (detection.type === 'edit-run-edit' || detection.type === 'edit-error-edit') {
    entry = `## ${nextNum}. Auto-captured: ${detection.type} on ${detection.file}\n- when: ${date}\n- what: ${detection.description}\n- file: ${detection.file}\n- fix: TODO - agent should document what was changed\n- rule: TODO - agent should extract a rule from this\n- auto_captured: true\n`;
  } else if (detection.type === 'edit-run-run-edit') {
    entry = `## ${nextNum}. Auto-captured: ${detection.type} on ${detection.file}\n- when: ${date}\n- what: ${detection.description}\n- file: ${detection.file}\n- fix: TODO - agent should document what was changed\n- rule: TODO - agent should extract a rule from this\n- auto_captured: true\n`;
  } else {
    entry = `## ${nextNum}. Auto-captured: ${detection.type} on ${detection.file}\n- when: ${date}\n- what: ${detection.description}\n- file: ${detection.file}\n- fix: TODO - agent should document what was changed\n- rule: TODO - agent should extract a rule from this\n- auto_captured: true\n`;
  }

  if (!dryRun) {
    fs.appendFileSync(mistakesPath, '\n' + entry, 'utf8');
  }

  return {
    action: dryRun ? 'would capture' : 'captured',
    num: nextNum,
    type: detection.type,
    file: detection.file,
    description: detection.description,
  };
}

function runCapture(root, options) {
  const entries = getAuditEntries(root);
  const detections = detectMistakePatterns(entries);
  const results = detections.map(d => captureMistake(root, d, options));
  return {
    dryRun: !(options && options.apply),
    auditEntries: entries.length,
    detections: detections.length,
    results,
  };
}

function captureCmd(root, args) {
  const apply = args.includes('--apply');
  const result = runCapture(root, { apply });

  process.stdout.write(`audit entries: ${result.auditEntries}\n`);
  process.stdout.write(`mistake patterns detected: ${result.detections}\n\n`);

  if (!result.results.length) {
    process.stdout.write('no mistake patterns detected\n');
    if (!apply) process.stdout.write('(would not capture anything)\n');
    return;
  }

  for (const r of result.results) {
    if (r.action === 'skip') {
      process.stdout.write(`  [skip] ${r.description.substring(0, 60)}... (${r.reason})\n`);
    } else {
      process.stdout.write(`  [${r.action}] #${r.num} ${r.type} on ${r.file}\n`);
      process.stdout.write(`    ${r.description}\n`);
    }
  }

  if (!apply) {
    process.stdout.write('\n(dry run - use --apply to write to mistakes.md)\n');
  }
}

module.exports = { runCapture, captureCmd, detectMistakePatterns, getAuditEntries };
