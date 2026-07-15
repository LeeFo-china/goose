import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const SHA_PATTERN = /^[a-f0-9]{40}$/u;
const DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/u;
const TAG_PATTERN = /^v[0-9]{4}\.[0-9]{2}\.[0-9]{2}\.[0-9]+$/u;
const RUN_ID_PATTERN = /^[1-9][0-9]*$/u;

function reject(message) {
  throw new Error(message);
}

function assert(condition, message) {
  if (!condition) reject(message);
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isWebOnly(services) {
  return Array.isArray(services) && services.length === 1 && services[0] === "web";
}

export function verifyProductionWebBuildEvidence(buildRun, plan, manifest, expected) {
  assert(isObject(buildRun), "build run must be an object");
  assert(isObject(plan), "plan must be an object");
  assert(isObject(manifest), "manifest must be an object");
  assert(isObject(expected), "expected metadata must be an object");
  assert(Number.isSafeInteger(expected.runId) && expected.runId > 0, "invalid expected run ID");
  assert(typeof expected.sha === "string" && SHA_PATTERN.test(expected.sha), "invalid expected commit SHA");
  assert(typeof expected.tag === "string" && TAG_PATTERN.test(expected.tag), "invalid expected release Tag");
  assert(
    typeof expected.image === "string" && expected.image.endsWith(`:${expected.sha}`),
    "invalid expected SHA image",
  );

  assert(buildRun.id === expected.runId, "build run ID mismatch");
  assert(buildRun.event === "workflow_dispatch", "build run event mismatch");
  assert(buildRun.conclusion === "success", "build run conclusion mismatch");
  assert(buildRun.head_sha === expected.sha, "build run SHA mismatch");
  assert(buildRun.head_branch === expected.tag, "build run Tag mismatch");

  assert(plan.schema_version === 1, "unsupported plan schema");
  assert(plan.workflow_run_id === expected.runId, "plan workflow run mismatch");
  assert(plan.target_environment === "production", "plan environment mismatch");
  assert(plan.commit_sha === expected.sha, "plan commit SHA mismatch");
  assert(isWebOnly(plan.build_services), "plan build services mismatch");
  assert(isWebOnly(plan.deploy_services), "plan deploy services mismatch");
  assert(plan.no_op === false, "production plan must not be a no-op");

  assert(manifest.service === "web", "manifest service mismatch");
  assert(manifest.target_environment === "production", "manifest environment mismatch");
  assert(manifest.commit_sha === expected.sha, "manifest commit SHA mismatch");
  assert(manifest.image === expected.image, "manifest image mismatch");
  assert(
    typeof manifest.digest === "string" && DIGEST_PATTERN.test(manifest.digest),
    "invalid manifest digest",
  );

  return {
    schema_version: 1,
    build_run_id: expected.runId,
    target_environment: "production",
    commit_sha: expected.sha,
    tag: expected.tag,
    service: "web",
    image: expected.image,
    digest: manifest.digest,
  };
}

function parseExpected(rawRunId, sha, tag, image) {
  assert(RUN_ID_PATTERN.test(rawRunId), "invalid expected run ID");
  const runId = Number(rawRunId);
  assert(Number.isSafeInteger(runId), "invalid expected run ID");
  return { image, runId, sha, tag };
}

function runCli() {
  const args = process.argv.slice(2);
  assert(
    args.length === 7,
    "expected BUILD_RUN_PATH PLAN_PATH MANIFEST_PATH RUN_ID SHA TAG SHA_IMAGE",
  );
  const [buildRunPath, planPath, manifestPath, rawRunId, sha, tag, image] = args;
  const buildRun = JSON.parse(readFileSync(buildRunPath, "utf8"));
  const plan = JSON.parse(readFileSync(planPath, "utf8"));
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const expected = parseExpected(rawRunId, sha, tag, image);
  const verified = verifyProductionWebBuildEvidence(buildRun, plan, manifest, expected);
  process.stdout.write(`${JSON.stringify(verified)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    runCli();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}
