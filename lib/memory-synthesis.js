'use strict';

/**
 * Auto-Synthesis: Observation stream → structured episode
 *
 * Passively captures what happened during a session by reading:
 * - audit.log (every file edit, with timestamps)
 * - wip.md (what was the task)
 * - status.md (current project state)
 * - live.json (last file touched)
 * - mistakes.md (new entries since session start)
 *
 * Synthesizes into a structured episode WITHOUT agent intervention.
 * The agent doesn't have to call `lex episode` — it just happens.
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

function groupByDate(entries) {
  const byDate = {};
  for (const e of entries) {
    if (!byDate[e.date]) byDate[e.date] = [];
    byDate[e.date].push(e);
  }
  return byDate;
}

function extractSessionEntries(entries, sessionDate) {
  return entries.filter(e => e.date === sessionDate);
}

function inferActions(entries) {
  const actions = {
    filesEdited: [],
    filesCreated: [],
    filesDeleted: [],
    commandsRun: [],
    searches: [],
  };

  const seenEdit = new Set();
  for (const e of entries) {
    if (e.action === 'edit' || e.action === 'write') {
      if (!seenEdit.has(e.file)) {
        actions.filesEdited.push(e.file);
        seenEdit.add(e.file);
      }
    } else if (e.action === 'create') {
      actions.filesCreated.push(e.file);
    } else if (e.action === 'delete') {
      actions.filesDeleted.push(e.file);
    } else if (e.action === 'run' || e.action === 'command') {
      actions.commandsRun.push(e.file);
    } else if (e.action === 'search') {
      actions.searches.push(e.file);
    }
  }

  return actions;
}

function detectNewMistakes(root, sessionDate) {
  const mistakes = readSafe(path.join(root, '.lex', 'pages', 'mistakes.md'));
  if (!mistakes) return [];
  const sections = mistakes.split(/^## /m).slice(1);
  const newMistakes = [];
  for (const section of sections) {
    const dateMatch = section.match(/when:\s*(\d{4}-\d{2}-\d{2})/);
    if (dateMatch && dateMatch[1] === sessionDate) {
      const titleMatch = section.match(/^(.+)/);
      newMistakes.push(titleMatch ? titleMatch[1].trim() : 'unknown');
    }
  }
  return newMistakes;
}

function detectTask(root) {
  const wip = readSafe(path.join(root, '.lex', 'wip.md'));
  if (!wip) return null;
  const titleMatch = wip.match(/^#\s+(.+)/m);
  return titleMatch ? titleMatch[1].trim() : null;
}

function detectPlatform(entries) {
  if (!entries.length) return 'unknown';
  return entries[0].platform || 'unknown';
}

function detectAgent(entries) {
  if (!entries.length) return 'unknown';
  return entries[0].agent || 'unknown';
}

function synthesize(root, options) {
  const sessionDate = (options && options.date) || new Date().toISOString().substring(0, 10);
  const allEntries = getAuditEntries(root);
  const sessionEntries = extractSessionEntries(allEntries, sessionDate);

  if (!sessionEntries.length) {
    return {
      date: sessionDate,
      title: detectTask(root) || 'Session ' + sessionDate,
      agent: 'unknown',
      platform: 'unknown',
      summary: 'No activity recorded for this session.',
      files: [],
      decisions: [],
      bugs: detectNewMistakes(root, sessionDate),
      learnings: [],
      nextSteps: [],
      empty: true,
    };
  }

  const actions = inferActions(sessionEntries);
  const allFiles = [...new Set([...actions.filesEdited, ...actions.filesCreated])];
  const task = detectTask(root);
  const bugs = detectNewMistakes(root, sessionDate);
  const agent = detectAgent(sessionEntries);
  const platform = detectPlatform(sessionEntries);

  const fileGroups = {};
  for (const f of allFiles) {
    const dir = f.split('/').slice(0, 2).join('/');
    if (!fileGroups[dir]) fileGroups[dir] = [];
    fileGroups[dir].push(f);
  }

  const summaryParts = [];
  if (task) summaryParts.push(`Task: ${task}`);
  if (allFiles.length) summaryParts.push(`Modified ${allFiles.length} file(s) in ${Object.keys(fileGroups).length} area(s): ${Object.keys(fileGroups).join(', ')}`);
  if (actions.commandsRun.length) summaryParts.push(`Ran ${actions.commandsRun.length} command(s)`);
  if (bugs.length) summaryParts.push(`Encountered ${bugs.length} bug(s)`);

  const learnings = [];
  if (bugs.length) learnings.push(`${bugs.length} new mistake(s) recorded in mistakes.md`);
  const fileAreas = Object.keys(fileGroups);
  if (fileAreas.length === 1 && fileAreas[0]) learnings.push(`All changes concentrated in ${fileAreas[0]}/`);

  const nextSteps = [];
  const wip = readSafe(path.join(root, '.lex', 'wip.md'));
  if (wip) {
    const pendingSteps = wip.split('\n').filter(l => l.match(/^\d+\.\s/) && !l.includes('[x]')).slice(0, 3);
    for (const s of pendingSteps) nextSteps.push(s.replace(/^\d+\.\s*/, ''));
  }

  return {
    date: sessionDate,
    title: task || `Session ${sessionDate} (${allFiles.length} files)`,
    agent,
    platform,
    summary: summaryParts.join('. ') + '.',
    files: allFiles,
    decisions: [],
    bugs,
    learnings,
    nextSteps,
    fileGroups,
    empty: false,
  };
}

function autoEpisode(root, options) {
  const synth = synthesize(root, options);
  if (synth.empty && !(options && options.force)) return null;

  const { writeEpisode } = require('./memory');
  const filename = writeEpisode(root, {
    title: synth.title,
    summary: synth.summary,
    agent: synth.agent,
    platform: synth.platform,
    files: synth.files,
    decisions: synth.decisions,
    bugs: synth.bugs,
    learnings: synth.learnings,
    nextSteps: synth.nextSteps,
  });

  return { filename, synthesis: synth };
}

module.exports = { synthesize, autoEpisode, getAuditEntries, inferActions };
