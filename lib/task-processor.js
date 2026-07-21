'use strict';

/**
 * Task processor - processes pending tasks in .lex/tasks/
 * Used by serve.js and standalone-watcher.js
 */

const fs = require('node:fs');
const path = require('node:path');

function startTaskProcessor(root) {
  const taskDir = path.join(root, '.lex', 'tasks');
  fs.mkdirSync(taskDir, { recursive: true });

  function processPendingTasks() {
    let files;
    try { files = fs.readdirSync(taskDir); } catch { return; }
    for (const f of files) {
      if (!f.endsWith('.json')) continue;
      const tPath = path.join(taskDir, f);
      let task;
      try { task = JSON.parse(fs.readFileSync(tPath, 'utf8')); } catch { continue; }
      if (task.status !== 'pending') continue;
      task.status = 'running';
      task.startedAt = Date.now();
      try { fs.writeFileSync(tPath, JSON.stringify(task, null, 2)); } catch {}
      try {
        const gateway = require('./gateway');
        const result = gateway.processRequest(root, task.request || { cmd: task.cmd, args: task.args || [] });
        task.status = result.ok ? 'done' : 'failed';
        task.result = result;
        task.completed = Date.now();
      } catch (e) {
        task.status = 'error';
        task.error = e.message;
        task.completed = Date.now();
      }
      try { fs.writeFileSync(tPath, JSON.stringify(task, null, 2)); } catch {}
    }
  }

  // Process pending tasks on startup
  processPendingTasks();

  // Watch for new task files
  let taskWatcher;
  try {
    taskWatcher = fs.watch(taskDir, (eventType, filename) => {
      if (filename && filename.endsWith('.json')) {
        setTimeout(processPendingTasks, 100);
      }
    });
  } catch {}

  // Poll every 5 seconds (covers watcher misses on Windows)
  const pollTimer = setInterval(processPendingTasks, 5000);

  return { watcher: taskWatcher, timer: pollTimer };
}

module.exports = { startTaskProcessor };
