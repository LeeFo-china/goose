import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const workflow = readFileSync(
  new URL("../.github/workflows/deploy-dev.yml", import.meta.url),
  "utf8",
);
const socialVideoWorkerDockerfile = readFileSync(
  new URL("../docker/social-video-worker.Dockerfile", import.meta.url),
  "utf8",
);
const devCompose = readFileSync(
  new URL("../deploy/docker-compose.dev.yml", import.meta.url),
  "utf8",
);
const productionApiCompose = readFileSync(
  new URL("../deploy/docker-compose.api.yml", import.meta.url),
  "utf8",
);

const evidenceStepStart = workflow.indexOf("- name: Validate immutable build evidence");
const deployStepStart = workflow.indexOf("- name: Deploy dev services");
const checkStepStart = workflow.indexOf("- name: Check dev services");
const gateStepStart = workflow.indexOf("- name: Validate gated dev web deployment");
const gatedDeployStepStart = workflow.indexOf("- name: Deploy gated dev web");
const gatedCheckStepStart = workflow.indexOf("- name: Check gated dev web");
const loginStepStart = workflow.indexOf("- name: Login to Tencent CCR");
const evidenceStep = workflow.slice(evidenceStepStart, gateStepStart);
const loginStep = workflow.slice(loginStepStart, deployStepStart);
const deployStep = workflow.slice(deployStepStart, checkStepStart);
const checkStep = workflow.slice(checkStepStart, gatedDeployStepStart);
const gatedDeployStep = workflow.slice(gatedDeployStepStart, gatedCheckStepStart);
const gatedCheckStep = workflow.slice(
  gatedCheckStepStart,
  workflow.indexOf("- name: Roll back gated dev web"),
);
const gateReceiptVerificationStart = workflow.indexOf(
  "node scripts/verify-web-gate-receipt.mjs",
  gateStepStart,
);
const gatedComposePullStart = workflow.indexOf(
  "docker compose -f docker-compose.web-dev.yml pull gooes-web-dev",
  gatedDeployStepStart,
);

const requiredImmutableDeploymentFragments = [
  'manifest_build_run_id="$(jq -er \'.build_run_id | select(type == "number" and . > 0 and (floor == .))\' "${IMAGE_MANIFEST_PATH}")"',
  'manifest_service="$(jq -er \'.service | select(type == "string" and length > 0)\' "${IMAGE_MANIFEST_PATH}")"',
  'manifest_image="$(jq -er \'.image | select(type == "string" and length > 0)\' "${IMAGE_MANIFEST_PATH}")"',
  'manifest_digest="$(jq -er \'.digest | select(type == "string" and test("^sha256:[a-f0-9]{64}$"))\' "${IMAGE_MANIFEST_PATH}")"',
  'test "${manifest_image}" = "${expected_manifest_image}"',
  'test "${manifest_build_run_id}" = "${INPUT_BUILD_RUN_ID}"',
  'manifest_image_repository="${manifest_image%:*}"',
  'DEPLOY_IMAGE_REF="${manifest_image_repository}@${manifest_digest}"',
  'echo "DEPLOY_IMAGE_REF=${DEPLOY_IMAGE_REF}" >> "${GITHUB_ENV}"',
  'api) compose_service=gooes-api-dev; export GOOES_API_IMAGE="${DEPLOY_IMAGE_REF}" ;;',
  'admin) compose_service=gooes-admin-dev; export GOOES_ADMIN_IMAGE="${DEPLOY_IMAGE_REF}" ;;',
  'social-video-worker) compose_service=gooes-social-video-worker-dev; export GOOES_SOCIAL_VIDEO_WORKER_IMAGE="${DEPLOY_IMAGE_REF}" ;;',
  'cos-reconcile-worker) compose_service=gooes-cos-reconcile-worker-dev; export GOOES_API_IMAGE="${DEPLOY_IMAGE_REF}" ;;',
  'export GOOES_WEB_IMAGE="${DEPLOY_IMAGE_REF}"',
  'configured_image="$(docker inspect -f \'{{.Config.Image}}\' "${container}" 2>/dev/null || true)"',
  'test "${configured_image}" = "${DEPLOY_IMAGE_REF}"',
  'test "${run_id}" = "${INPUT_BUILD_RUN_ID}"',
  'configured_image="$(docker inspect -f \'{{.Config.Image}}\' gooes-web-dev 2>/dev/null || true)"',
];
const requiredNonWebHealthAssertions = [
  'test "${state}" = running',
  'test "${health}" = healthy',
];
const requiredProjectHealthSmokeFragments = [
  'if [ "${RELEASE_SERVICE}" = api ] || [ "${RELEASE_SERVICE}" = admin ]; then',
  'project_health_cookie_jar="$(mktemp)"',
  'https://admin-dev.goodcms.cn/api/auth/login',
  '--data \'{"phone":"18800000001","code":""}\'',
  'https://admin-dev.goodcms.cn/api/backend/project-health/risks?page=1&pageSize=20',
  'PROJECT_HEALTH_SMOKE_RESPONSE_PATH="${project_health_response_path}" node <<\'NODE\'',
  'if (payload?.message !== "success" || !Array.isArray(payload?.data?.items)) {',
];

