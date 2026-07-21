'use strict';

// ---------- schema ERD ----------
function renderSchemaCard(table) {
  var card = textEl('div', null, 'schema-card');
  card.dataset.table = table.name;
  card.appendChild(textEl('div', table.name, 'schema-card-title'));
  table.columns.forEach(function (col) {
    var row = textEl('div', null, 'schema-col');
    row.appendChild(textEl('span', col.name, 'schema-col-name'));
    row.appendChild(textEl('span', col.type || '', 'schema-col-type'));
    if (col.fkTable) {
      row.appendChild(textEl('span', '→ ' + col.fkTable, 'schema-col-fk'));
    }
    card.appendChild(row);
  });
  var actions = textEl('div', null, 'schema-card-actions');
  var btn = textEl('button', 'View Data', 'schema-data-btn');
  btn.type = 'button';
  btn.addEventListener('click', function (e) {
    e.stopPropagation();
    openDataModal(table.name);
  });
  actions.appendChild(btn);
  card.appendChild(actions);
  return card;
}

function drawSchemaLines(tables) {
  var wrap = qs('schema-wrap');
  var svg = wrap.querySelector('.schema-lines');
  if (svg) svg.remove();
  var wrapRect = wrap.getBoundingClientRect();
  svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'schema-lines');
  svg.setAttribute('width', wrapRect.width);
  svg.setAttribute('height', wrapRect.height);

  var byName = {};
  tables.forEach(function (t) { byName[t.name] = t; });

  wrap.querySelectorAll('.schema-card').forEach(function (card) {
    if (card.classList.contains('hidden')) return;
    var tableName = card.dataset.table;
    var table = byName[tableName];
    if (!table) return;
    table.columns.forEach(function (col) {
      if (!col.fkTable || !byName[col.fkTable]) return;
      var targetCard = wrap.querySelector('.schema-card[data-table="' + CSS.escape(col.fkTable) + '"]');
      if (!targetCard || targetCard.classList.contains('hidden')) return;
      var a = card.getBoundingClientRect();
      var b = targetCard.getBoundingClientRect();
      var x1 = a.left + a.width / 2 - wrapRect.left;
      var y1 = a.top + a.height / 2 - wrapRect.top;
      var x2 = b.left + b.width / 2 - wrapRect.left;
      var y2 = b.top + b.height / 2 - wrapRect.top;
      var midY = (y1 + y2) / 2;
      var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', 'M ' + x1 + ' ' + y1 + ' C ' + x1 + ' ' + midY + ', ' + x2 + ' ' + midY + ', ' + x2 + ' ' + y2);
      path.setAttribute('stroke', getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#4de3ff');
      path.setAttribute('stroke-width', '1.5');
      path.setAttribute('fill', 'none');
      svg.appendChild(path);
    });
  });

  wrap.appendChild(svg);
}

