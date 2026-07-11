import { readFileSync } from "node:fs";

const [historyPath, targetVersion] = process.argv.slice(2);
const payload = JSON.parse(readFileSync(historyPath, "utf8"));
const rows = Array.isArray(payload) ? payload : payload.migrations;
if (!Array.isArray(rows) || rows.length === 0) {
  console.error("Migration history rejected: empty or invalid CLI output");
  process.exit(1);
}

const aligned = rows.every(
  (row) =>
    row &&
    typeof row === "object" &&
    typeof row.local === "string" &&
    row.local.length > 0 &&
    row.local === row.remote,
);
const targetPresent = rows.some(
  (row) => row?.local === targetVersion && row?.remote === targetVersion,
);
if (!aligned || !targetPresent) {
  console.error("Migration history rejected: Local/Remote mismatch or target missing");
  process.exit(1);
}
console.log(JSON.stringify({
  migration_history_aligned: true,
  target_migration_present: true,
}));