function satisfiesImmutableDeploymentContract(candidate: string): boolean {
  return requiredImmutableDeploymentFragments.every((fragment) => candidate.includes(fragment));
}

function satisfiesNonWebHealthContract(candidate: string): boolean {
  return requiredNonWebHealthAssertions.every((fragment) => candidate.includes(fragment));
}

function satisfiesProjectHealthSmokeContract(candidate: string): boolean {
  return requiredProjectHealthSmokeFragments.every((fragment) => candidate.includes(fragment));
}

function extractRunScript(step: string): string {
  const marker = "        run: |\n";
  const start = step.indexOf(marker);
  expect(start).toBeGreaterThanOrEqual(0);

  return step
    .slice(start + marker.length)
    .split("\n")
    .map((line) => line.replace(/^          /, ""))
    .join("\n");
}

function runNonWebHealthCheck(health: "healthy" | "unhealthy"): ReturnType<typeof Bun.spawnSync> {
  const checkScript = extractRunScript(checkStep);
  const dockerMock = `
docker() {
  case "$3" in
    '{{.State.Status}}') printf '%s\\n' running ;;
    '{{if .State.Health}}{{.State.Health.Status}}{{end}}') printf '%s\\n' ${health} ;;
    '{{index .Config.Labels "org.opencontainers.image.revision"}}') printf '%s\\n' "$SOURCE_SHA" ;;
    '{{index .Config.Labels "com.goodcms.github.run_id"}}') printf '%s\\n' "$INPUT_BUILD_RUN_ID" ;;
    '{{.Config.Image}}') printf '%s\\n' "$DEPLOY_IMAGE_REF" ;;
    *) return 1 ;;
  esac
}
sleep() { :; }
`;

  return Bun.spawnSync(["bash", "-c", `${dockerMock}\n${checkScript}`], {
    env: {
      ...process.env,
      DEPLOY_IMAGE_REF: "useccr.ccs.tencentyun.com/america_goose/goose-social-video-worker@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      INPUT_BUILD_RUN_ID: "123",
      RELEASE_SERVICE: "social-video-worker",
      SOURCE_SHA: "0123456789abcdef0123456789abcdef01234567",
    },
    stderr: "pipe",
    stdout: "pipe",
  });
}

