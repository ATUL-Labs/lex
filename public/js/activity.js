'use strict';

// ---------- activity timeline ----------
function parseActivityLine(line) {
  var parts = line.split(' | ');
  if (parts.length < 4) return null;
  var time = parts[0].trim();
  var dateMatch = time.match(/^(\d{4}-\d{2}-\d{2})/);
  return {
    key: line,
    time: time,
    date: dateMatch ? dateMatch[1] : 'unknown',
    agent: parts[1].trim(),
    platform: parts[2].trim(),
    action: parts[3].trim(),
    target: parts.length > 4 ? parts.slice(4).join(' | ').trim() : '',
  };
}

function renderActivity(lines) {
  var host = qs('activity-list');
  clear(host);
  if (!lines.length) {
    host.appendChild(textEl('div', 'no activity recorded', 'empty-state'));
    return;
  }
  var entries = lines.map(parseActivityLine).filter(Boolean).slice().reverse();
  if (!entries.length) {
    host.appendChild(textEl('div', 'no activity recorded', 'empty-state'));
    return;
  }

  var isFirstPoll = state.seenActivityKeys === null;
  var prevKeys = state.seenActivityKeys || {};
  var nextKeys = {};

  var lastDate = null;
  entries.forEach(function (entry) {
    if (entry.date !== lastDate) {
      lastDate = entry.date;
      host.appendChild(textEl('div', entry.date, 'timeline-date'));
    }
    var isNew = !isFirstPoll && !prevKeys[entry.key];
    nextKeys[entry.key] = true;
    var row = textEl('div', null, 'timeline-row' + (isNew ? ' flash' : ''));
    row.appendChild(textEl('span', entry.time, 'timeline-time'));
    row.appendChild(textEl('span', entry.agent, 'timeline-agent'));
    row.appendChild(textEl('span', entry.action, 'timeline-action'));
    row.appendChild(textEl('span', entry.target, 'timeline-target'));
    host.appendChild(row);
  });

  state.seenActivityKeys = nextKeys;
}
