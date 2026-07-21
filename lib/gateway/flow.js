'use strict';

/**
 * Gateway flow commands: batch, chain, task, undo, snapshot
 */

const fs = require('node:fs');
const path = require('node:path');

function handle(cmd, args, root, processRequest) {
  // --- batch ---
  if (cmd === 'batch') {
    const commands = Array.isArray(args) ? args : [args];
    if (!commands.length) return { ok: false, error: 'batch requires an array of commands' };
    const results = [];
    let allOk = true;
    for (const subReq of commands) {
      if (!subReq || !subReq.cmd) { results.push({ ok: false, error: 'missing cmd in batch item' }); allOk = false; continue; }
      const subResult = processRequest(root, subReq);
      results.push({
        cmd: subReq.cmd,
        ok: subResult.ok,
        output: subResult.ok ? subResult.output : (subResult.error || subResult.output || 'failed'),
      });
      if (!subResult.ok) allOk = false;
    }
    const summary = results.map((r, i) =>
      `[${i + 1}] ${r.cmd}: ${r.ok ? 'OK' : 'FAIL'}\n${r.output}`
    ).join('\n---\n');
    return { ok: allOk, output: summary, results };
  }

  // --- chain ---
  if (cmd === 'chain') {
    const steps = Array.isArray(args) ? args : [args];
    if (!steps.length) return { ok: false, error: 'chain requires an array of step objects with cmd/args' };
    const results = [];
    let allOk = true;
    let context = {};
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      if (!step || !step.cmd) { results.push({ step: i + 1, ok: false, error: 'missing cmd' }); allOk = false; continue; }
      let stepArgs = step.args;
      if (Array.isArray(stepArgs)) {
        stepArgs = stepArgs.map(a => {
          if (typeof a === 'string' && a.startsWith('$prev.')) {
            const key = a.slice(6);
            return context[key] !== undefined ? String(context[key]) : a;
          }
          return a;
        });
      }
      const subResult = processRequest(root, { cmd: step.cmd, args: stepArgs });
      const entry = {
        step: i + 1,
        cmd: step.cmd,
        ok: subResult.ok,
        output: subResult.ok ? subResult.output : (subResult.error || subResult.output || 'failed'),
        count: subResult.count,
      };
      results.push(entry);
      context['output'] = subResult.output || '';
      context['count'] = subResult.count || 0;
      context['ok'] = subResult.ok;
      if (step.as) context[step.as] = subResult.output || '';
      if (!subResult.ok && step.stopOnError !== false) {
        allOk = false;
        break;
      }
    }
    const summary = results.map(r =>
      `[${r.step}] ${r.cmd}: ${r.ok ? 'OK' : 'FAIL'}\n${r.output}`
    ).join('\n---\n');
    return { ok: allOk, output: summary, results, context };
  }

  // --- task ---
  if (cmd === 'task') {
    const taskDir = path.join(root, '.lex', 'tasks');
    fs.mkdirSync(taskDir, { recursive: true });
    const action = Array.isArray(args) ? args[0] : (typeof args === 'string' ? args : (args.action || 'list'));

    if (action === 'list' || action === 'status') {
      const tasks = [];
      try {
        for (const f of fs.readdirSync(taskDir)) {
          if (!f.endsWith('.json')) continue;
          try {
            const t = JSON.parse(fs.readFileSync(path.join(taskDir, f), 'utf8'));
            tasks.push({ id: f.replace('.json', ''), cmd: t.cmd, status: t.status, created: t.created });
          } catch {}
        }
      } catch {}
      if (!tasks.length) return { ok: true, output: 'no tasks', count: 0 };
      const lines = tasks.map(t => `${t.id} | ${t.status} | ${t.cmd} | ${new Date(t.created).toISOString().slice(0,19)}`);
      return { ok: true, output: lines.join('\n'), count: tasks.length, tasks };
    }

    if (action === 'create' || action === 'submit' || (typeof args === 'object' && args.cmd)) {
      const taskReq = typeof args === 'object' && !Array.isArray(args) ? args : (Array.isArray(args) && typeof args[1] === 'object' ? args[1] : null);
      if (!taskReq || !taskReq.cmd) return { ok: false, error: 'task requires a cmd field' };
      const taskId = 'task-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
      const task = {
        id: taskId,
        cmd: taskReq.cmd,
        args: taskReq.args || [],
        status: 'pending',
        created: Date.now(),
        request: taskReq,
      };
      fs.writeFileSync(path.join(taskDir, taskId + '.json'), JSON.stringify(task, null, 2));
      try {
        const result = processRequest(root, taskReq);
        task.status = result.ok ? 'done' : 'failed';
        task.result = result;
        task.completed = Date.now();
        fs.writeFileSync(path.join(taskDir, taskId + '.json'), JSON.stringify(task, null, 2));
        return { ok: true, output: 'task ' + taskId + ' completed: ' + (result.ok ? 'OK' : 'FAILED'), taskId, result };
      } catch (e) {
        task.status = 'error';
        task.error = e.message;
        fs.writeFileSync(path.join(taskDir, taskId + '.json'), JSON.stringify(task, null, 2));
        return { ok: false, error: 'task ' + taskId + ' failed: ' + e.message, taskId };
      }
    }

    if (action === 'get' || action === 'result') {
      const taskId = Array.isArray(args) ? args[1] : args.id;
      if (!taskId) return { ok: false, error: 'task get requires a task id' };
      try {
        const t = JSON.parse(fs.readFileSync(path.join(taskDir, taskId + '.json'), 'utf8'));
        return { ok: true, output: t.result ? t.result.output : 'task status: ' + t.status, task: t };
      } catch {
        return { ok: false, error: 'task not found: ' + taskId };
      }
    }

    if (action === 'cancel' || action === 'remove') {
      const taskId = Array.isArray(args) ? args[1] : args.id;
      if (!taskId) return { ok: false, error: 'task cancel requires a task id' };
      try {
        const tPath = path.join(taskDir, taskId + '.json');
        const t = JSON.parse(fs.readFileSync(tPath, 'utf8'));
        t.status = 'cancelled';
        fs.writeFileSync(tPath, JSON.stringify(t, null, 2));
        return { ok: true, output: 'task ' + taskId + ' cancelled' };
      } catch {
        return { ok: false, error: 'task not found: ' + taskId };
      }
    }

    if (action === 'clear') {
      try {
        for (const f of fs.readdirSync(taskDir)) {
          if (f.endsWith('.json')) try { fs.unlinkSync(path.join(taskDir, f)); } catch {}
        }
      } catch {}
      return { ok: true, output: 'all tasks cleared' };
    }

    return { ok: false, error: 'unknown task action: ' + action + '. Available: list, create, get, cancel, clear' };
  }

  // --- undo ---
  if (cmd === 'undo') {
    const trashDir = path.join(root, '.lex', 'trash');
    if (!fs.existsSync(trashDir)) return { ok: false, error: 'no backups found' };
    const backups = fs.readdirSync(trashDir)
      .filter(f => !f.endsWith('.json'))
      .map(f => ({ name: f, mtime: fs.statSync(path.join(trashDir, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
    if (!backups.length) return { ok: false, error: 'no backups found' };
    if (Array.isArray(args) && args[0] === '--list') {
      const lines = backups.slice(0, 10).map(b => `${b.name} -> ${b.name.replace(/^\d+_/, '')}`);
      return { ok: true, output: lines.join('\n') };
    }
    const latest = backups[0];
    const origRel = latest.name.replace(/^\d+_/, '').replace(/__/g, '/');
    fs.copyFileSync(path.join(trashDir, latest.name), path.join(root, origRel));
    fs.unlinkSync(path.join(trashDir, latest.name));
    return { ok: true, output: `restored ${origRel} from .lex/trash/${latest.name}` };
  }

  // --- snapshot ---
  if (cmd === 'snapshot') {
    const action = (Array.isArray(args) ? args[0] : args) || 'save';
    const snapDir = path.join(root, '.lex', 'snapshots');

    if (action === 'save') {
      const ts = Date.now();
      const dir = path.join(snapDir, String(ts));
      fs.mkdirSync(dir, { recursive: true });
      const files = Array.isArray(args) ? args.slice(1) : [];
      let saved = 0;
      for (const f of files) {
        const full = path.isAbsolute(f) ? f : path.join(root, f);
        if (fs.existsSync(full) && fs.statSync(full).isFile()) {
          const rel = path.relative(root, full).replace(/\\/g, '/');
          fs.copyFileSync(full, path.join(dir, rel.replace(/\//g, '__')));
          saved++;
        }
      }
      fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ ts, files: files.map(f => path.relative(root, path.isAbsolute(f) ? f : path.join(root, f)).replace(/\\/g, '/')) }));
      return { ok: true, output: `snapshot saved: ${saved} files -> .lex/snapshots/${ts}` };
    }

    if (action === 'restore') {
      const snaps = fs.existsSync(snapDir) ? fs.readdirSync(snapDir).sort((a, b) => Number(b) - Number(a)) : [];
      if (!snaps.length) return { ok: false, error: 'no snapshots found' };
      const snapId = (Array.isArray(args) ? args[1] : null) || snaps[0];
      const dir = path.join(snapDir, snapId);
      if (!fs.existsSync(dir)) return { ok: false, error: 'snapshot not found: ' + snapId };
      const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
      let restored = 0;
      for (const f of manifest.files) {
        const src = path.join(dir, f.replace(/\//g, '__'));
        const dst = path.join(root, f);
        if (fs.existsSync(src)) {
          fs.mkdirSync(path.dirname(dst), { recursive: true });
          fs.copyFileSync(src, dst);
          restored++;
        }
      }
      return { ok: true, output: `restored ${restored} files from snapshot ${snapId}` };
    }

    if (action === 'list') {
      const snaps = fs.existsSync(snapDir) ? fs.readdirSync(snapDir).sort((a, b) => Number(b) - Number(a)) : [];
      if (!snaps.length) return { ok: true, output: '(no snapshots)' };
      const lines = snaps.slice(0, 10).map(s => {
        try { return `${s} (${JSON.parse(fs.readFileSync(path.join(snapDir, s, 'manifest.json'), 'utf8')).files.length} files)`; }
        catch { return `${s} (? files)`; }
      });
      return { ok: true, output: lines.join('\n') };
    }

    return { ok: false, error: 'unknown snapshot action: ' + action };
  }

  if (cmd === 'synth') {
    const { synthesize } = require('../memory-synthesis');
    const { writeEpisode } = require('../memory');
    const force = args.includes('--force');
    const dateArg = args.find(a => typeof a === 'string' && a.startsWith('--date='));
    const date = dateArg ? dateArg.split('=')[1] : undefined;
    const dryRun = args.includes('--dry-run');
    const synth = synthesize(root, { date });
    if (synth.empty && !force) return { ok: true, output: 'no activity found for ' + synth.date };
    if (dryRun) return { ok: true, output: JSON.stringify(synth, null, 2), synthesis: synth };
    const filename = writeEpisode(root, {
      title: synth.title, summary: synth.summary, agent: synth.agent, platform: synth.platform,
      files: synth.files, decisions: synth.decisions, bugs: synth.bugs, learnings: synth.learnings, nextSteps: synth.nextSteps,
    });
    return { ok: true, output: 'episode written: .lex/sessions/' + filename, filename, synthesis: synth };
  }

  return null;
}

module.exports = { handle };
