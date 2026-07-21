'use strict';

// ---------- search ----------
function renderSearchRows(rows) {
  var host = qs('search-results');
  clear(host);
  if (!rows.length) return;
  rows.forEach(function (row) {
    var rowEl = textEl('div', null, 'search-row');
    var btn = textEl('button', null, 'search-row-btn');
    btn.type = 'button';
    btn.appendChild(textEl('div', row.path, 'search-path'));
    var snipEl = textEl('div', null, 'search-snip');
    buildSnippet(snipEl, row.snip);
    btn.appendChild(snipEl);
    btn.addEventListener('click', function () { openDrawer(row.path); });
    rowEl.appendChild(btn);
    host.appendChild(rowEl);
  });
}

function buildSnippet(container, snip) {
  var parts = snip.split('[[');
  container.appendChild(document.createTextNode(parts[0]));
  for (var i = 1; i < parts.length; i++) {
    var closeIdx = parts[i].indexOf(']]');
    if (closeIdx === -1) {
      container.appendChild(document.createTextNode(parts[i]));
      continue;
    }
    var marked = parts[i].slice(0, closeIdx);
    var rest = parts[i].slice(closeIdx + 2);
    var mark = document.createElement('mark');
    mark.textContent = marked;
    container.appendChild(mark);
    container.appendChild(document.createTextNode(rest));
  }
}

var searchTimer = null;
qs('search-input').addEventListener('input', function (e) {
  var q = e.target.value.trim();
  clearTimeout(searchTimer);
  if (!q) { clear(qs('search-results')); return; }
  searchTimer = setTimeout(function () { runSearch(q); }, 300);
});

function runSearch(q) {
  fetch('/api/search?q=' + encodeURIComponent(q))
    .then(function (r) { return r.json(); })
    .then(function (data) { renderSearchRows(data.rows || []); })
    .catch(function () {});
}
