#!/usr/bin/env node

import { spawn, spawnSync } from 'node:child_process';
import {
  appendFileSync,
  closeSync,
  existsSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;
const DEFAULT_KILL_GRACE_MS = 5 * 1000;
const VALID_EVENTS = new Set(['post-commit', 'post-merge', 'manual-recovery']);
const EVENT_LABELS = { 'post-commit': 'post-commit', 'post-merge': 'post-merge', 'manual-recovery': 'manual recovery' };
const TIMEOUT_EXIT = 'timeout';
const TIMEOUT_EXIT_LOG_TOKEN = 'exit=timeout';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, '..');
const argv = process.argv.slice(2);
const event = readFlagValue(argv, '--event') || 'manual-recovery';
const force = argv.includes('--force');
const timeoutMs = readPositiveIntEnv('GOOES_RAG_SYNC_TIMEOUT_MS', DEFAULT_TIMEOUT_MS);
const killGraceMs = readPositiveIntEnv('GOOES_RAG_SYNC_KILL_GRACE_MS', DEFAULT_KILL_GRACE_MS);
const configPath = resolve(repoRoot, '.codex/rag-sync.config.json');
const config = JSON.parse(readFileSync(configPath, 'utf8'));
const gitCommonDir = execGit(['rev-parse', '--path-format=absolute', '--git-common-dir']).trim();
const logFile = resolve(gitCommonDir, 'rag-sync.log');
const lockFile = resolve(gitCommonDir, 'rag-sync.lock');
const label = `${EVENT_LABELS[event] || event}${force ? ' force' : ''} sync`;

if (!VALID_EVENTS.has(event)) {
  appendLog(`[${timestamp()}] ${label} exit=invalid-event event=${event}`);
  process.exit(0);
}

if (process.env[config.disableEnvVar] === '0') {
  appendLog(`[${timestamp()}] ${label} skip: ${config.disableEnvVar}=0`);
  process.exit(0);
}

if (event !== 'manual-recovery' && currentBranch() !== 'main') {
  process.exit(0);
}

const ragRoot = resolveRagRoot();
const sharedRunner = resolve(ragRoot, 'scripts/post-commit-rag-sync.mjs');

if (!existsSync(sharedRunner)) {
  appendLog(
    `[${timestamp()}] ${label} skip: shared runner not found at ${sharedRunner}`,
  );
  process.exit(0);
}

const lock = acquireLock();
if (!lock.acquired) {
  appendLog(
    `[${timestamp()}] ${label} skip: active sync pid=${lock.pid || 'unknown'} started_at=${lock.startedAt || 'unknown'}`,
  );
  process.exit(0);
}

appendLog(`[${timestamp()}] ${label} start pid=${process.pid} timeout_ms=${timeoutMs}`);

try {
  const result = await runSyncWithTimeout();
  const exitText = result.logToken || `exit=${result.exit}`;
  appendLog(
    `[${timestamp()}] ${label} ${exitText} duration_ms=${result.durationMs}`,
  );
} catch (error) {
  appendLog(`[${timestamp()}] ${label} exit=runner-error error=${formatError(error)}`);
} finally {
  releaseLock();
}

process.exit(0);

