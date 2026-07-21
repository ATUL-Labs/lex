'use strict';

// ---------- API endpoint tester ----------
function openApiTester(preselectedUrl, preselectedMethod) {
  var existing = document.getElementById('api-tester-modal');
  if (existing) existing.remove();

  var modal = textEl('div', null, 'api-tester-modal');
  modal.id = 'api-tester-modal';
  var content = textEl('div', null, 'api-tester-content');
  var titleBar = textEl('div', null, 'api-tester-title');
  titleBar.appendChild(textEl('span', 'API Endpoint Tester', 'api-tester-title-text'));
  var closeBtn = textEl('button', '\u00d7', 'api-tester-close');
  closeBtn.type = 'button';
  closeBtn.addEventListener('click', function () { modal.remove(); });
  titleBar.appendChild(closeBtn);
  content.appendChild(titleBar);

  // --- Request builder ---
  var builder = textEl('div', null, 'api-tester-builder');

  // Method selector
  var methodRow = textEl('div', null, 'api-tester-row');
  methodRow.appendChild(textEl('label', 'Method', 'api-tester-label'));
  var methodSelect = document.createElement('select');
  methodSelect.className = 'api-tester-method';
  ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'].forEach(function (m) {
    var opt = document.createElement('option');
    opt.value = m;
    opt.textContent = m;
    if (m === (preselectedMethod || 'GET')) opt.selected = true;
    methodSelect.appendChild(opt);
  });
  methodRow.appendChild(methodSelect);
  builder.appendChild(methodRow);

  // URL input
  var urlRow = textEl('div', null, 'api-tester-row');
  urlRow.appendChild(textEl('label', 'URL', 'api-tester-label'));
  var urlInput = document.createElement('input');
  urlInput.className = 'api-tester-url';
  urlInput.type = 'text';
  urlInput.placeholder = 'detecting app URL...';
  urlInput.value = preselectedUrl || '';
  if (!preselectedUrl) {
    fetch('/api/app-url').then(function(r){return r.json();}).then(function(data){
      urlInput.placeholder = (data.appUrl || 'http://127.0.0.1:3000') + '/api/...';
    }).catch(function(){});
  }
  urlRow.appendChild(urlInput);
  builder.appendChild(urlRow);

  // Headers
  var headersRow = textEl('div', null, 'api-tester-row');
  headersRow.appendChild(textEl('label', 'Headers (JSON)', 'api-tester-label'));
  var headersInput = document.createElement('textarea');
  headersInput.className = 'api-tester-headers';
  headersInput.rows = 3;
  headersInput.placeholder = '{"Content-Type": "application/json", "Authorization": "Bearer ..."}';
  headersInput.value = '{"Content-Type": "application/json"}';
  headersRow.appendChild(headersInput);
  builder.appendChild(headersRow);

  // Body
  var bodyRow = textEl('div', null, 'api-tester-row');
  bodyRow.appendChild(textEl('label', 'Body (JSON)', 'api-tester-label'));
  var bodyInput = document.createElement('textarea');
  bodyInput.className = 'api-tester-body';
  bodyInput.rows = 4;
  bodyInput.placeholder = '{"name": "test", "email": "test@example.com"}';
  bodyRow.appendChild(bodyInput);
  builder.appendChild(bodyRow);

  // Buttons
  var btnRow = textEl('div', null, 'api-tester-btnrow');

  var sendBtn = textEl('button', 'Send Request', 'api-tester-send');
  sendBtn.type = 'button';
  btnRow.appendChild(sendBtn);

  var xssBtn = textEl('button', 'Run XSS Scan', 'api-tester-xss');
  xssBtn.type = 'button';
  btnRow.appendChild(xssBtn);

  var scanCheck = textEl('label', null, 'api-tester-scan-toggle');
  var scanCheckbox = document.createElement('input');
  scanCheckbox.type = 'checkbox';
  scanCheckbox.checked = true;
  scanCheckbox.id = 'api-tester-scan';
  scanCheck.appendChild(scanCheckbox);
  scanCheck.appendChild(document.createTextNode(' Security scan'));
  btnRow.appendChild(scanCheck);

  builder.appendChild(btnRow);
  content.appendChild(builder);

  // --- Response area ---
  var responseArea = textEl('div', null, 'api-tester-response');
  responseArea.appendChild(textEl('div', 'Response will appear here', 'api-tester-placeholder'));
  content.appendChild(responseArea);

  modal.appendChild(content);
  modal.addEventListener('click', function (e) { if (e.target === modal) modal.remove(); });
  document.body.appendChild(modal);

  function showLoading(msg) {
    clear(responseArea);
    var loader = textEl('div', null, 'api-tester-loading');
    loader.appendChild(textEl('span', msg || 'Sending...', 'api-tester-spinner'));
    responseArea.appendChild(loader);
  }

  function showResponse(result) {
    clear(responseArea);

    // Status line
    var statusLine = textEl('div', null, 'api-tester-status-line');
    var statusClass = 'status-ok';
    if (result.status >= 400) statusClass = 'status-err';
    else if (result.status >= 300) statusClass = 'status-redirect';
    var statusBadge = textEl('span', result.status + ' ' + (result.statusText || ''), 'api-tester-status ' + statusClass);
    statusLine.appendChild(statusBadge);
    statusLine.appendChild(textEl('span', result.responseTime + 'ms', 'api-tester-time'));
    responseArea.appendChild(statusLine);

    // Security findings
    if (result.findings && result.findings.length) {
      var findingsHeader = textEl('div', null, 'api-tester-findings-header');
      var count = result.findings.length;
      var highCount = result.findings.filter(function (f) { return f.severity === 'high'; }).length;
      findingsHeader.appendChild(textEl('span', 'Security Findings (' + count + (highCount ? ', ' + highCount + ' high' : '') + ')', 'findings-title'));
      responseArea.appendChild(findingsHeader);

      var findingsList = textEl('div', null, 'api-tester-findings');
      result.findings.forEach(function (f) {
        var finding = textEl('div', null, 'finding severity-' + f.severity);
        finding.appendChild(textEl('span', '[' + f.severity + ']', 'finding-sev'));
        finding.appendChild(textEl('span', f.type, 'finding-type'));
        finding.appendChild(textEl('span', f.message, 'finding-msg'));
        findingsList.appendChild(finding);
      });
      responseArea.appendChild(findingsList);
    } else if (result.findings) {
      responseArea.appendChild(textEl('div', 'No security findings', 'api-tester-no-findings'));
    }

    // Response headers
    var headersHeader = textEl('div', null, 'api-tester-section-header');
    headersHeader.appendChild(textEl('span', 'Response Headers', 'section-title'));
    responseArea.appendChild(headersHeader);

    var headersList = textEl('div', null, 'api-tester-res-headers');
    for (var k in result.headers) {
      var hRow = textEl('div', null, 'res-header-row');
      hRow.appendChild(textEl('span', k + ':', 'res-header-key'));
      hRow.appendChild(textEl('span', String(result.headers[k]), 'res-header-val'));
      headersList.appendChild(hRow);
    }
    responseArea.appendChild(headersList);

    // Response body
    var bodyHeader = textEl('div', null, 'api-tester-section-header');
    bodyHeader.appendChild(textEl('span', 'Response Body', 'section-title'));
    var bodyNote = result.bodyTruncated ? ' (truncated)' : '';
    bodyHeader.appendChild(textEl('span', (result.body ? result.body.length : 0) + ' chars' + bodyNote, 'section-meta'));
    responseArea.appendChild(bodyHeader);

    var bodyPre = document.createElement('pre');
    bodyPre.className = 'api-tester-res-body';
    var bodyText = result.body || '';
    var parsed = null;
    try { parsed = JSON.parse(bodyText); } catch {}
    if (parsed !== null) {
      bodyPre.textContent = JSON.stringify(parsed, null, 2);
    } else {
      bodyPre.textContent = bodyText;
    }
    responseArea.appendChild(bodyPre);
  }

  function showError(msg) {
    clear(responseArea);
    responseArea.appendChild(textEl('div', msg, 'api-tester-error'));
  }

  function showXssResults(result) {
    clear(responseArea);

    var summary = textEl('div', null, 'api-tester-xss-summary ' + (result.vulnerabilities.length ? 'vulnerable' : 'safe'));
    summary.appendChild(textEl('span', result.summary, 'xss-summary-text'));
    responseArea.appendChild(summary);

    if (result.vulnerabilities.length) {
      var vulnHeader = textEl('div', null, 'api-tester-findings-header');
      vulnHeader.appendChild(textEl('span', 'Vulnerable Payloads (' + result.vulnerabilities.length + ')', 'findings-title'));
      responseArea.appendChild(vulnHeader);

      var vulnList = textEl('div', null, 'api-tester-findings');
      result.vulnerabilities.forEach(function (v) {
        var item = textEl('div', null, 'finding severity-high');
        item.appendChild(textEl('span', '[VULN]', 'finding-sev'));
        item.appendChild(textEl('span', v.payload, 'finding-msg'));
        vulnList.appendChild(item);
      });
      responseArea.appendChild(vulnList);
    }

    if (result.errors.length) {
      var errHeader = textEl('div', null, 'api-tester-findings-header');
      errHeader.appendChild(textEl('span', 'Errors (' + result.errors.length + ')', 'findings-title'));
      responseArea.appendChild(errHeader);

      var errList = textEl('div', null, 'api-tester-findings');
      result.errors.forEach(function (e) {
        var item = textEl('div', null, 'finding severity-low');
        item.appendChild(textEl('span', '[ERR]', 'finding-sev'));
        item.appendChild(textEl('span', e.payload + ': ' + e.error, 'finding-msg'));
        errList.appendChild(item);
      });
      responseArea.appendChild(errList);
    }
  }

  function getRequestOpts() {
    var opts = {
      url: urlInput.value.trim(),
      method: methodSelect.value,
      scan: scanCheckbox.checked,
    };
    if (!opts.url) return null;
    try {
      opts.headers = JSON.parse(headersInput.value || '{}');
    } catch {
      opts.headers = {};
    }
    if (bodyInput.value.trim()) {
      opts.body = bodyInput.value.trim();
    }
    return opts;
  }

  sendBtn.addEventListener('click', function () {
    var opts = getRequestOpts();
    if (!opts) { showError('URL is required'); return; }
    showLoading('Sending ' + opts.method + ' request...');
    fetch('/api/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(opts),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.error) showError(data.error);
        else showResponse(data);
      })
      .catch(function (err) { showError('Request failed: ' + err.message); });
  });

  xssBtn.addEventListener('click', function () {
    var opts = getRequestOpts();
    if (!opts) { showError('URL is required'); return; }
    showLoading('Running XSS scan (6 payloads)...');
    fetch('/api/test/xss', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: opts.url, method: opts.method, param: 'q' }),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.error) showError(data.error);
        else showXssResults(data);
      })
      .catch(function (err) { showError('XSS scan failed: ' + err.message); });
  });

  urlInput.focus();
}
