import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const workflow = readFileSync(
  new URL("../.github/workflows/deploy-dev.yml", import.meta.url),
  "utf8",
);

const deployStepStart = workflow.indexOf("- name: Deploy dev services");
const checkStepStart = workflow.indexOf("- name: Check dev services");
const deployStep = workflow.slice(deployStepStart, checkStepStart);
const gatedDeployStepStart = workflow.indexOf("- name: Deploy gated dev web");
const gatedCheckStepStart = workflow.indexOf("- name: Check gated dev web");
const gatedDeployStep = workflow.slice(gatedDeployStepStart, gatedCheckStepStart);

describe("deploy-dev workflow", () => {
  test("passes the just-built CCR images to remote docker compose", () => {
    expect(deployStepStart).toBeGreaterThanOrEqual(0);
    expect(checkStepStart).toBeGreaterThan(deployStepStart);

    expect(deployStep).toContain('CCR_NAMESPACE="${{ vars.TENCENT_CCR_NAMESPACE }}"');
    expect(deployStep).toContain(
      'REMOTE_GOOES_API_IMAGE="${TENCENT_CCR_REGISTRY}/${CCR_NAMESPACE}/goose-api:${IMAGE_TAG}"',
    );
    expect(deployStep).toContain(
      'REMOTE_GOOES_ADMIN_IMAGE="${TENCENT_CCR_REGISTRY}/${CCR_NAMESPACE}/goose-admin:${IMAGE_TAG}"',
    );
    expect(deployStep).toContain(
      'REMOTE_GOOES_SOCIAL_VIDEO_WORKER_IMAGE="${TENCENT_CCR_REGISTRY}/${CCR_NAMESPACE}/goose-social-video-worker:${IMAGE_TAG}"',
    );

    expect(deployStep.match(/GOOES_API_IMAGE='\$\{REMOTE_GOOES_API_IMAGE\}'/g)).toHaveLength(2);
    expect(deployStep.match(/GOOES_ADMIN_IMAGE='\$\{REMOTE_GOOES_ADMIN_IMAGE\}'/g)).toHaveLength(2);
    expect(
      deployStep.match(
        /GOOES_SOCIAL_VIDEO_WORKER_IMAGE='\$\{REMOTE_GOOES_SOCIAL_VIDEO_WORKER_IMAGE\}'/g,
      ),
    ).toHaveLength(2);
    expect(deployStep).not.toContain("REMOTE_GOOES_WEB_IMAGE");
  });

  test("passes the web image only after the dedicated manual gate", () => {
    expect(gatedDeployStepStart).toBeGreaterThan(checkStepStart);
    expect(gatedCheckStepStart).toBeGreaterThan(gatedDeployStepStart);
    expect(gatedDeployStep).toContain(
      'REMOTE_GOOES_WEB_IMAGE="${TENCENT_CCR_REGISTRY}/${CCR_NAMESPACE}/goose-web:${IMAGE_TAG}"',
    );
    expect(
      gatedDeployStep.match(/GOOES_WEB_IMAGE='\$\{REMOTE_GOOES_WEB_IMAGE\}'/g),
    ).toHaveLength(2);
  });
});
