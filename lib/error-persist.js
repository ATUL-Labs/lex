'use strict';

const fs = require('node:fs');
const path = require('node:path');

function dedupeKey(err) {
  const msg = (err.message || '').substring(0, 80);
  const file = err.filename || err.file || '';
  return (msg + '|' + file).toLowerCase().trim();
}

function persistErrors(root, consoleErrors, appErrors) {
  const mistakesPath = path.join(root, '.lex', 'pages', 'mistakes.md');
  let existing = '';
  try { existing = fs.readFileSync(mistakesPath, 'utf8'); } catch {}

  const existingKeys = new Set();
  for (const line of existing.split('\n')) {
    const m = line.match(/^## \d+\.\s+(.+)/);
    if (m) existingKeys.add(m[1].toLowerCase().trim());
  }

  const allErrors = [
    ...consoleErrors.map(e => ({
      type: e.type || 'console-error',
      message: e.message || '',
      location: e.filename ? e.filename + ':' + (e.lineno || 0) : '',
      stack: e.stack || '',
    })),
    ...appErrors.map(e => ({
      type: e.type || 'app-error',
      message: e.message || '',
      location: e.command ? 'cmd: ' + e.command : '',
      stack: '',
    })),
  ];

  const newEntries = [];
  for (const err of allErrors) {
    const title = err.message.substring(0, 60).replace(/\n/g, ' ').trim();
    if (existingKeys.has(title.toLowerCase()) || newEntries.some(e => e.message.substring(0, 60).replace(/\n/g, ' ').trim().toLowerCase() === title.toLowerCase())) continue;
    newEntries.push(err);
  }

  if (!newEntries.length) return { added: 0 };

  let content = existing;
  if (!content.endsWith('\n')) content += '\n';

  let nextNum = (existing.match(/^## (\d+)\./gm) || []).length;
  const date = new Date().toISOString().substring(0, 10);

  for (const err of newEntries) {
    nextNum++;
    const title = err.message.substring(0, 60).replace(/\n/g, ' ').trim() || 'Untitled error';
    content += '\n## ' + nextNum + '. ' + title + '\n';
    content += '- when: ' + date + '\n';
    content += '- type: ' + err.type + '\n';
    if (err.location) content += '- where: ' + err.location + '\n';
    content += '- what: ' + (err.message || '').replace(/\n/g, ' ').substring(0, 300) + '\n';
    if (err.stack) {
      const stackLines = err.stack.split('\n').slice(0, 3).join('\n  ');
      content += '- stack:\n  ' + stackLines + '\n';
    }
    content += '- fix: TODO - document the fix\n';
    content += '- rule: TODO - add a rule to prevent this\n';
  }

  fs.writeFileSync(mistakesPath, content, 'utf8');
  return { added: newEntries.length };
}

module.exports = { persistErrors };
