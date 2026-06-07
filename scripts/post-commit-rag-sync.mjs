#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, '..');
const workspaceRoot = resolve(repoRoot, '..');
const ragRoot = resolve(process.env.LIGHTRAG_MCP_DIR || resolve(workspaceRoot, 'mcp/rag'));
const sharedRunner = resolve(ragRoot, 'scripts/post-commit-rag-sync.mjs');
const configPath = resolve(repoRoot, '.codex/rag-sync.config.json');

execFileSync(
  process.execPath,
  [sharedRunner, '--config', configPath, ...process.argv.slice(2)],
  { cwd: repoRoot, stdio: 'inherit' },
);
