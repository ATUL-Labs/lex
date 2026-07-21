'use strict';

// ---------- status.md rendering ----------
function renderStatus(status) {
  var host = qs('status-content');
  clear(host);
  if (!status) {
    host.appendChild(textEl('div', 'no status recorded', 'empty-state'));
    return;
  }
  var frag = renderMarkdown(status);
  if (!frag.firstChild) {
    host.appendChild(textEl('div', 'no status recorded', 'empty-state'));
    return;
  }
  host.className = 'md';
  host.appendChild(frag);
}

// ---------- wip.md rendering ----------
var WIP_RE = /^\s*(?:[-*]|\d+\.)\s*\[([ xX])\]\s*(.*)$/;

function renderWip(wip) {
  var host = qs('wip-content');
  clear(host);
  if (!wip) {
    host.appendChild(textEl('div', 'no active work', 'empty-state'));
    return;
  }
  var lines = wip.split('\n').filter(function (l) { return l.trim() !== ''; });
  if (!lines.length) {
    host.appendChild(textEl('div', 'no active work', 'empty-state'));
    return;
  }
  var list = textEl('ul', null, 'wip-list');
  var any = false;
  var total = 0;
  var done = 0;
  lines.forEach(function (line) {
    var m = line.match(WIP_RE);
    if (m) {
      any = true;
      total++;
      var isDone = m[1].toLowerCase() === 'x';
      if (isDone) done++;
      var li = textEl('li', null, 'wip-item');
      var box = textEl('span', null, 'wip-box' + (isDone ? ' checked' : ''));
      var txt = textEl('span', m[2], 'wip-text' + (isDone ? ' done' : ''));
      li.appendChild(box);
      li.appendChild(txt);
      list.appendChild(li);
    } else if (!/^#/.test(line.trim())) {
      any = true;
      list.appendChild(textEl('li', line, 'wip-plain'));
    }
  });
  if (!any) {
    host.appendChild(textEl('div', 'no active work', 'empty-state'));
  } else {
    if (total > 0) {
      var pct = Math.round((done / total) * 100);
      var progress = textEl('div', null, 'wip-progress');
      progress.appendChild(textEl('div', done + ' of ' + total + ' done', 'wip-progress-label'));
      var track = textEl('div', null, 'wip-progress-track');
      var fill = textEl('div', null, 'wip-progress-fill');
      fill.style.width = pct + '%';
      track.appendChild(fill);
      progress.appendChild(track);
      host.appendChild(progress);
    }
    host.appendChild(list);
  }
}

// ---------- codebase stats ----------
function renderIndex(index) {
  qs('stat-files').textContent = index.files;
  qs('stat-symbols').textContent = index.symbols;
  qs('stat-links').textContent = index.links;
}
