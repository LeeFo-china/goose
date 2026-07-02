#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const argv = process.argv.slice(2);

if (argv.includes('--help') || argv.includes('-h')) {
  printHelp();
  process.exit(0);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, '..');
const workspaceRoot = resolve(repoRoot, '..');
const ragRoot = resolveRagRoot(repoRoot, workspaceRoot);
const sharedRunner = resolve(ragRoot, 'scripts/post-commit-rag-sync.mjs');
const configPath = resolve(repoRoot, '.codex/rag-sync.config.json');
const config = JSON.parse(readFileSync(configPath, 'utf8'));

if (process.env[config.disableEnvVar] === '0') {
  log(config, `skip: ${config.disableEnvVar}=0`);
  process.exit(0);
}

if (!argv.includes('--force') && !headTouchesConfiguredCandidates(repoRoot, config)) {
  log(config, `skip: HEAD does not touch ${config.profile} docs`);
  process.exit(0);
}

execFileSync(
  process.execPath,
  [sharedRunner, '--config', configPath, ...argv],
  { cwd: repoRoot, stdio: 'inherit' },
);

function printHelp() {
  console.log(`Usage:
  ./scripts/post-commit-rag-sync.mjs [options]

Options:
  --dry-run-only    Scan candidate docs and report what would upload, without uploading.
  --force           Scan all configured candidate docs instead of only HEAD-changed docs.
  -h, --help        Show this help message.

Configuration:
  --config is supplied automatically as .codex/rag-sync.config.json.

Environment:
  LIGHTRAG_MCP_DIR  Override the shared LightRAG MCP directory.
  GOOES_RAG_SYNC=0  Skip sync for this repository.

Examples:
  ./scripts/post-commit-rag-sync.mjs --dry-run-only
  ./scripts/post-commit-rag-sync.mjs --force
  ./scripts/post-commit-rag-sync.mjs --force --dry-run-only`);
}

function resolveRagRoot(repoRoot, workspaceRoot) {
  if (process.env.LIGHTRAG_MCP_DIR) {
    return resolve(process.env.LIGHTRAG_MCP_DIR);
  }

  const candidates = [
    resolve(workspaceRoot, 'mcp/rag'),
    resolve(repoRoot, '../mcp/rag'),
    resolve(repoRoot, '../../../mcp/rag'),
  ];
  const worktreeBase = repoRoot.split('/.worktrees/')[0];
  if (worktreeBase && worktreeBase !== repoRoot) {
    candidates.push(resolve(worktreeBase, '../mcp/rag'));
  }

  for (const candidate of candidates) {
    if (existsSync(resolve(candidate, 'scripts/post-commit-rag-sync.mjs'))) {
      return candidate;
    }
  }

  return candidates[0];
}

function headTouchesConfiguredCandidates(repoRoot, config) {
  const candidate = config.candidate || {};
  const includeRootFiles = new Set(candidate.includeRootFiles || []);
  const includePrefixes = candidate.includePrefixes || [];
  const extensions = new Set((candidate.extensions || []).map((value) => value.toLowerCase()));
  const pathspecs = [...includeRootFiles, ...includePrefixes];

  if (pathspecs.length === 0) {
    return true;
  }

  const output = execFileSync(
    'git',
    [
      '-c',
      'core.quotepath=false',
      'diff-tree',
      '--root',
      '--no-commit-id',
      '--name-only',
      '-z',
      '-r',
      'HEAD',
      '--',
      ...pathspecs,
    ],
    {
      cwd: repoRoot,
      encoding: 'utf8',
      maxBuffer: 8 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'inherit'],
    },
  );

  return output
    .split('\0')
    .map((line) => line.trim())
    .filter(Boolean)
    .some((filePath) =>
      isProfileCandidate(filePath, includeRootFiles, includePrefixes, extensions),
    );
}

function isProfileCandidate(filePath, includeRootFiles, includePrefixes, extensions) {
  if (includeRootFiles.has(filePath)) {
    return true;
  }

  if (!includePrefixes.some((prefix) => filePath.startsWith(prefix))) {
    return false;
  }

  const extension = filePath.includes('.') ? `.${filePath.split('.').pop().toLowerCase()}` : '';
  return extensions.has(extension);
}

function log(config, message) {
  console.log(`[${config.logPrefix || 'rag-sync'}] ${message}`);
}