describe("deploy-dev workflow", () => {
  test("keeps the test-login bypass limited to development containers", () => {
    expect(devCompose.match(/GOOES_DEPLOY_ENV: development/g)).toHaveLength(3);
    expect(devCompose).not.toContain("GOOES_DEPLOY_ENV: production");
    expect(productionApiCompose.match(/GOOES_DEPLOY_ENV: production/g)).toHaveLength(3);
    expect(productionApiCompose).not.toContain("GOOES_DEPLOY_ENV: development");
  });

  test("binds the manifest service, image, digest, and current CCR pair", () => {
    expect(evidenceStepStart).toBeGreaterThanOrEqual(0);
    expect(gateStepStart).toBeGreaterThan(evidenceStepStart);
    expect(loginStepStart).toBeGreaterThan(gateStepStart);
    expect(loginStepStart).toBeLessThan(deployStepStart);
    expect(evidenceStep).toContain('echo "IMAGE_MANIFEST_PATH=${manifest}" >> "${GITHUB_ENV}"');
    expect(loginStep).toContain(
      'case "${MANIFEST_SERVICE}" in\n            api) manifest_repository=goose-api ;;',
    );
    expect(loginStep).toContain("admin) manifest_repository=goose-admin ;;");
    expect(loginStep).toContain("web) manifest_repository=goose-web ;;");
    expect(loginStep).toContain(
      "social-video-worker) manifest_repository=goose-social-video-worker ;;",
    );
    expect(loginStep).toContain(
      'image_base="${TENCENT_CCR_REGISTRY}/${TENCENT_CCR_NAMESPACE}"',
    );
    expect(loginStep).toContain(
      'expected_manifest_image="${image_base}/${manifest_repository}:run-${INPUT_BUILD_RUN_ID}-${SOURCE_SHA}"',
    );
    expect(loginStep).toContain(
      'manifest_build_run_id="$(jq -er \'.build_run_id | select(type == "number" and . > 0 and (floor == .))\' "${IMAGE_MANIFEST_PATH}")"',
    );
    expect(loginStep).toContain(
      'manifest_service="$(jq -er \'.service | select(type == "string" and length > 0)\' "${IMAGE_MANIFEST_PATH}")"',
    );
    expect(loginStep).toContain(
      'manifest_image="$(jq -er \'.image | select(type == "string" and length > 0)\' "${IMAGE_MANIFEST_PATH}")"',
    );
    expect(loginStep).toContain(
      'manifest_digest="$(jq -er \'.digest | select(type == "string" and test("^sha256:[a-f0-9]{64}$"))\' "${IMAGE_MANIFEST_PATH}")"',
    );
    expect(loginStep).toContain('test "${manifest_service}" = "${MANIFEST_SERVICE}"');
    expect(loginStep).toContain('test "${manifest_image}" = "${expected_manifest_image}"');
    expect(loginStep).toContain('test "${manifest_build_run_id}" = "${INPUT_BUILD_RUN_ID}"');
    expect(loginStep).toContain('manifest_image_repository="${manifest_image%:*}"');
    expect(loginStep).toContain(
      'test "${manifest_image_repository}" = "${image_base}/${manifest_repository}"',
    );
    expect(loginStep).toContain(
      'DEPLOY_IMAGE_REF="${manifest_image_repository}@${manifest_digest}"',
    );
    expect(loginStep).toContain(
      'echo "DEPLOY_IMAGE_REF=${DEPLOY_IMAGE_REF}" >> "${GITHUB_ENV}"',
    );
  });

  test("deploys the selected non-Web service by manifest digest", () => {
    expect(deployStepStart).toBeGreaterThanOrEqual(0);
    expect(checkStepStart).toBeGreaterThan(deployStepStart);

    expect(deployStep).toContain(
      'image_base="${TENCENT_CCR_REGISTRY}/${TENCENT_CCR_NAMESPACE}"',
    );
    expect(deployStep).toContain('export GOOES_API_IMAGE="${image_base}/goose-api:${SOURCE_SHA}"');
    expect(deployStep).toContain(
      'export GOOES_ADMIN_IMAGE="${image_base}/goose-admin:${SOURCE_SHA}"',
    );
    expect(deployStep).toContain('export GOOES_WEB_IMAGE="${image_base}/goose-web:${SOURCE_SHA}"');
    expect(deployStep).toContain(
      'export GOOES_SOCIAL_VIDEO_WORKER_IMAGE="${image_base}/goose-social-video-worker:${SOURCE_SHA}"',
    );
    expect(deployStep).toContain(
      'api) compose_service=gooes-api-dev; export GOOES_API_IMAGE="${DEPLOY_IMAGE_REF}" ;;',
    );
    expect(deployStep).toContain(
      'admin) compose_service=gooes-admin-dev; export GOOES_ADMIN_IMAGE="${DEPLOY_IMAGE_REF}" ;;',
    );
    expect(deployStep).toContain(
      'social-video-worker) compose_service=gooes-social-video-worker-dev; export GOOES_SOCIAL_VIDEO_WORKER_IMAGE="${DEPLOY_IMAGE_REF}" ;;',
    );
    expect(
      deployStep,
    ).toContain(
      'cos-reconcile-worker) compose_service=gooes-cos-reconcile-worker-dev; export GOOES_API_IMAGE="${DEPLOY_IMAGE_REF}" ;;',
    );
    expect(deployStep).toContain('cd "${DEV_DEPLOY_DIR}"');
    expect(deployStep).toContain(
      'docker compose -f docker-compose.dev.yml --profile workers pull "${compose_service}"',
    );
    expect(deployStep).toContain(
      'docker compose -f docker-compose.dev.yml --profile workers up -d --no-deps --force-recreate "${compose_service}"',
    );
    expect(deployStep).not.toContain("REMOTE_GOOES_");
    expect(checkStep).toContain(
      'configured_image="$(docker inspect -f \'{{.Config.Image}}\' "${container}" 2>/dev/null || true)"',
    );
    expect(checkStep).toContain('test "${configured_image}" = "${DEPLOY_IMAGE_REF}"');
    expect(checkStep).toContain('test "${revision}" = "${SOURCE_SHA}"');
    expect(checkStep).toContain('test "${run_id}" = "${INPUT_BUILD_RUN_ID}"');
    expect(checkStep).toContain('test "${state}" = running');
    expect(checkStep).toContain('test "${health}" = healthy');
  });

  test("rejects an unhealthy non-Web container after the polling deadline", () => {
    expect(runNonWebHealthCheck("unhealthy").exitCode).not.toBe(0);
  });

  test("accepts a healthy non-Web container with matching immutable evidence", () => {
    expect(runNonWebHealthCheck("healthy").exitCode).toBe(0);
  });

  test("rejects removal of either final non-Web health assertion", () => {
    expect(satisfiesNonWebHealthContract(checkStep)).toBe(true);

    for (const assertion of requiredNonWebHealthAssertions) {
      expect(satisfiesNonWebHealthContract(checkStep.replace(assertion, ""))).toBe(false);
    }
  });

  test("checks the project health route after API or Admin dev deployment", () => {
    expect(satisfiesProjectHealthSmokeContract(checkStep)).toBe(true);

    for (const fragment of requiredProjectHealthSmokeFragments) {
      expect(satisfiesProjectHealthSmokeContract(checkStep.replace(fragment, ""))).toBe(false);
    }
  });

  test("deploys the immutable Web image locally only after its gate", () => {
    expect(gateStepStart).toBeGreaterThanOrEqual(0);
    expect(gatedDeployStepStart).toBeGreaterThan(checkStepStart);
    expect(gatedDeployStepStart).toBeGreaterThan(gateStepStart);
    expect(gatedCheckStepStart).toBeGreaterThan(gatedDeployStepStart);
    expect(gatedDeployStep).toContain("if: ${{ env.WEB_DEPLOY_APPROVED == 'true' }}");
    expect(gateReceiptVerificationStart).toBeGreaterThan(gateStepStart);
    expect(gateReceiptVerificationStart).toBeLessThan(gatedComposePullStart);
    expect(gatedComposePullStart).toBeGreaterThan(gatedDeployStepStart);
    expect(gatedDeployStep).toContain(
      'export GOOES_WEB_IMAGE="${DEPLOY_IMAGE_REF}"',
    );
    expect(gatedDeployStep).toContain('cd "${DEV_DEPLOY_DIR}"');
    expect(gatedDeployStep).toContain(
      "docker compose -f docker-compose.web-dev.yml pull gooes-web-dev",
    );
    expect(gatedDeployStep).toContain(
      "docker compose -f docker-compose.web-dev.yml up -d --no-deps --force-recreate gooes-web-dev",
    );
    expect(gatedDeployStep).not.toContain("REMOTE_GOOES_WEB_IMAGE");
    expect(gatedDeployStep).not.toContain("${GITHUB_SHA}");
    expect(gatedCheckStep).toContain(
      'configured_image="$(docker inspect -f \'{{.Config.Image}}\' gooes-web-dev 2>/dev/null || true)"',
    );
    expect(gatedCheckStep).toContain('test "${configured_image}" = "${DEPLOY_IMAGE_REF}"');
    expect(gatedCheckStep).toContain('test "${run_id}" = "${INPUT_BUILD_RUN_ID}"');
  });

  test("rejects regressions that ignore manifest.image or deploy a selected SHA tag", () => {
    expect(satisfiesImmutableDeploymentContract(workflow)).toBe(true);

    const ignoredManifestImage = workflow.replace(
      'manifest_image="$(jq -er \'.image | select(type == "string" and length > 0)\' "${IMAGE_MANIFEST_PATH}")"',
      'manifest_image="${expected_manifest_image}"',
    );
    expect(satisfiesImmutableDeploymentContract(ignoredManifestImage)).toBe(false);

    const selectedShaTag = workflow.replace(
      'api) compose_service=gooes-api-dev; export GOOES_API_IMAGE="${DEPLOY_IMAGE_REF}" ;;',
      'api) compose_service=gooes-api-dev; export GOOES_API_IMAGE="${image_base}/goose-api:${SOURCE_SHA}" ;;',
    );
    expect(satisfiesImmutableDeploymentContract(selectedShaTag)).toBe(false);
  });

  test("builds social video worker with domain package dependencies", () => {
    const domainNodeModulesCopy = "COPY --from=deps /app/packages/domain/node_modules ./packages/domain/node_modules";
    expect(socialVideoWorkerDockerfile).toContain(domainNodeModulesCopy);
    expect(socialVideoWorkerDockerfile.indexOf(domainNodeModulesCopy)).toBeLessThan(
      socialVideoWorkerDockerfile.indexOf("RUN cd packages/domain && bun run build"),
    );
  });
});
