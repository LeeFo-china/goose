import { readFileSync } from "node:fs";

const [receiptPath, expectedEnvironment, expectedSha, expectedMigration] = process.argv.slice(2);

function reject(message) {
  console.error(`Web gate receipt rejected: ${message}`);
  process.exit(1);
}

let receipt;
try {
  receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
} catch {
  reject("invalid JSON");
}

if (receipt.conclusion !== "success") reject("conclusion is not success");
if (receipt.environment !== expectedEnvironment) reject("environment mismatch");
if (receipt.commit_sha !== expectedSha) reject("commit SHA mismatch");
if (receipt.migration_version !== expectedMigration) reject("migration mismatch");
for (const field of [
  "ip_concurrency_passed",
  "phone_concurrency_passed",
  "device_concurrency_passed",
]) {
  if (receipt[field] !== true) reject(`${field} is not true`);
}
