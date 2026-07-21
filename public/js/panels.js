'use strict';

// ---- theme toggle ----
(function () {
  var saved = null;
  try { saved = localStorage.getItem('lex-theme'); } catch (e) {}
  if (saved === 'light') document.documentElement.setAttribute('data-theme', 'light');
  var btn = document.getElementById('theme-toggle');
  if (btn) btn.addEventListener('click', function () {
    var isLight = document.documentElement.getAttribute('data-theme') === 'light';
    if (isLight) {
      document.documentElement.removeAttribute('data-theme');
      btn.innerHTML = '&#x263E;';
      try { localStorage.setItem('lex-theme', 'dark'); } catch (e) {}
    } else {
      document.documentElement.setAttribute('data-theme', 'light');
      btn.innerHTML = '&#x2600;';
      try { localStorage.setItem('lex-theme', 'light'); } catch (e) {}
    }
  });
  if (saved === 'light' && btn) btn.innerHTML = '&#x2600;';
})();

// ---- collapsible panels ----
var PANEL_NAMES = ['now', 'codebase', 'graph', 'schema', 'memory'];
var PANEL_LABELS = { now: 'Now', codebase: 'Codebase', graph: 'Graph', schema: 'Schema', memory: 'Memory' };

function loadPanelState() {
  var s = null;
  try { s = JSON.parse(localStorage.getItem('lex-panels')); } catch (e) {}
  if (!s) s = {};
  return s;
}

function savePanelState(s) {
  try { localStorage.setItem('lex-panels', JSON.stringify(s)); } catch (e) {}
}

var panelState = loadPanelState();

function applyPanelState() {
  PANEL_NAMES.forEach(function (name) {
    var el = document.getElementById('panel-' + name);
    if (!el) return;
    var st = panelState[name] || 'visible';
    if (st === 'hidden') {
      el.classList.add('hidden');
      el.classList.remove('collapsed');
    } else if (st === 'collapsed') {
      el.classList.add('collapsed');
      el.classList.remove('hidden');
    } else {
      el.classList.remove('hidden', 'collapsed');
    }
  });
}

function toggleCollapse(name) {
  var el = document.getElementById('panel-' + name);
  if (!el) return;
  if (el.classList.contains('hidden')) return;
  var isCollapsed = el.classList.toggle('collapsed');
  panelState[name] = isCollapsed ? 'collapsed' : 'visible';
  savePanelState(panelState);
  rebuildViewMenu();
}

function toggleHidden(name) {
  var el = document.getElementById('panel-' + name);
  if (!el) return;
  var isHidden = el.classList.toggle('hidden');
  if (isHidden) el.classList.remove('collapsed');
  panelState[name] = isHidden ? 'hidden' : 'visible';
  savePanelState(panelState);
  rebuildViewMenu();
}

function rebuildViewMenu() {
  var menu = document.getElementById('view-menu');
  if (!menu) return;
  clear(menu);
  PANEL_NAMES.forEach(function (name) {
    var el = document.getElementById('panel-' + name);
    var isHidden = el && el.classList.contains('hidden');
    var item = document.createElement('button');
    item.className = 'view-menu-item';
    item.type = 'button';
    var check = document.createElement('span');
    check.className = 'check' + (isHidden ? ' off' : '');
    check.textContent = '\u2713';
    item.appendChild(check);
    item.appendChild(document.createTextNode(PANEL_LABELS[name]));
    item.addEventListener('click', function () { toggleHidden(name); });
    menu.appendChild(item);
  });
}

// init collapse buttons
document.querySelectorAll('.collapse-btn').forEach(function (btn) {
  btn.addEventListener('click', function () {
    toggleCollapse(btn.getAttribute('data-panel'));
  });
});

// init view dropdown
var viewBtn = document.getElementById('view-btn');
var viewMenu = document.getElementById('view-menu');
if (viewBtn) {
  viewBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    rebuildViewMenu();
    viewMenu.classList.toggle('open');
  });
}
document.addEventListener('click', function () {
  if (viewMenu) viewMenu.classList.remove('open');
});

applyPanelState();