function openDataModal(tableName) {
  var existing = document.getElementById('data-modal');
  if (existing) existing.remove();

  var modal = textEl('div', null, 'data-modal');
  modal.id = 'data-modal';
  var content = textEl('div', null, 'data-modal-content');
  var titleBar = textEl('div', null, 'data-modal-title');
  titleBar.appendChild(textEl('span', 'Table: ' + tableName));
  var closeBtn = textEl('button', '\u00d7', 'data-modal-close');
  closeBtn.type = 'button';
  closeBtn.addEventListener('click', function () { modal.remove(); });
  titleBar.appendChild(closeBtn);
  content.appendChild(titleBar);

  var body = textEl('div', null, 'data-modal-body');
  body.appendChild(textEl('div', 'Loading...', 'data-loading'));
  content.appendChild(body);
  modal.appendChild(content);
  modal.addEventListener('click', function (e) { if (e.target === modal) modal.remove(); });
  document.body.appendChild(modal);

  var currentPage = 1;

  function loadPage(page) {
    currentPage = page;
    clear(body);
    body.appendChild(textEl('div', 'Loading...', 'data-loading'));
    fetch('/api/schema/data?table=' + encodeURIComponent(tableName) + '&page=' + page)
      .then(function (r) { return r.json(); })
      .then(function (data) {
        clear(body);
        if (data.error) {
          body.appendChild(textEl('div', data.error, 'data-error'));
          return;
        }
        var rows = data.rows || [];
        if (!rows.length) {
          body.appendChild(textEl('div', 'No rows in this table', 'data-loading'));
          return;
        }
        var cols = Object.keys(rows[0]);
        var table = document.createElement('table');
        table.className = 'data-table';
        var thead = document.createElement('thead');
        var tr = document.createElement('tr');
        cols.forEach(function (c) {
          var th = document.createElement('th');
          th.textContent = c;
          tr.appendChild(th);
        });
        thead.appendChild(tr);
        table.appendChild(thead);
        var tbody = document.createElement('tbody');
        rows.forEach(function (row) {
          var tr2 = document.createElement('tr');
          cols.forEach(function (c) {
            var td = document.createElement('td');
            var val = row[c];
            if (val === null || val === undefined) td.textContent = 'NULL';
            else if (typeof val === 'object') td.textContent = JSON.stringify(val).substring(0, 100);
            else td.textContent = String(val).substring(0, 200);
            td.title = val === null ? 'NULL' : String(val);
            tr2.appendChild(td);
          });
          tbody.appendChild(tr2);
        });
        table.appendChild(tbody);
        body.appendChild(table);

        var pagination = textEl('div', null, 'data-pagination');
        var prevBtn = textEl('button', '\u2190 Prev');
        prevBtn.type = 'button';
        prevBtn.disabled = page <= 1;
        prevBtn.addEventListener('click', function () { loadPage(page - 1); });
        pagination.appendChild(prevBtn);

        var info = textEl('span', 'Page ' + page + ' of ' + (data.pages || 1) + ' (' + (data.total || 0) + ' rows)');
        pagination.appendChild(info);

        var nextBtn = textEl('button', 'Next \u2192');
        nextBtn.type = 'button';
        nextBtn.disabled = page >= (data.pages || 1);
        nextBtn.addEventListener('click', function () { loadPage(page + 1); });
        pagination.appendChild(nextBtn);
        body.appendChild(pagination);
      })
      .catch(function (err) {
        clear(body);
        body.appendChild(textEl('div', 'Failed to load: ' + err.message, 'data-error'));
      });
  }

  loadPage(1);
}

function renderSchema(tables, filterQuery) {
  var host = qs('schema-content');
  clear(host);
  var wrap = qs('schema-wrap');
  var oldLines = wrap.querySelector('.schema-lines');
  if (oldLines) oldLines.remove();

  if (!tables.length) {
    host.appendChild(textEl('div', 'no schema detected (no migrations or SQL files indexed)', 'schema-empty'));
    return;
  }

  var q = (filterQuery || '').trim().toLowerCase();
  var cards = textEl('div', null, 'schema-cards');
  tables.forEach(function (table) {
    var card = renderSchemaCard(table);
    if (q && table.name.toLowerCase().indexOf(q) === -1) {
      card.classList.add('hidden');
    }
    cards.appendChild(card);
  });
  host.appendChild(cards);

  requestAnimationFrame(function () { drawSchemaLines(tables); });
}

qs('schema-filter').addEventListener('input', function (e) {
  renderSchema(state.schemaTables, e.target.value);
});

window.addEventListener('resize', function () {
  if (state.schemaTables.length) drawSchemaLines(state.schemaTables);
});

function fetchSchema(force) {
  var now = Date.now();
  if (!force && now - state.schemaFetchedAt < 30000) return;
  state.schemaFetchedAt = now;
  fetch('/api/schema')
    .then(function (r) {
      if (!r.ok) throw new Error('bad status');
      return r.json();
    })
    .then(function (data) {
      state.schemaTables = data.tables || [];
      renderSchema(state.schemaTables, qs('schema-filter').value);
    })
    .catch(function () {});
}

