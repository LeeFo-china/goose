import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const REQUESTED_ORDER = [
  "api",
  "admin",
  "social-video-worker",
  "cos-reconcile-worker",
];
const BUILD_ORDER = ["api", "admin", "social-video-worker"];
const IMAGE_REPOSITORIES = {
  admin: "goose-admin",
  api: "goose-api",
  "social-video-worker": "goose-social-video-worker",
};
const SHA_PATTERN = /^[a-f0-9]{40}$/u;
const DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/u;
const TAG_PATTERN = /^v[0-9]{4}\.[0-9]{2}\.[0-9]{2}\.[0-9]+$/u;
const RUN_ID_PATTERN = /^[1-9][0-9]*$/u;
const IMAGE_BASE_PATTERN = /^[a-z0-9.-]+(?::[0-9]+)?\/[a-z0-9._-]+$/u;
const ALLOWED_IMAGE_BASES = new Set([
  "useccr.ccs.tencentyun.com/america_goose",
  "ccr.ccs.tencentyun.com/gooes-goodcms",
]);

function reject(message) {
  throw new Error(message);
}

function assert(condition, message) {
  if (!condition) reject(message);
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function arraysEqual(left, right) {
  return Array.isArray(left)
    && Array.isArray(right)
    && left.length === right.length
    && left.every((value, index) => value === right[index]);
}

function assertOrderedServices(services, allowedOrder, fieldName) {
  assert(Array.isArray(services), `${fieldName} must be an array`);
  let previousIndex = -1;

  for (const service of services) {
    assert(typeof service === "string", `${fieldName} must contain strings`);
    const serviceIndex = allowedOrder.indexOf(service);
    if (serviceIndex === -1) reject(`unsupported ${fieldName.slice(0, -1)}: ${service}`);
    assert(
      serviceIndex > previousIndex,
      `${fieldName} must be unique and in stable order`,
    );
    previousIndex = serviceIndex;
  }
}

function expectedBuildServices(requestedServices) {
  const requested = new Set(requestedServices);
  return BUILD_ORDER.filter((service) =>
    service === "api"
      ? requested.has("api") || requested.has("cos-reconcile-worker")
      : requested.has(service)
  );
}

export function verifyProductionReleaseCandidate(candidate, plan, manifests, expected) {
  assert(isObject(candidate), "candidate must be an object");
  assert(isObject(plan), "plan must be an object");
  assert(isObject(manifests), "manifests must be an object");
  assert(isObject(expected), "expected metadata must be an object");
  assert(
    typeof expected.imageBase === "string"
      && IMAGE_BASE_PATTERN.test(expected.imageBase),
    "invalid expected image base",
  );
  assert(
    ALLOWED_IMAGE_BASES.has(expected.imageBase),
    "unsupported expected image base",
  );

  assert(candidate.schema_version === 1, "unsupported candidate schema");
  assert(
    Number.isSafeInteger(expected.runId) && expected.runId > 0,
    "invalid expected run ID",
  );
  assert(candidate.build_run_id === expected.runId, "candidate build run mismatch");
  assert(candidate.target_environment === "production", "candidate environment mismatch");
  assert(SHA_PATTERN.test(expected.sha), "invalid expected commit SHA");
  assert(
    typeof candidate.commit_sha === "string" && SHA_PATTERN.test(candidate.commit_sha),
    "invalid candidate commit SHA",
  );
  assert(candidate.commit_sha === expected.sha, "candidate commit SHA mismatch");
  assert(typeof candidate.tag === "string" && TAG_PATTERN.test(candidate.tag), "invalid candidate tag");
  assert(
    candidate.build_plan_artifact === "production-build-plan",
    "invalid build plan artifact",
  );

  assertOrderedServices(expected.services, REQUESTED_ORDER, "expected services");
  assertOrderedServices(candidate.requested_services, REQUESTED_ORDER, "requested services");
  assert(candidate.requested_services.length > 0, "requested services must not be empty");
  assert(
    arraysEqual(candidate.requested_services, expected.services),
    "requested services mismatch",
  );
  assertOrderedServices(candidate.build_services, BUILD_ORDER, "build services");
  assert(
    arraysEqual(candidate.build_services, expectedBuildServices(candidate.requested_services)),
    "candidate build services mismatch",
  );

  assert(plan.schema_version === 1, "unsupported plan schema");
  assert(plan.workflow_run_id === expected.runId, "plan workflow run mismatch");
  assert(
    typeof plan.commit_sha === "string" && SHA_PATTERN.test(plan.commit_sha),
    "invalid plan commit SHA",
  );
  assert(plan.commit_sha === expected.sha, "plan commit SHA mismatch");
  assert(plan.target_environment === "production", "plan environment mismatch");
  assert(plan.no_op === false, "production plan must not be a no-op");
  assert(arraysEqual(plan.build_services, candidate.build_services), "plan build services mismatch");
  assert(
    arraysEqual(plan.deploy_services, candidate.requested_services),
    "plan deploy services mismatch",
  );

  for (const service of candidate.build_services) {
    assert(Object.hasOwn(manifests, service), `missing manifest for ${service}`);
    const manifest = manifests[service];
    assert(isObject(manifest), `invalid manifest for ${service}`);
    assert(manifest.service === service, `manifest service mismatch for ${service}`);
    assert(
      manifest.build_run_id === expected.runId,
      `manifest build run mismatch for ${service}`,
    );
    assert(
      manifest.commit_sha === expected.sha,
      `manifest commit SHA mismatch for ${service}`,
    );
    assert(
      manifest.target_environment === "production",
      `manifest environment mismatch for ${service}`,
    );
    const expectedImage = `${expected.imageBase}/${IMAGE_REPOSITORIES[service]}`
      + `:run-${expected.runId}-${expected.sha}`;
    assert(manifest.image === expectedImage, `manifest image mismatch for ${service}`);
    assert(
      typeof manifest.digest === "string" && DIGEST_PATTERN.test(manifest.digest),
      `invalid manifest digest for ${service}`,
    );
  }

  return candidate;
}

function parseExpected(rawRunId, expectedSha, rawServices, imageBase) {
  assert(RUN_ID_PATTERN.test(rawRunId), "invalid expected run ID");
  const runId = Number(rawRunId);
  assert(Number.isSafeInteger(runId), "invalid expected run ID");
  const services = rawServices.replaceAll(/\s/gu, "").split(",");
  return { imageBase, runId, services, sha: expectedSha };
}

function readManifests(manifestDirectory, candidate) {
  const manifests = {};
  if (!Array.isArray(candidate.build_services)) return manifests;

  for (const service of new Set(candidate.build_services)) {
    if (!BUILD_ORDER.includes(service)) continue;
    const manifestPath = join(manifestDirectory, `image-manifest-${service}.json`);
    manifests[service] = JSON.parse(readFileSync(manifestPath, "utf8"));
  }

  return manifests;
}

function runCli() {
  const args = process.argv.slice(2);
  assert(
    args.length === 7,
    "expected CANDIDATE_PATH PLAN_PATH MANIFEST_DIRECTORY RUN_ID SHA SERVICES IMAGE_BASE",
  );
  const [
    candidatePath,
    planPath,
    manifestDirectory,
    rawRunId,
    expectedSha,
    rawServices,
    imageBase,
  ] = args;
  const candidate = JSON.parse(readFileSync(candidatePath, "utf8"));
  const plan = JSON.parse(readFileSync(planPath, "utf8"));
  const expected = parseExpected(rawRunId, expectedSha, rawServices, imageBase);
  const manifests = readManifests(manifestDirectory, candidate);
  const verifiedCandidate = verifyProductionReleaseCandidate(candidate, plan, manifests, expected);
  process.stdout.write(`${JSON.stringify(verifiedCandidate)}\n`);
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
