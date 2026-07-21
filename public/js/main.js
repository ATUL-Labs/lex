'use strict';

// ---------- polling / diffing ----------
function fetchOverview() {
  fetch('/api/overview')
    .then(function (r) {
      if (!r.ok) throw new Error('bad status');
      return r.json();
    })
    .then(function (data) {
      state.pollFailed = false;
      setLiveState(true);
      applyOverview(data);
      tickLiveLabel();
      renderFreshness();
    })
    .catch(function () {
      state.pollFailed = true;
      setLiveState(false);
    });
}

function setLiveState(ok) {
  var dot = qs('live-dot');
  if (ok) {
    dot.classList.remove('stale');
    dot.title = 'live';
  } else {
    dot.classList.add('stale');
    dot.title = 'stale';
  }
}

function applyOverview(data) {
  qs('project-name').textContent = data.project || '-';
  qs('version').textContent = 'v' + (data.version || '0.0.0');

  var s = JSON.stringify(data.status);
  if (s !== state.serialized.status) {
    state.serialized.status = s;
    renderStatus(data.status);
  }

  var w = JSON.stringify(data.wip);
  if (w !== state.serialized.wip) {
    state.serialized.wip = w;
    renderWip(data.wip);
  }

  var idx = JSON.stringify(data.index);
  if (idx !== state.serialized.index) {
    state.serialized.index = idx;
    renderIndex(data.index);
  }

  var p = JSON.stringify(data.pages);
  if (p !== state.serialized.pages) {
    state.serialized.pages = p;
    renderPagesList(data.pages || []);
  }

  var sess = JSON.stringify(data.sessions);
  if (sess !== state.serialized.sessions) {
    state.serialized.sessions = sess;
    renderSessionsList(data.sessions || []);
  }

  var a = JSON.stringify(data.audit);
  if (a !== state.serialized.audit) {
    state.serialized.audit = a;
    renderActivity(data.audit || []);
  }

  if (typeof data.refreshedAt === 'number') {
    state.refreshedAt = data.refreshedAt;
  }
}

// ---------- cockpit: index freshness + live tick ----------
function renderFreshness() {
  var el = qs('freshness');
  if (!state.refreshedAt) { el.textContent = ''; return; }
  var secs = Math.max(0, Math.round((Date.now() - state.refreshedAt) / 1000));
  el.textContent = 'indexed ' + secs + 's ago';
}

function tickLiveLabel() {
  var label = qs('live-label');
  label.classList.add('tick');
  setTimeout(function () { label.classList.remove('tick'); }, 400);
}

// ---------- live agent activity banner ----------
function fetchActivity() {
  fetch('/api/activity')
    .then(function (r) {
      if (!r.ok) throw new Error('bad status');
      return r.json();
    })
    .then(function (data) {
      var el = qs('agent-activity');
      var fresh = data && data.file && (Date.now() - data.ts < 8000);
      if (fresh) {
        qs('agent-activity-file').textContent = 'writing ' + data.file;
        el.classList.add('show');
      } else {
        el.classList.remove('show');
      }
    })
    .catch(function () {});
}

// ---------- app server status ----------
function fetchAppStatus() {
  fetch('/api/app-url')
    .then(function (r) { return r.json(); })
    .then(function (info) {
      var bar = qs('app-status-bar');
      if (!bar) return;
      var dot = bar.querySelector('.app-status-dot');
      var text = bar.querySelector('.app-status-text');
      dot.className = 'app-status-dot ' + (info.appRunning ? 'online' : 'offline');
      text.textContent = info.appRunning
        ? 'App running at ' + info.appUrl
        : 'App offline at ' + info.appUrl + ' — start it (see run.md)';
    })
    .catch(function () {});
}

// ---------- boot ----------
fetchOverview();
setInterval(fetchOverview, 2500);
setInterval(renderFreshness, 1000);
setInterval(fetchActivity, 2500);
fetchActivity();
fetchLinks(true);
setInterval(function () { fetchLinks(false); }, 60000);
fetchSchema(true);
setInterval(function () { fetchSchema(false); }, 30000);
fetchAppStatus();
setInterval(fetchAppStatus, 10000);