// ---------- schema fullscreen canvas (pan / zoom / drag) ----------
var canvas = {
  view: { x: 40, y: 40, s: 1 },
  pos: {},        // tableName -> {x, y}
  sizes: {},      // tableName -> {w, h} measured after mount
  worldEl: qs('schema-world'),
  viewportEl: qs('schema-viewport'),
};
var POS_KEY = 'ctxSchemaPos';

function canvasApply() {
  canvas.worldEl.style.transform =
    'translate(' + canvas.view.x + 'px,' + canvas.view.y + 'px) scale(' + canvas.view.s + ')';
}

// deterministic layout: FK-connected clusters side by side, masonry inside each
function canvasLayout(tables) {
  var saved = {};
  try { saved = JSON.parse(localStorage.getItem(POS_KEY) || '{}'); } catch {}
  var byName = {};
  tables.forEach(function (t) { byName[t.name] = t; });
  var adj = {};
  tables.forEach(function (t) {
    adj[t.name] = adj[t.name] || [];
    t.columns.forEach(function (c) {
      if (c.fkTable && byName[c.fkTable]) {
        adj[t.name].push(c.fkTable);
        (adj[c.fkTable] = adj[c.fkTable] || []).push(t.name);
      }
    });
  });
  var seen = {};
  var clusters = [];
  tables.forEach(function (t) {
    if (seen[t.name]) return;
    var q = [t.name], members = [];
    seen[t.name] = true;
    while (q.length) {
      var n = q.shift();
      members.push(n);
      (adj[n] || []).forEach(function (m) { if (!seen[m]) { seen[m] = true; q.push(m); } });
    }
    clusters.push(members);
  });
  clusters.sort(function (a, b) { return b.length - a.length; });

  var CARD_W = 220, GAP = 40, clusterX = 0;
  canvas.pos = {};
  clusters.forEach(function (members) {
    var cols = Math.max(1, Math.ceil(Math.sqrt(members.length)));
    var colY = [];
    for (var i = 0; i < cols; i++) colY.push(0);
    members.forEach(function (name) {
      var col = colY.indexOf(Math.min.apply(null, colY));
      var h = (canvas.sizes[name] || { h: 30 + 18 * (byName[name].columns.length || 1) }).h;
      canvas.pos[name] = { x: clusterX + col * (CARD_W + GAP), y: colY[col] };
      colY[col] += h + GAP;
    });
    clusterX += cols * (CARD_W + GAP) + GAP * 2;
  });
  // saved drag positions win over auto-layout
  Object.keys(saved).forEach(function (name) {
    if (canvas.pos[name]) canvas.pos[name] = saved[name];
  });
}

