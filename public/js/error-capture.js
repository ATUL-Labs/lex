'use strict';
(function(){
  var LEX_PORT = location.port || 4747;
  var queue = [];
  var sending = false;
  function flush() {
    if (!queue.length || sending) return;
    sending = true;
    var batch = queue.splice(0);
    fetch('http://127.0.0.1:' + LEX_PORT + '/api/console-errors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ errors: batch })
    }).then(function(){ sending = false; flush(); }).catch(function(){ sending = false; });
  }
  function report(type, data) {
    queue.push(Object.assign({ type: type, url: location.href, ts: Date.now() }, data));
    flush();
  }
  var origError = console.error;
  console.error = function() {
    var args = Array.from(arguments);
    report('console.error', { message: args.map(function(a){ return typeof a === 'object' ? JSON.stringify(a).substring(0,500) : String(a); }).join(' ') });
    origError.apply(console, args);
  };
  var origWarn = console.warn;
  console.warn = function() {
    var args = Array.from(arguments);
    report('console.warn', { message: args.map(function(a){ return typeof a === 'object' ? JSON.stringify(a).substring(0,500) : String(a); }).join(' ') });
    origWarn.apply(console, args);
  };
  window.addEventListener('error', function(e) {
    report('uncaught', { message: e.message, filename: e.filename, lineno: e.lineno, colno: e.colno, stack: e.error && e.error.stack ? e.error.stack.substring(0,1000) : '' });
  });
  window.addEventListener('unhandledrejection', function(e) {
    report('unhandledrejection', { message: e.reason && e.reason.message ? e.reason.message : String(e.reason), stack: e.reason && e.reason.stack ? e.reason.stack.substring(0,1000) : '' });
  });
})();
