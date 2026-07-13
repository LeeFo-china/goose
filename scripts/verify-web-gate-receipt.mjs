import { readFileSync } from "node:fs";

const [receiptPath, expectedEnvironment, expectedSha, expectedMigration] = process.argv.slice(2);
const EXPECTED_FIELDS = [
  "conclusion",
  "environment",
  "commit_sha",
  "migration_version",
  "single_reservation_passed",
  "ip_concurrency_passed",
  "phone_concurrency_passed",
  "device_concurrency_passed",
  "single_success_count",
  "ip_success_count",
  "phone_success_count",
  "device_success_count",
  "migration_history_aligned",
  "target_migration_present",
  "passed",
];

function reject() {
  console.error("Web gate receipt rejected");
  process.exit(1);
}

let receipt;
try {
  receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
} catch {
  reject();
}

if (receipt === null || typeof receipt !== "object" || Array.isArray(receipt)) reject();
const fields = Object.keys(receipt);
if (
  fields.length !== EXPECTED_FIELDS.length ||
  !fields.every((field) => EXPECTED_FIELDS.includes(field))
) {
  reject();
}

if (receipt.conclusion !== "success") reject();
if (receipt.environment !== expectedEnvironment) reject();
if (receipt.commit_sha !== expectedSha) reject();
if (receipt.migration_version !== expectedMigration) reject();
for (const field of [
  "single_reservation_passed",
  "ip_concurrency_passed",
  "phone_concurrency_passed",
  "device_concurrency_passed",
  "passed",
]) {
  if (receipt[field] !== true) reject();
}
for (const [field, expected] of [
  ["single_success_count", 1],
  ["ip_success_count", 5],
  ["phone_success_count", 1],
  ["device_success_count", 1],
]) {
  if (receipt[field] !== expected) reject();
}
if (receipt.migration_history_aligned !== true) reject();
if (receipt.target_migration_present !== true) reject();
