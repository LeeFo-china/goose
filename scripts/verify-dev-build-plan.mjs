import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const TOP_LEVEL_FIELDS = [
  "schema_version",
  "target_environment",
  "commit_sha",
  "before_sha",
  "workflow_run_id",
  "migration_changed",
  "changed_files",
  "classifications",
  "build_services",
  "deploy_services",
  "no_op",
];
const CLASSIFICATIONS = new Set([
  "non-runtime",
  "migration",
  "web",
  "api",
  "admin",
  "social-video-worker",
  "shared-runtime",
  "unknown-runtime",
  "fallback-all",
]);
const BUILD_ORDER = ["api", "admin", "web", "social-video-worker"];
const DEPLOY_ORDER = [
  "api",
  "admin",
  "web",
  "social-video-worker",
  "cos-reconcile-worker",
  "billing-reconcile-worker",
];
const SHA_PATTERN = /^[a-f0-9]{40}$/u;
const RUN_ID_PATTERN = /^[1-9][0-9]*$/u;

function reject(reason) {
  throw new Error(reason);
}

function assert(condition, reason) {
  if (!condition) reject(reason);
}

function assertExactFields(plan) {
  const fields = Object.keys(plan);
  assert(fields.length === TOP_LEVEL_FIELDS.length, "invalid top-level fields");
  const expectedFields = new Set(TOP_LEVEL_FIELDS);
  assert(fields.every((field) => expectedFields.has(field)), "invalid top-level fields");
}

function assertSortedUnique(values, fieldName) {
  for (let index = 1; index < values.length; index += 1) {
    assert(values[index - 1] < values[index], `${fieldName} must be sorted and unique`);
  }
}

function assertStringArray(value, fieldName) {
  assert(Array.isArray(value), `${fieldName} must be an array`);
  assert(
    value.every((item) => typeof item === "string" && item.length > 0),
    `${fieldName} must contain non-empty strings`,
  );
}

function assertChangedFiles(changedFiles) {
  assertStringArray(changedFiles, "changed_files");
  assertSortedUnique(changedFiles, "changed_files");

  for (const changedFile of changedFiles) {
    assert(!changedFile.includes("\\"), "changed_files must use forward slashes");
    assert(!/^(?:\/|[a-zA-Z]:\/)/u.test(changedFile), "changed_files must be relative");
    const segments = changedFile.split("/");
    assert(
      segments.every((segment) => segment !== "" && segment !== "." && segment !== ".."),
      "changed_files must use canonical paths",
    );
  }
}

function assertClassifications(classifications) {
  assertStringArray(classifications, "classifications");
  assertSortedUnique(classifications, "classifications");
  assert(
    classifications.every((classification) => CLASSIFICATIONS.has(classification)),
    "unknown classification",
  );
}

function assertOrderedServices(services, allowedOrder, fieldName) {
  assertStringArray(services, fieldName);
  let previousIndex = -1;

  for (const service of services) {
    const serviceIndex = allowedOrder.indexOf(service);
    assert(serviceIndex > previousIndex, `${fieldName} contains an unknown, duplicate, or unordered service`);
    previousIndex = serviceIndex;
  }
}

function assertServiceEvidence(plan) {
  const buildServices = new Set(plan.build_services);
  const deployServices = new Set(plan.deploy_services);
  const hasBuilds = buildServices.size > 0;
  const hasDeploys = deployServices.size > 0;

  assert(hasBuilds === hasDeploys, "build and deploy evidence must both be present");
  assert(plan.no_op === (!hasBuilds && !hasDeploys), "no_op does not match service evidence");

  for (const service of deployServices) {
    const requiredBuild = service === "cos-reconcile-worker"
      || service === "billing-reconcile-worker"
      ? "api"
      : service;
    assert(buildServices.has(requiredBuild), `missing build evidence for ${service}`);
  }

  if (deployServices.has("web")) {
    assert(
      deployServices.has("api") && buildServices.has("api") && buildServices.has("web"),
      "web deployment requires API and Web build evidence",
    );
  }
}

export function verifyDevBuildPlan(plan, expected) {
  assert(plan !== null && typeof plan === "object" && !Array.isArray(plan), "plan must be an object");
  assertExactFields(plan);

  assert(plan.schema_version === 1, "unsupported schema");
  assert(plan.target_environment === "development", "environment mismatch");
  assert(typeof plan.commit_sha === "string" && SHA_PATTERN.test(plan.commit_sha), "invalid commit SHA");
  assert(typeof plan.before_sha === "string" && SHA_PATTERN.test(plan.before_sha), "invalid before SHA");
  assert(plan.commit_sha === expected.commitSha, "commit SHA mismatch");
  assert(
    Number.isSafeInteger(plan.workflow_run_id) && plan.workflow_run_id > 0,
    "invalid workflow run ID",
  );
  assert(plan.workflow_run_id === expected.workflowRunId, "workflow run mismatch");
  assert(typeof plan.migration_changed === "boolean", "migration_changed must be boolean");
  assert(typeof plan.no_op === "boolean", "no_op must be boolean");

  assertChangedFiles(plan.changed_files);
  assertClassifications(plan.classifications);
  assertOrderedServices(plan.build_services, BUILD_ORDER, "build_services");
  assertOrderedServices(plan.deploy_services, DEPLOY_ORDER, "deploy_services");
  assertServiceEvidence(plan);

  return plan;
}

function parseExpectedMetadata(expectedSha, rawExpectedRunId) {
  assert(SHA_PATTERN.test(expectedSha), "invalid expected commit SHA");
  assert(RUN_ID_PATTERN.test(rawExpectedRunId), "invalid expected workflow run ID");
  const workflowRunId = Number(rawExpectedRunId);
  assert(Number.isSafeInteger(workflowRunId), "invalid expected workflow run ID");
  return { commitSha: expectedSha, workflowRunId };
}

function runCli() {
  const args = process.argv.slice(2);
  assert(args.length === 3, "expected PLAN_PATH EXPECTED_SHA EXPECTED_RUN_ID");
  const [planPath, expectedSha, rawExpectedRunId] = args;
  const expected = parseExpectedMetadata(expectedSha, rawExpectedRunId);
  const plan = JSON.parse(readFileSync(planPath, "utf8"));
  const verifiedPlan = verifyDevBuildPlan(plan, expected);
  process.stdout.write(`${JSON.stringify(verifiedPlan)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    runCli();
  } catch {
    process.stderr.write("invalid development build plan\n");
    process.exitCode = 1;
  }
}
