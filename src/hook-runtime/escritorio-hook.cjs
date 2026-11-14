'use strict';
// @escritorio-hook-version 1
//
// Team Office hook (ADR-0004). Plain Node, NO dependencies, NO build: `hooks:sync` copies this
// file to ~/.escritorio-equipe/bin/. Claude Code runs it for each hook event and pipes the
// payload JSON on stdin.
//
// Contract (CA-15, CA-39):
// - Purely observational: it never decides anything (a blocking PermissionRequest flow is T-47).
// - ALWAYS exits 0 and NEVER writes to stdout (stdout of a hook can be interpreted by Claude).
// - Total time <= 1 s (connect 300 ms). Server down / unknown / slow => silent exit.
// - Privacy: only an allow-list of short fields leaves this process. `tool_input`, tool
//   responses, prompts and assistant text are dropped here, before the network.
// - The hook token is read from ~/.escritorio-equipe/hook-token (never from argv/env/URL) and is
//   only sent to 127.0.0.1 and only when runtime.json names a LIVE process (our server): a stray
//   process squatting the port never receives it.

const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const TOTAL_MS = 1000;
const CONNECT_MS = 300;
const STDIN_MS = 400;
const MAX_STDIN_BYTES = 8 * 1024 * 1024;
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

const startedAt = Date.now();
let finished = false;
let debugInfo = { event: null, session: null, status: null };

function finish() {
  if (finished) return;
  finished = true;
  writeDebug();
  process.exit(0);
}

process.on('uncaughtException', finish);
process.on('unhandledRejection', finish);
setTimeout(finish, TOTAL_MS);

function homeDir() {
  const override = process.env.ESCRITORIO_HOME;
  return override && override.trim() !== ''
    ? override
    : path.join(os.homedir(), '.escritorio-equipe');
}

function writeDebug() {
  if (process.env.ESCRITORIO_HOOK_DEBUG !== '1') return;
  try {
    const dir = path.join(homeDir(), 'logs');
    fs.mkdirSync(dir, { recursive: true });
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      event: debugInfo.event,
      session: debugInfo.session,
      ms: Date.now() - startedAt,
      status: debugInfo.status,
    });
    fs.appendFileSync(path.join(dir, 'hook.log'), line + '\n');
  } catch {
    /* debug must never break the hook */
  }
}

function readJsonFile(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  } catch {
    return null;
  }
}

function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return Boolean(err) && err.code === 'EPERM';
  }
}

function readStdin() {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) return resolve('');
    const chunks = [];
    let size = 0;
    const timer = setTimeout(() => resolve(Buffer.concat(chunks).toString('utf8')), STDIN_MS);
    process.stdin.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_STDIN_BYTES) {
        clearTimeout(timer);
        resolve('');
        return;
      }
      chunks.push(chunk);
    });
    process.stdin.on('end', () => {
      clearTimeout(timer);
      resolve(Buffer.concat(chunks).toString('utf8'));
    });
    process.stdin.on('error', () => {
      clearTimeout(timer);
      resolve('');
    });
  });
}

function shortString(value, max) {
  return typeof value === 'string' ? value.slice(0, max) : undefined;
}

/** Allow-list: only names, ids and the working directory leave this process. */
function slim(payload) {
  const out = {};
  const fields = [
    ['hook_event_name', 100],
    ['session_id', 100],
    ['transcript_path', 1000],
    ['cwd', 1000],
    ['permission_mode', 50],
    ['agent_id', 100],
    ['agent_type', 100],
    ['tool_name', 200],
    ['tool_use_id', 100],
    ['notification_type', 100],
  ];
  for (const [key, max] of fields) {
    const v = shortString(payload[key], max);
    if (v !== undefined) out[key] = v;
  }
  if (typeof payload.timestamp === 'string' || typeof payload.timestamp === 'number') {
    out.timestamp = payload.timestamp;
  }
  const task = payload.task;
  if (task && typeof task === 'object' && !Array.isArray(task)) {
    const t = {};
    for (const key of ['id', 'subject', 'title']) {
      const v = shortString(task[key], 200);
      if (v !== undefined) t[key] = v;
    }
    if (Object.keys(t).length > 0) out.task = t;
  }
  return out;
}

function post(port, token, body) {
  return new Promise((resolve) => {
    const data = Buffer.from(JSON.stringify(body), 'utf8');
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        path: '/api/hooks/v1/claude',
        method: 'POST',
        agent: false,
        headers: {
          'content-type': 'application/json',
          'content-length': data.length,
          authorization: `Bearer ${token}`,
        },
      },
      (res) => {
        debugInfo.status = res.statusCode;
        res.resume();
        res.on('end', resolve);
        res.on('error', resolve);
      },
    );
    req.on('socket', (socket) => {
      const connectTimer = setTimeout(() => req.destroy(), CONNECT_MS);
      socket.once('connect', () => clearTimeout(connectTimer));
      socket.once('error', () => clearTimeout(connectTimer));
    });
    req.on('error', resolve);
    req.end(data);
  });
}

async function main() {
  const home = homeDir();
  const runtime = readJsonFile(path.join(home, 'runtime.json'));
  const port = runtime && Number.isInteger(runtime.port) ? runtime.port : 0;
  const pid = runtime && Number.isInteger(runtime.pid) ? runtime.pid : 0;
  if (port < 1 || port > 65535 || pid < 1 || !pidAlive(pid)) return; // server is not running

  let token;
  try {
    token = fs.readFileSync(path.join(home, 'hook-token'), 'utf8').trim();
  } catch {
    return;
  }
  if (!TOKEN_RE.test(token)) return;

  const raw = await readStdin();
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return;
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return;

  const body = slim(payload);
  debugInfo = {
    event: body.hook_event_name || null,
    session: body.session_id ? body.session_id.slice(0, 8) : null,
    status: null,
  };
  await post(port, token, body);
}

main().then(finish, finish);