function runSyncWithTimeout() {
  const startedAt = Date.now();
  const commandArgs = ['scripts/post-commit-rag-sync.mjs'];
  if (force) {
    commandArgs.push('--force');
  }

  return new Promise((resolvePromise) => {
    const child = spawn(process.execPath, commandArgs, {
      cwd: repoRoot,
      env: {
        ...process.env,
        LIGHTRAG_MCP_DIR: ragRoot,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let timedOut = false;
    let killTimer = null;

    child.stdout.on('data', (chunk) => appendLogChunk(chunk));
    child.stderr.on('data', (chunk) => appendLogChunk(chunk));
    child.on('error', (error) => {
      appendLog(`[${timestamp()}] ${label} child-error ${formatError(error)}`);
    });

    const timeout = setTimeout(() => {
      timedOut = true;
      appendLog(
        `[${timestamp()}] ${label} sync timeout after ${timeoutMs}ms; terminating pid=${child.pid || 'unknown'}`,
      );
      if (child.pid) {
        killChildTree(child.pid, 'SIGTERM');
        killTimer = setTimeout(() => {
          killChildTree(child.pid, 'SIGKILL');
        }, killGraceMs);
      }
    }, timeoutMs);

    child.on('close', (status, signal) => {
      clearTimeout(timeout);
      if (killTimer) {
        clearTimeout(killTimer);
      }

      const durationMs = Date.now() - startedAt;
      if (timedOut) {
        resolvePromise({ exit: TIMEOUT_EXIT, durationMs, logToken: TIMEOUT_EXIT_LOG_TOKEN });
        return;
      }
      if (signal) {
        resolvePromise({ exit: `signal:${signal}`, durationMs });
        return;
      }
      resolvePromise({ exit: String(status ?? 0), durationMs });
    });
  });
}

function acquireLock() {
  const payload = {
    pid: process.pid,
    event,
    force,
    startedAt: new Date().toISOString(),
  };

  try {
    const fd = openSync(lockFile, 'wx');
    writeFileSync(fd, `${JSON.stringify(payload)}\n`);
    closeSync(fd);
    return { acquired: true };
  } catch (error) {
    if (error?.code !== 'EEXIST') {
      throw error;
    }
  }

  const existing = readLock();
  if (existing.pid && isProcessAlive(existing.pid)) {
    return { acquired: false, pid: existing.pid, startedAt: existing.startedAt };
  }

  appendLog(
    `[${timestamp()}] ${label} removing stale lock pid=${existing.pid || 'unknown'} started_at=${existing.startedAt || 'unknown'}`,
  );
  rmSync(lockFile, { force: true });
  return acquireLock();
}

function releaseLock() {
  const existing = readLock();
  if (existing.pid === process.pid) {
    rmSync(lockFile, { force: true });
  }
}

function readLock() {
  try {
    return JSON.parse(readFileSync(lockFile, 'utf8'));
  } catch {
    return {};
  }
}

function resolveRagRoot() {
  if (process.env.LIGHTRAG_MCP_DIR) {
    return resolve(process.env.LIGHTRAG_MCP_DIR);
  }
  return '/Users/leefo/Public/work/mcp/rag';
}

function currentBranch() {
  try {
    return execGit(['branch', '--show-current']).trim();
  } catch {
    return '';
  }
}

function execGit(commandArgs) {
  const result = spawnSync('git', commandArgs, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `git ${commandArgs.join(' ')} failed`);
  }
  return result.stdout;
}

function killChildTree(pid, signal) {
  const descendants = collectDescendants(pid);
  for (const childPid of descendants.reverse()) {
    killProcess(childPid, signal);
  }
  killProcess(pid, signal);
}

function collectDescendants(pid) {
  const result = spawnSync('ps', ['-axo', 'pid=,ppid='], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  if (result.status !== 0) {
    return [];
  }

  const childrenByParent = new Map();
  for (const line of result.stdout.split('\n')) {
    const [rawPid, rawParentPid] = line.trim().split(/\s+/);
    const currentPid = Number(rawPid);
    const parentPid = Number(rawParentPid);
    if (!Number.isInteger(currentPid) || !Number.isInteger(parentPid)) {
      continue;
    }
    const children = childrenByParent.get(parentPid) || [];
    children.push(currentPid);
    childrenByParent.set(parentPid, children);
  }

  const descendants = [];
  const stack = [...(childrenByParent.get(pid) || [])];
  while (stack.length > 0) {
    const currentPid = stack.pop();
    descendants.push(currentPid);
    stack.push(...(childrenByParent.get(currentPid) || []));
  }
  return descendants;
}

function killProcess(pid, signal) {
  try { process.kill(pid, signal); } catch { return; }
}

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readFlagValue(list, flag) {
  const index = list.indexOf(flag);
  const value = index >= 0 ? list[index + 1] : null;
  if (!value || value.startsWith('--')) {
    return null;
  }
  return value;
}

function readPositiveIntEnv(name, fallback) {
  const value = Number(process.env[name] || fallback);
  return Number.isFinite(value) && value > 0 ? Math.trunc(value) : fallback;
}

function appendLog(line) {
  appendFileSync(logFile, `${line}\n`);
}

function appendLogChunk(chunk) {
  appendFileSync(logFile, chunk);
}

function timestamp() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function formatError(error) {
  return error instanceof Error ? error.message : String(error);
}
