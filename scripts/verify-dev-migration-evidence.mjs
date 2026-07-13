import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const EXPECTED_FIELDS = [
  "commit_sha",
  "environment",
  "migration_history_aligned",
  "migration_version",
  "target_migration_present",
];

function reject() {
  console.error("development migration evidence rejected");
  process.exit(1);
}

if (args.length !== 4) reject();

const [evidencePath, expectedEnvironment, expectedCommitSha, expectedMigration] =
  args;

if (expectedEnvironment !== "development") reject();
if (!/^[a-f0-9]{40}$/.test(expectedCommitSha ?? "")) reject();
if (expectedMigration !== "20260711120000") reject();

let evidence;
try {
  evidence = JSON.parse(readFileSync(evidencePath, "utf8"));
} catch {
  reject();
}

if (evidence === null || typeof evidence !== "object" || Array.isArray(evidence)) {
  reject();
}

const fields = Object.keys(evidence).sort();
if (
  fields.length !== EXPECTED_FIELDS.length ||
  !fields.every((field, index) => field === EXPECTED_FIELDS[index])
) {
  reject();
}

if (evidence.environment !== expectedEnvironment) reject();
if (evidence.commit_sha !== expectedCommitSha) reject();
if (evidence.migration_version !== expectedMigration) reject();
if (evidence.migration_history_aligned !== true) reject();
if (evidence.target_migration_present !== true) reject();
