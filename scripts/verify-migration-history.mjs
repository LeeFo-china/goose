import { readdirSync, readFileSync } from "node:fs";

const [historyPath, migrationsDir, targetVersion] = process.argv.slice(2);
const VERSION_PATTERN = /^\d{14}$/;
const ANSI_PATTERN = /\u001b\[[0-?]*[ -/]*[@-~]/g;

function reject(message) {
  console.error(`Migration history rejected: ${message}`);
  process.exit(1);
}

if (!VERSION_PATTERN.test(targetVersion ?? "")) reject("invalid target version");

const localVersions = readdirSync(migrationsDir)
  .filter((name) => name.endsWith(".sql"))
  .map((name) => {
    const match = /^(\d{14})_.+\.sql$/.exec(name);
    if (!match) reject(`invalid migration filename: ${name}`);
    return match[1];
  })
  .sort();
if (localVersions.length === 0 || new Set(localVersions).size !== localVersions.length) {
  reject("empty or duplicate repository migration versions");
}

const lines = readFileSync(historyPath, "utf8")
  .replace(ANSI_PATTERN, "")
  .split(/\r?\n/);
const remoteVersions = [];
let headerSeen = false;

for (const rawLine of lines) {
  const line = rawLine.trim();
  if (!line) continue;
  if (/^Connecting to (?:local|remote) database\.\.\.$/.test(line)) continue;
  if (/^Local\s*\|\s*Remote\s*\|\s*Time \(UTC\)$/.test(line)) {
    if (headerSeen) reject("duplicate table header");
    headerSeen = true;
    continue;
  }
  if (/^-+\s*\|\s*-+\s*\|\s*-+$/.test(line)) {
    if (!headerSeen) reject("separator before header");
    continue;
  }
  if (!headerSeen) reject(`unexpected preamble: ${line}`);

  const columns = rawLine.replace(ANSI_PATTERN, "").split("|");
  if (columns.length !== 3) reject(`malformed row: ${line}`);
  const local = columns[0]?.trim() ?? "";
  const remote = columns[1]?.trim() ?? "";
  if (!VERSION_PATTERN.test(local) || !VERSION_PATTERN.test(remote)) {
    reject(`missing or invalid Local/Remote version: ${line}`);
  }
  if (local !== remote) reject(`Local/Remote mismatch: ${line}`);
  remoteVersions.push(remote);
}

if (!headerSeen || remoteVersions.length === 0) reject("missing migration table");
if (new Set(remoteVersions).size !== remoteVersions.length) reject("duplicate migration version");
const sortedRemote = [...remoteVersions].sort();
if (!remoteVersions.every((version, index) => version === sortedRemote[index])) {
  reject("migration rows are not ordered");
}
if (
  localVersions.length !== remoteVersions.length ||
  !localVersions.every((version, index) => version === remoteVersions[index])
) {
  reject("repository and remote migration sets differ");
}
if (!remoteVersions.includes(targetVersion)) reject("target migration missing");

console.log(JSON.stringify({
  migration_history_aligned: true,
  target_migration_present: true,
}));