function canvasDrawLines(tables) {
  var old = canvas.worldEl.querySelector('svg');
  if (old) old.remove();
  var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', 10);
  svg.setAttribute('height', 10);
  tables.forEach(function (t) {
    var a = canvas.pos[t.name];
    if (!a) return;
    t.columns.forEach(function (c) {
      var b = c.fkTable && canvas.pos[c.fkTable];
      if (!b) return;
      var sa = canvas.sizes[t.name] || { w: 220, h: 60 };
      var sb = canvas.sizes[c.fkTable] || { w: 220, h: 60 };
      var x1 = a.x + sa.w / 2, y1 = a.y + sa.h / 2;
      var x2 = b.x + sb.w / 2, y2 = b.y + sb.h / 2;
      var midX = (x1 + x2) / 2;
      var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', 'M ' + x1 + ' ' + y1 + ' C ' + midX + ' ' + y1 + ', ' + midX + ' ' + y2 + ', ' + x2 + ' ' + y2);
      path.setAttribute('stroke', getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#4de3ff');
      path.setAttribute('stroke-width', '1.5');
      path.setAttribute('fill', 'none');
      path.dataset.a = t.name;
      path.dataset.b = c.fkTable;
      svg.appendChild(path);
    });
  });
  canvas.worldEl.insertBefore(svg, canvas.worldEl.firstChild);
  applySelection();
}

// ---------- table selection: focus one table + its FK neighbors ----------
function selectTable(name) {
  canvas.selected = canvas.selected === name ? null : name;
  applySelection();
}

function applySelection() {
  var sel = canvas.selected;
  var neighbors = {};
  if (sel) {
    neighbors[sel] = true;
    canvas.worldEl.querySelectorAll('svg path').forEach(function (p) {
      if (p.dataset.a === sel) neighbors[p.dataset.b] = true;
      if (p.dataset.b === sel) neighbors[p.dataset.a] = true;
    });
  }
  canvas.worldEl.querySelectorAll('.schema-card').forEach(function (card) {
    var t = card.dataset.table;
    card.classList.toggle('focus', sel === t);
    card.classList.toggle('neighbor', !!sel && t !== sel && !!neighbors[t]);
    card.classList.toggle('dim', !!sel && !neighbors[t]);
  });
  canvas.worldEl.querySelectorAll('svg path').forEach(function (p) {
    var touches = sel && (p.dataset.a === sel || p.dataset.b === sel);
    p.classList.toggle('hi-line', !!touches);
    p.classList.toggle('dim-line', !!sel && !touches);
  });
}

function canvasMountCards(tables) {
  clear(canvas.worldEl);
  tables.forEach(function (t) {
    var card = renderSchemaCard(t);
    canvas.worldEl.appendChild(card);
    enableCardDrag(card, t.name, tables);
  });
  // measure real heights, then lay out and place
  canvas.sizes = {};
  canvas.worldEl.querySelectorAll('.schema-card').forEach(function (card) {
    canvas.sizes[card.dataset.table] = { w: card.offsetWidth, h: card.offsetHeight };
  });
  canvasLayout(tables);
  canvas.worldEl.querySelectorAll('.schema-card').forEach(function (card) {
    var p = canvas.pos[card.dataset.table];
    if (p) { card.style.left = p.x + 'px'; card.style.top = p.y + 'px'; }
  });
  canvasDrawLines(tables);
}

function canvasFit(tables) {
  var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  tables.forEach(function (t) {
    var p = canvas.pos[t.name];
    var s = canvas.sizes[t.name] || { w: 220, h: 60 };
    if (!p) return;
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x + s.w); maxY = Math.max(maxY, p.y + s.h);
  });
  if (minX === Infinity) return;
  // viewport can measure 0 mid-open (display just flipped); fall back to window size
  var vw = canvas.viewportEl.clientWidth || window.innerWidth;
  var vh = canvas.viewportEl.clientHeight || (window.innerHeight - 51);
  var s = Math.min(vw / (maxX - minX + 80), vh / (maxY - minY + 80), 1.5);
  canvas.view.s = Math.max(0.1, s);
  canvas.view.x = (vw - (maxX - minX) * canvas.view.s) / 2 - minX * canvas.view.s;
  canvas.view.y = (vh - (maxY - minY) * canvas.view.s) / 2 - minY * canvas.view.s;
  canvasApply();
}

function enableCardDrag(card, name, tables) {
  card.addEventListener('pointerdown', function (e) {
    e.stopPropagation();
    try { card.setPointerCapture(e.pointerId); } catch {}
    var startX = e.clientX, startY = e.clientY;
    var orig = canvas.pos[name];
    var lineRedrawQueued = false;
    var maxMove = 0;
    function move(ev) {
      maxMove = Math.max(maxMove, Math.abs(ev.clientX - startX), Math.abs(ev.clientY - startY));
      canvas.pos[name] = {
        x: orig.x + (ev.clientX - startX) / canvas.view.s,
        y: orig.y + (ev.clientY - startY) / canvas.view.s,
      };
      card.style.left = canvas.pos[name].x + 'px';
      card.style.top = canvas.pos[name].y + 'px';
      // coalesce line redraws to one per frame; pointermove can fire at 120Hz+
      if (!lineRedrawQueued) {
        lineRedrawQueued = true;
        requestAnimationFrame(function () {
          lineRedrawQueued = false;
          canvasDrawLines(tables);
        });
      }
    }
    function up() {
      card.removeEventListener('pointermove', move);
      card.removeEventListener('pointerup', up);
      if (maxMove < 5) {
        // a click, not a drag: toggle focus on this table
        canvas.pos[name] = orig;
        card.style.left = orig.x + 'px';
        card.style.top = orig.y + 'px';
        selectTable(name);
        return;
      }
      canvasDrawLines(tables);
      var saved = {};
      try { saved = JSON.parse(localStorage.getItem(POS_KEY) || '{}'); } catch {}
      saved[name] = canvas.pos[name];
      try { localStorage.setItem(POS_KEY, JSON.stringify(saved)); } catch {}
    }
    card.addEventListener('pointermove', move);
    card.addEventListener('pointerup', up);
  });
}

