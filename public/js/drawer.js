'use strict';

// ---------- codebase explorer drawer (pane-based, VS Code-ish) ----------
var drawerEl = qs('drawer');
var drawerBackdrop = qs('drawer-backdrop');
var drawerPanesEl = qs('drawer-panes');
var panes = []; // [{ path, terms, rawText, isMd, view, root, contentEl, outlineEl, mdBtn, bodyEl }]
var LINE_CAP = 5000; // raw-view lines rendered up front; rest behind "show remaining"

function currentSearchTerms() {
  var q = qs('search-input').value.trim();
  if (!q) return [];
  return q.split(/\s+/).filter(Boolean).map(function (t) { return t.toLowerCase(); });
}

function lineHasTerm(line, terms) {
  var lower = line.toLowerCase();
  for (var i = 0; i < terms.length; i++) {
    if (terms[i] && lower.indexOf(terms[i]) !== -1) return true;
  }
  return false;
}

function closeCrumbMenus() {
  document.querySelectorAll('.crumb-menu').forEach(function (m) { m.remove(); });
}

function buildCrumbs(pane) {
  var host = textEl('div', null, 'crumbs');
  var parts = pane.path.split('/');
  parts.forEach(function (part, i) {
    if (i < parts.length - 1) {
      var btn = textEl('button', part, 'crumb');
      btn.type = 'button';
      var dir = parts.slice(0, i + 1).join('/');
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var open = host.querySelector('.crumb-menu');
        closeCrumbMenus();
        if (!open) showCrumbMenu(host, dir, pane);
      });
      host.appendChild(btn);
      host.appendChild(textEl('span', '›', 'crumb-sep'));
    } else {
      host.appendChild(textEl('span', part, 'crumb-leaf'));
    }
  });
  return host;
}

function showCrumbMenu(crumbHost, dir, pane) {
  var menu = textEl('div', null, 'crumb-menu');
  crumbHost.appendChild(menu);
  menu.appendChild(textEl('div', 'loading...', 'crumb-menu-item'));
  fetch('/api/ls?dir=' + encodeURIComponent(dir))
    .then(function (r) { return r.json(); })
    .then(function (data) {
      clear(menu);
      if (dir.indexOf('/') !== -1) {
        var up = textEl('button', '← ..', 'crumb-menu-item');
        up.type = 'button';
        up.addEventListener('click', function (e) { e.stopPropagation(); clear(menu); menu.remove(); showCrumbMenu(crumbHost, dir.split('/').slice(0, -1).join('/'), pane); });
        menu.appendChild(up);
      }
      (data.dirs || []).forEach(function (d) {
        var item = textEl('button', '▸ ' + d, 'crumb-menu-item');
        item.type = 'button';
        item.addEventListener('click', function (e) { e.stopPropagation(); menu.remove(); showCrumbMenu(crumbHost, dir + '/' + d, pane); });
        menu.appendChild(item);
      });
      (data.files || []).forEach(function (f) {
        var item = textEl('button', null, 'crumb-menu-item');
        item.type = 'button';
        item.appendChild(document.createTextNode(f));
        var side = textEl('button', '⥠ side', 'side-btn');
        side.type = 'button';
        side.addEventListener('click', function (e) { e.stopPropagation(); closeCrumbMenus(); openToSide(dir + '/' + f); });
        item.appendChild(side);
        item.addEventListener('click', function () { closeCrumbMenus(); loadPane(pane, dir + '/' + f); });
        menu.appendChild(item);
      });
      if (!(data.dirs || []).length && !(data.files || []).length) {
        menu.appendChild(textEl('div', 'empty', 'crumb-menu-item'));
      }
    })
    .catch(function () { clear(menu); menu.appendChild(textEl('div', 'failed to list', 'crumb-menu-item')); });
}

