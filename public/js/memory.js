'use strict';

// ---------- MCP suggestions (stack-matched, static map, fetched once) ----------
fetch('/api/mcps')
  .then(function (r) { return r.json(); })
  .then(function (data) {
    var rows = data.rows || [];
    if (!rows.length) return;
    var host = qs('mcp-chips');
    rows.forEach(function (row) {
      var chip = textEl('span', null, 'mcp-chip');
      var b = document.createElement('b');
      b.textContent = row.tech;
      chip.appendChild(b);
      chip.appendChild(document.createTextNode(' → ' + row.mcp));
      host.appendChild(chip);
    });
    qs('mcp-suggest').style.display = '';
  })
  .catch(function () {});

// ---------- memory tabs ----------
document.querySelectorAll('.tab-btn').forEach(function (btn) {
  btn.addEventListener('click', function () {
    document.querySelectorAll('.tab-btn').forEach(function (b) { b.classList.remove('active'); });
    btn.classList.add('active');
    var tab = btn.getAttribute('data-tab');
    qs('mem-pages').style.display = tab === 'pages' ? 'grid' : 'none';
    qs('mem-sessions').style.display = tab === 'sessions' ? 'grid' : 'none';
    qs('mem-activity').style.display = tab === 'activity' ? 'block' : 'none';
  });
});

function renderPagesList(pages) {
  var host = qs('pages-list');
  clear(host);
  if (!pages.length) {
    host.appendChild(textEl('li', 'no pages', 'static-item'));
    return;
  }
  pages.forEach(function (name) {
    var li = textEl('li', name);
    if (name === state.activePage) li.classList.add('active');
    li.addEventListener('click', function () { selectPage(name); });
    host.appendChild(li);
  });
}

function selectPage(name) {
  state.activePage = name;
  document.querySelectorAll('#pages-list li').forEach(function (li) {
    li.classList.toggle('active', li.textContent === name);
  });
  var host = qs('pages-content');
  clear(host);
  host.appendChild(textEl('div', 'loading...', 'empty-state'));
  fetch('/api/page?name=' + encodeURIComponent(name))
    .then(function (r) { if (!r.ok) throw new Error('bad status'); return r.json(); })
    .then(function (data) {
      clear(host);
      var frag = renderMarkdown(data.text);
      if (!frag.firstChild) host.appendChild(textEl('div', 'empty page', 'empty-state'));
      else host.appendChild(frag);
    })
    .catch(function () {
      clear(host);
      host.appendChild(textEl('div', 'failed to load page', 'empty-state'));
    });
}

var activeSession = null;

function renderSessionsList(sessions) {
  var host = qs('sessions-list');
  clear(host);
  if (!sessions.length) {
    host.appendChild(textEl('li', 'no sessions', 'static-item'));
    return;
  }
  sessions.forEach(function (name) {
    var li = textEl('li', name);
    if (name === activeSession) li.classList.add('active');
    li.addEventListener('click', function () { selectSession(name); });
    host.appendChild(li);
  });
}

function selectSession(name) {
  activeSession = name;
  document.querySelectorAll('#sessions-list li').forEach(function (li) {
    li.classList.toggle('active', li.textContent === name);
  });
  var host = qs('sessions-content');
  clear(host);
  host.appendChild(textEl('div', 'loading...', 'empty-state'));
  fetch('/api/session?name=' + encodeURIComponent(name))
    .then(function (r) { if (!r.ok) throw new Error('bad status'); return r.json(); })
    .then(function (data) {
      clear(host);
      var frag = renderMarkdown(data.text);
      if (!frag.firstChild) host.appendChild(textEl('div', 'empty session', 'empty-state'));
      else host.appendChild(frag);
    })
    .catch(function () {
      clear(host);
      host.appendChild(textEl('div', 'failed to load session', 'empty-state'));
    });
}