canvas.viewportEl.addEventListener('pointerdown', function (e) {
  canvas.viewportEl.classList.add('panning');
  try { canvas.viewportEl.setPointerCapture(e.pointerId); } catch {}
  var startX = e.clientX, startY = e.clientY;
  var origX = canvas.view.x, origY = canvas.view.y;
  var maxMove = 0;
  function move(ev) {
    maxMove = Math.max(maxMove, Math.abs(ev.clientX - startX), Math.abs(ev.clientY - startY));
    canvas.view.x = origX + ev.clientX - startX;
    canvas.view.y = origY + ev.clientY - startY;
    canvasApply();
  }
  function up() {
    canvas.viewportEl.classList.remove('panning');
    canvas.viewportEl.removeEventListener('pointermove', move);
    canvas.viewportEl.removeEventListener('pointerup', up);
    if (maxMove < 5 && canvas.selected) selectTable(canvas.selected); // click empty canvas clears focus
  }
  canvas.viewportEl.addEventListener('pointermove', move);
  canvas.viewportEl.addEventListener('pointerup', up);
});

function canvasZoom(factor, cx, cy) {
  var ns = Math.min(2.5, Math.max(0.1, canvas.view.s * factor));
  var k = ns / canvas.view.s;
  canvas.view.x = cx - (cx - canvas.view.x) * k;
  canvas.view.y = cy - (cy - canvas.view.y) * k;
  canvas.view.s = ns;
  canvasApply();
}

canvas.viewportEl.addEventListener('wheel', function (e) {
  e.preventDefault();
  var rect = canvas.viewportEl.getBoundingClientRect();
  canvasZoom(Math.exp(-e.deltaY * 0.0015), e.clientX - rect.left, e.clientY - rect.top);
}, { passive: false });

qs('schema-zoom-in').addEventListener('click', function () {
  canvasZoom(1.25, canvas.viewportEl.clientWidth / 2, canvas.viewportEl.clientHeight / 2);
});
qs('schema-zoom-out').addEventListener('click', function () {
  canvasZoom(0.8, canvas.viewportEl.clientWidth / 2, canvas.viewportEl.clientHeight / 2);
});
qs('schema-zoom-fit').addEventListener('click', function () { canvasFit(state.schemaTables); });
qs('schema-layout-reset').addEventListener('click', function () {
  try { localStorage.removeItem(POS_KEY); } catch {}
  canvasMountCards(state.schemaTables);
  canvasFit(state.schemaTables);
});

qs('schema-canvas-filter').addEventListener('input', function (e) {
  var q = e.target.value.trim().toLowerCase();
  canvas.worldEl.querySelectorAll('.schema-card').forEach(function (card) {
    var match = !q || card.dataset.table.toLowerCase().indexOf(q) !== -1;
    card.classList.toggle('dim', q && !match);
    card.classList.toggle('focus', q && match);
  });
});

function openSchemaCanvas() {
  qs('schema-overlay').classList.add('open');
  canvasMountCards(state.schemaTables);
  canvasFit(state.schemaTables);
}

function closeSchemaCanvas() {
  qs('schema-overlay').classList.remove('open');
}

qs('schema-expand').addEventListener('click', openSchemaCanvas);
qs('schema-overlay-close').addEventListener('click', closeSchemaCanvas);
