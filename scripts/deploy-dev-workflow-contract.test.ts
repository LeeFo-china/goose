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

const deployStepStart = workflow.indexOf("- name: Deploy dev services");
const checkStepStart = workflow.indexOf("- name: Check dev services");
const deployStep = workflow.slice(deployStepStart, checkStepStart);
const gateStepStart = workflow.indexOf("- name: Validate gated dev web deployment");
const gatedDeployStepStart = workflow.indexOf("- name: Deploy gated dev web");
const gatedCheckStepStart = workflow.indexOf("- name: Check gated dev web");
const gatedDeployStep = workflow.slice(gatedDeployStepStart, gatedCheckStepStart);
const gateReceiptVerificationStart = workflow.indexOf(
  "node scripts/verify-web-gate-receipt.mjs",
  gateStepStart,
);
const gatedComposePullStart = workflow.indexOf(
  "docker compose -f docker-compose.web-dev.yml pull gooes-web-dev",
  gatedDeployStepStart,
);

describe("deploy-dev workflow", () => {
  test("deploys immutable non-Web images with local docker compose", () => {
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
    expect(deployStep).toContain("api) compose_service=gooes-api-dev ;;");
    expect(deployStep).toContain("admin) compose_service=gooes-admin-dev ;;");
    expect(deployStep).toContain(
      "social-video-worker) compose_service=gooes-social-video-worker-dev ;;",
    );
    expect(
      deployStep,
    ).toContain("cos-reconcile-worker) compose_service=gooes-cos-reconcile-worker-dev ;;");
    expect(deployStep).toContain('cd "${DEV_DEPLOY_DIR}"');
    expect(deployStep).toContain(
      'docker compose -f docker-compose.dev.yml --profile workers pull "${compose_service}"',
    );
    expect(deployStep).toContain(
      'docker compose -f docker-compose.dev.yml --profile workers up -d --no-deps --force-recreate "${compose_service}"',
    );
    expect(deployStep).not.toContain("REMOTE_GOOES_");
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
      'export GOOES_WEB_IMAGE="${image_base}/goose-web:${SOURCE_SHA}"',
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
  });

  test("builds social video worker with domain package dependencies", () => {
    const domainNodeModulesCopy = "COPY --from=deps /app/packages/domain/node_modules ./packages/domain/node_modules";
    expect(socialVideoWorkerDockerfile).toContain(domainNodeModulesCopy);
    expect(socialVideoWorkerDockerfile.indexOf(domainNodeModulesCopy)).toBeLessThan(
      socialVideoWorkerDockerfile.indexOf("RUN cd packages/domain && bun run build"),
    );
  });
});
