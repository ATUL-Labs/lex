'use strict';

// ---------- links graph (v2: grouped rows) ----------
function methodClass(method) {
  var m = (method || '').toUpperCase();
  if (m === 'GET') return 'method-get';
  if (m === 'POST') return 'method-post';
  if (m === 'PATCH') return 'method-patch';
  if (m === 'PUT') return 'method-put';
  if (m === 'DELETE') return 'method-delete';
  return 'method-other';
}

function refLabel(entry) {
  return entry.path + ':' + entry.line;
}

function buildGraphGroups(rows) {
  var byUrl = {};
  rows.forEach(function (r) {
    if (!byUrl[r.url]) byUrl[r.url] = { url: r.url, routes: [], consumers: [] };
    if (r.side === 'route') byUrl[r.url].routes.push(r);
    else byUrl[r.url].consumers.push(r);
  });
  var matched = [], routeOnly = [], consumerOnly = [];
  Object.keys(byUrl).sort().forEach(function (url) {
    var entry = byUrl[url];
    var hasRoute = entry.routes.length > 0;
    var hasConsumer = entry.consumers.length > 0;
    if (hasRoute && hasConsumer) matched.push(entry);
    else if (hasRoute) routeOnly.push(entry);
    else consumerOnly.push(entry);
  });
  return matched.concat(routeOnly, consumerOnly);
}

function renderGraphRow(entry) {
  var hasRoute = entry.routes.length > 0;
  var hasConsumer = entry.consumers.length > 0;
  var matchedRow = hasRoute && hasConsumer;
  var row = textEl('div', null, 'graph-row' + (matchedRow ? ' matched' : '') + (!hasRoute && hasConsumer ? ' dimmed' : ''));

  var methods = textEl('div', null, 'graph-methods');
  var seen = {};
  var firstMethod = '';
  entry.routes.concat(entry.consumers).forEach(function (r) {
    var m = (r.method || '').toUpperCase();
    if (!m || seen[m]) return;
    seen[m] = true;
    if (!firstMethod) firstMethod = m;
    methods.appendChild(textEl('span', m, 'method-chip ' + methodClass(m)));
  });
  row.appendChild(methods);

  row.appendChild(textEl('div', entry.url, 'graph-url'));

  var refs = textEl('div', null, 'graph-refs');
  entry.routes.forEach(function (r) {
    refs.appendChild(textEl('div', refLabel(r), 'graph-ref ref-route'));
  });
  entry.consumers.forEach(function (r) {
    refs.appendChild(textEl('div', refLabel(r), 'graph-ref ref-consumer'));
  });
  row.appendChild(refs);

  var actions = textEl('div', null, 'graph-actions');
  var testBtn = textEl('button', 'Test', 'graph-test-btn');
  testBtn.type = 'button';
  testBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    var testUrl = entry.url;
    if (testUrl.indexOf('://') === -1) {
      fetch('/api/app-url').then(function(r){return r.json();}).then(function(data){
        var baseUrl = data.appUrl || window.location.origin;
        if (testUrl.indexOf('://') === -1) testUrl = baseUrl + (testUrl.startsWith('/') ? testUrl : '/' + testUrl);
        if (typeof openApiTester === 'function') openApiTester(testUrl, firstMethod || 'GET');
      }).catch(function(){
        if (testUrl.indexOf('://') === -1) testUrl = window.location.origin + (testUrl.startsWith('/') ? testUrl : '/' + testUrl);
        if (typeof openApiTester === 'function') openApiTester(testUrl, firstMethod || 'GET');
      });
    } else {
      if (typeof openApiTester === 'function') openApiTester(testUrl, firstMethod || 'GET');
    }
  });
  actions.appendChild(testBtn);
  row.appendChild(actions);

  return row;
}

function renderGraph(rows, filterQuery) {
  var host = qs('graph-content');
  clear(host);
  if (!rows.length) {
    host.appendChild(textEl('div', 'no API links indexed', 'graph-empty'));
    return;
  }
  var groups = buildGraphGroups(rows);
  var q = (filterQuery || '').trim().toLowerCase();
  if (q) {
    groups = groups.filter(function (g) { return g.url.toLowerCase().indexOf(q) !== -1; });
  }
  if (!groups.length) {
    host.appendChild(textEl('div', 'no matching links', 'graph-empty'));
    return;
  }
  var capped = groups.slice(0, 500);
  var overflow = groups.length - capped.length;

  var body = textEl('div', null, 'graph-body');
  capped.forEach(function (entry) { body.appendChild(renderGraphRow(entry)); });
  host.appendChild(body);

  if (overflow > 0) {
    host.appendChild(textEl('div', '+' + overflow + ' more', 'empty-state'));
  }
}

qs('graph-filter').addEventListener('input', function (e) {
  renderGraph(state.graphRows, e.target.value);
});

function fetchLinks(force) {
  var now = Date.now();
  if (!force && now - state.linksFetchedAt < 60000) return;
  state.linksFetchedAt = now;
  fetch('/api/links')
    .then(function (r) { if (!r.ok) throw new Error('bad status'); return r.json(); })
    .then(function (data) {
      state.graphRows = data.rows || [];
      renderGraph(state.graphRows, qs('graph-filter').value);
    })
    .catch(function () {});
}

