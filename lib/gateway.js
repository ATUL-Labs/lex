'use strict';

/**
 * Gateway - processes requests from .lex/in/ and returns JSON responses.
 *
 * This enables agents to use lex without running commands. The agent writes
 * a request to .lex/in/{name}.json using write_to_file (native tool),
 * the PostToolUse hook detects it, calls gateway.processRequest(), and injects
 * the result as additionalContext.
 *
 * Three input formats (parsed by the hook):
 *   1. Empty file = no-arg command (filename IS the command)
 *   2. Plain text = "cmd arg1 arg2" or "cmd|arg1|arg2"
 *   3. JSON = {"cmd": "search", "args": ["InputError"]}
 *
 * Commands: search, memory, recall, episode, note, docs, proactive, symbols, grep, read, patch, insert, rename, delete,
 *           batch, chain, task, synth, check, diff, errors, audit, integrity, test, devloop, convert, undo, snapshot, refs, recent, links, guard, decay, assoc
 *
 * Response format:
 *   {"ok": true, "output": "...text..."}
 *   {"ok": false, "error": "...message..."}
 */

const searchMod = require('./gateway/search');
const codeMod = require('./gateway/code');
const metaMod = require('./gateway/meta');
const buildMod = require('./gateway/build');
const flowMod = require('./gateway/flow');

const { ensureFreshIndex } = searchMod;

function processRequest(root, request) {
  if (!request || !request.cmd) {
    return { ok: false, error: 'missing "cmd" field in request' };
  }

  const cmd = request.cmd;
  const args = request.args || [];

  try {
    let result;

    result = searchMod.handle(cmd, args, root);
    if (result) return result;

    result = codeMod.handle(cmd, args, root, ensureFreshIndex);
    if (result) return result;

    result = metaMod.handle(cmd, args, root, ensureFreshIndex);
    if (result) return result;

    result = buildMod.handle(cmd, args, root);
    if (result) return result;

    result = flowMod.handle(cmd, args, root, processRequest);
    if (result) return result;

    return { ok: false, error: 'unknown command: ' + cmd + '. Available: search, symbols, grep, read, patch, insert, rename, delete, batch, chain, task, synth, check, diff, errors, audit, integrity, test, devloop, convert, undo, snapshot, refs, recent, links, guard, decay, assoc, proactive, memory, recall, episode, note, docs' };

  } catch (err) {
    return { ok: false, error: err.message };
  }
}

module.exports = { processRequest };