function loadRefs(pane) {
  var refsHost = pane.root.querySelector('.pane-refs');
  clear(refsHost);
  var base = pane.path.split('/').pop();
  var stem = base.replace(/\.[^.]+$/, '');
  if (stem.length < 3) { refsHost.style.display = 'none'; return; }
  fetch('/api/search?q=' + encodeURIComponent(stem))
    .then(function (r) { return r.json(); })
    .then(function (data) {
      var seen = {};
      var rows = (data.rows || []).filter(function (row) {
        if (row.path === pane.path || seen[row.path]) return false;
        seen[row.path] = true;
        return true;
      }).slice(0, 8);
      if (!rows.length) { refsHost.style.display = 'none'; return; }
      refsHost.style.display = '';
      refsHost.appendChild(textEl('span', 'referenced by', 'pane-refs-label'));
      rows.forEach(function (row) {
        var chip = textEl('button', row.path.split('/').pop(), 'ref-chip');
        chip.type = 'button';
        chip.title = row.path + ' (text match, may include false positives)';
        chip.addEventListener('click', function (e) {
          if (e.ctrlKey || e.metaKey) openToSide(row.path);
          else loadPane(pane, row.path);
        });
        refsHost.appendChild(chip);
      });
    })
    .catch(function () { refsHost.style.display = 'none'; });
}

function buildPane() {
  var root = textEl('div', null, 'drawer-pane');
  var header = textEl('div', null, 'drawer-header');
  header.appendChild(textEl('div', null, 'crumbs'));
  var actions = textEl('div', null, 'pane-actions');
  var mdBtn = textEl('button', 'raw', 'pane-btn');
  mdBtn.type = 'button';
  mdBtn.title = 'toggle rendered markdown / raw source';
  mdBtn.style.display = 'none';
  var sideBtn = textEl('button', '⥠ open to side', 'pane-btn');
  sideBtn.type = 'button';
  sideBtn.title = 'duplicate this file into a second pane';
  var closeBtn = textEl('button', '×', 'drawer-close');
  closeBtn.type = 'button';
  actions.appendChild(mdBtn);
  actions.appendChild(sideBtn);
  actions.appendChild(closeBtn);
  header.appendChild(actions);
  root.appendChild(header);
  root.appendChild(textEl('div', null, 'pane-refs'));
  var body = textEl('div', null, 'drawer-body');
  var outline = textEl('div', null, 'drawer-outline');
  var code = document.createElement('ol');
  code.className = 'drawer-code';
  body.appendChild(outline);
  body.appendChild(code);
  root.appendChild(body);
  var pane = { path: '', terms: [], rawText: '', isMd: false, view: 'code', root: root, contentEl: code, outlineEl: outline, mdBtn: mdBtn, bodyEl: body };
  sideBtn.addEventListener('click', function () { openToSide(pane.path); });
  closeBtn.addEventListener('click', function () { closePane(pane); });
  mdBtn.addEventListener('click', function () {
    pane.view = pane.view === 'md' ? 'code' : 'md';
    renderPaneView(pane);
  });
  return pane;
}

function loadPane(pane, filePath) {
  pane.path = filePath;
  pane.terms = currentSearchTerms();
  pane.isMd = /\.(md|markdown)$/i.test(filePath);
  pane.view = pane.isMd ? 'md' : 'code';
  pane.mdBtn.style.display = pane.isMd ? '' : 'none';
  var header = pane.root.querySelector('.drawer-header');
  header.replaceChild(buildCrumbs(pane), header.querySelector('.crumbs'));
  pane.rawText = 'loading...';
  renderPaneView(pane);
  clear(pane.outlineEl);

  fetch('/api/file?path=' + encodeURIComponent(filePath))
    .then(function (r) { if (!r.ok) throw new Error('bad status'); return r.json(); })
    .then(function (data) { renderPaneCode(pane, data.text || ''); })
    .catch(function () {
      pane.rawText = 'failed to load file';
      renderPaneView(pane);
    });

  fetch('/api/symbols?path=' + encodeURIComponent(filePath))
    .then(function (r) { if (!r.ok) throw new Error('bad status'); return r.json(); })
    .then(function (data) { renderPaneOutline(pane, data.rows || []); })
    .catch(function () {
      clear(pane.outlineEl);
      pane.outlineEl.appendChild(textEl('div', 'failed to load symbols', 'empty-state'));
    });

  loadRefs(pane);
}