// ---------- Dev Loop ----------
function openDevLoopModal() {
  var existing = document.getElementById('devloop-modal');
  if (existing) existing.remove();

  var modal = textEl('div', null, 'api-tester-modal');
  modal.id = 'devloop-modal';
  var content = textEl('div', null, 'api-tester-content');
  var titleBar = textEl('div', null, 'api-tester-title');
  titleBar.appendChild(textEl('span', 'Dev Loop — Test All Endpoints', 'api-tester-title-text'));
  var closeBtn = textEl('button', '\u00d7', 'api-tester-close');
  closeBtn.type = 'button';
  closeBtn.addEventListener('click', function () { modal.remove(); });
  titleBar.appendChild(closeBtn);
  content.appendChild(titleBar);

  var responseArea = textEl('div', null, 'api-tester-response');
  responseArea.appendChild(textEl('div', 'Checking app server...', 'api-tester-loading'));
  content.appendChild(responseArea);

  modal.appendChild(content);
  modal.addEventListener('click', function (e) { if (e.target === modal) modal.remove(); });
  document.body.appendChild(modal);

  fetch('/api/app-url')
    .then(function(r) { return r.json(); })
    .then(function(info) {
      clear(responseArea);
      var statusRow = textEl('div', null, 'app-status-row');
      var dot = textEl('span', null, 'app-status-dot ' + (info.appRunning ? 'online' : 'offline'));
      var statusText = info.appRunning
        ? 'App server running at ' + info.appUrl
        : 'App server NOT running at ' + info.appUrl + ' — start it first (see run.md)';
      statusRow.appendChild(dot);
      statusRow.appendChild(textEl('span', statusText, 'app-status-text'));
      responseArea.appendChild(statusRow);

      if (!info.appRunning) {
        var hint = textEl('div', null, 'app-status-hint');
        hint.appendChild(textEl('span', 'Dev loop will skip all endpoints until the app is started.', 'app-status-hint-text'));
        responseArea.appendChild(hint);
      }

      var loader = textEl('div', null, 'api-tester-loading');
      loader.appendChild(textEl('span', 'Running dev loop...', 'api-tester-spinner'));
      responseArea.appendChild(loader);

      fetch('/api/devloop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
        .then(function (r) { return r.json(); })
        .then(function (report) { renderDevLoopReport(responseArea, report); })
        .catch(function (err) {
          clear(responseArea);
          responseArea.appendChild(textEl('div', 'Dev loop failed: ' + err.message, 'api-tester-error'));
        });
    })
    .catch(function () {
      clear(responseArea);
      responseArea.appendChild(textEl('div', 'Could not check app status', 'api-tester-error'));
    });
}

function renderDevLoopReport(host, report) {
  clear(host);

  var summary = textEl('div', null, 'api-tester-xss-summary ' + (report.failed === 0 ? 'safe' : 'vulnerable'));
  summary.appendChild(textEl('span', report.summary, 'xss-summary-text'));
  host.appendChild(summary);

  if (report.errors.length) {
    var errHeader = textEl('div', null, 'api-tester-findings-header');
    errHeader.appendChild(textEl('span', 'Errors to Fix (' + report.errors.length + ')', 'findings-title'));
    host.appendChild(errHeader);

    var errList = textEl('div', null, 'api-tester-findings');
    report.errors.forEach(function (e) {
      var item = textEl('div', null, 'finding severity-high');
      item.appendChild(textEl('span', '[ERR]', 'finding-sev'));
      item.appendChild(textEl('span', e.method + ' ' + e.endpoint + ': ' + e.error, 'finding-msg'));
      errList.appendChild(item);
    });
    host.appendChild(errList);
  }

  var endHeader = textEl('div', null, 'api-tester-findings-header');
  endHeader.appendChild(textEl('span', 'Endpoint Results (' + report.totalTests + ')', 'findings-title'));
  host.appendChild(endHeader);

  var endList = textEl('div', null, 'api-tester-findings');
  report.endpoints.forEach(function (ep) {
    var sev = ep.ok ? 'low' : 'high';
    var item = textEl('div', null, 'finding severity-' + sev);
    var icon = ep.ok ? 'PASS' : 'FAIL';
    item.appendChild(textEl('span', '[' + icon + ']', 'finding-sev'));
    var statusStr = ep.status ? ' ' + ep.status : '';
    var timeStr = ep.responseTime ? ' (' + ep.responseTime + 'ms)' : '';
    item.appendChild(textEl('span', ep.method + ' ' + ep.url + statusStr + timeStr, 'finding-msg'));
    endList.appendChild(item);

    if (ep.findings && ep.findings.length) {
      ep.findings.forEach(function (f) {
        var subItem = textEl('div', null, 'finding severity-' + f.severity);
        subItem.style.paddingLeft = '24px';
        subItem.appendChild(textEl('span', '[' + f.severity + ']', 'finding-sev'));
        subItem.appendChild(textEl('span', f.type + ': ' + f.message, 'finding-msg'));
        endList.appendChild(subItem);
      });
    }
  });
  host.appendChild(endList);
}

var devLoopBtn = textEl('button', 'Dev Loop', 'pane-btn');
devLoopBtn.type = 'button';
devLoopBtn.style.marginLeft = '6px';
devLoopBtn.addEventListener('click', openDevLoopModal);
var graphHead = qs('panel-graph').querySelector('.panel-head');
if (graphHead) graphHead.appendChild(devLoopBtn);
