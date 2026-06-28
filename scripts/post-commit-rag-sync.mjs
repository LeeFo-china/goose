#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
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