function renderPaneCode(pane, text) {
  pane.rawText = text;
  renderPaneView(pane);
}

function renderPaneView(pane) {
  pane.mdBtn.textContent = pane.view === 'md' ? 'raw' : 'rendered';
  pane.mdBtn.classList.toggle('active', pane.view === 'md');
  var next;
  if (pane.isMd && pane.view === 'md') {
    next = textEl('div', null, 'drawer-mdview md');
    next.appendChild(renderMarkdown(pane.rawText));
  } else {
    next = document.createElement('ol');
    next.className = 'drawer-code';
    var firstHit = null;
    var lines = pane.rawText.split('\n');
    function appendLines(from, to) {
      for (var n = from; n < to; n++) {
        var li = document.createElement('li');
        li.textContent = lines[n];
        if (pane.terms.length && lineHasTerm(lines[n], pane.terms)) {
          li.classList.add('hit');
          if (!firstHit) firstHit = li;
        }
        next.appendChild(li);
      }
    }
    appendLines(0, Math.min(lines.length, LINE_CAP));
    if (lines.length > LINE_CAP) {
      var more = document.createElement('li');
      more.className = 'drawer-more';
      var moreBtn = textEl('button', 'show remaining ' + (lines.length - LINE_CAP) + ' lines', 'pane-btn');
      moreBtn.type = 'button';
      more.appendChild(moreBtn);
      next.appendChild(more);
      pane.expandAll = function () {
        more.remove();
        appendLines(LINE_CAP, lines.length);
        pane.expandAll = null;
      };
      moreBtn.addEventListener('click', function () { pane.expandAll(); });
    } else {
      pane.expandAll = null;
    }
    if (firstHit) requestAnimationFrame(function () { firstHit.scrollIntoView({ block: 'center' }); });
  }
  pane.bodyEl.replaceChild(next, pane.contentEl);
  pane.contentEl = next;
}

function renderPaneOutline(pane, rows) {
  clear(pane.outlineEl);
  if (!rows.length) {
    pane.outlineEl.appendChild(textEl('div', 'no symbols', 'empty-state'));
    return;
  }
  rows.forEach(function (row) {
    var btn = textEl('button', null, 'drawer-outline-item');
    btn.type = 'button';
    btn.appendChild(textEl('span', row.kind, 'kind'));
    btn.appendChild(document.createTextNode(row.name));
    btn.addEventListener('click', function () {
      if (pane.view === 'md') { pane.view = 'code'; renderPaneView(pane); }
      if (row.line > LINE_CAP && pane.expandAll) pane.expandAll();
      var li = pane.contentEl.children[row.line - 1];
      if (li) li.scrollIntoView({ block: 'center' });
    });
    pane.outlineEl.appendChild(btn);
  });
}

function syncPaneDom() {
  clear(drawerPanesEl);
  panes.forEach(function (p) { drawerPanesEl.appendChild(p.root); });
  drawerEl.classList.toggle('split', panes.length > 1);
}

function openDrawer(filePath) {
  panes = [buildPane()];
  syncPaneDom();
  loadPane(panes[0], filePath);
  drawerEl.classList.add('open');
  drawerBackdrop.classList.add('open');
}

function openToSide(filePath) {
  if (panes.length < 2) {
    panes.push(buildPane());
    syncPaneDom();
  }
  loadPane(panes[panes.length - 1], filePath);
}

function closePane(pane) {
  if (panes.length === 1) return closeDrawer();
  panes = panes.filter(function (p) { return p !== pane; });
  syncPaneDom();
}

function closeDrawer() {
  panes = [];
  drawerEl.classList.remove('open');
  drawerBackdrop.classList.remove('open');
}

document.addEventListener('click', closeCrumbMenus);
drawerBackdrop.addEventListener('click', closeDrawer);

document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') {
    closeCrumbMenus();
    closeSchemaCanvas();
    closeDrawer();
    return;
  }
  if (e.key === '/') {
    var target = e.target;
    var tag = target && target.tagName ? target.tagName.toLowerCase() : '';
    if (tag === 'input' || tag === 'textarea') return;
    e.preventDefault();
    qs('search-input').focus();
  }
});
