#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
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
const ragRoot = resolve(process.env.LIGHTRAG_MCP_DIR || resolve(workspaceRoot, 'mcp/rag'));
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
