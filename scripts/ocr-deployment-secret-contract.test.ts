import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

function read(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

function workflowStep(workflow: string, name: string): string {
  const start = workflow.indexOf(`- name: ${name}`);
  expect(start).toBeGreaterThanOrEqual(0);
  const next = workflow.indexOf("\n      - name:", start + 1);
  return workflow.slice(start, next === -1 ? undefined : next);
}

const devCompose = read("deploy/docker-compose.dev.yml");
const productionCompose = read("deploy/docker-compose.api.yml");
const devDeploy = read(".github/workflows/deploy-dev.yml");
const productionDeploy = read(".github/workflows/deploy-docker-services.yml");

const requiredComposeValue =
  "OCR_RESULT_ENCRYPTION_KEY: ${OCR_RESULT_ENCRYPTION_KEY:?set OCR_RESULT_ENCRYPTION_KEY}";
const requiredWorkflowSecret =
  "OCR_RESULT_ENCRYPTION_KEY: ${{ secrets.OCR_RESULT_ENCRYPTION_KEY }}";
const requiredWechatSessionComposeValue =
  "WECHAT_MINI_SESSION_ENCRYPTION_KEY_V1: ${WECHAT_MINI_SESSION_ENCRYPTION_KEY_V1:?set WECHAT_MINI_SESSION_ENCRYPTION_KEY_V1}";
const requiredWechatSessionWorkflowSecret =
  "WECHAT_MINI_SESSION_ENCRYPTION_KEY_V1: ${{ secrets.WECHAT_MINI_SESSION_ENCRYPTION_KEY_V1 }}";

describe("OCR result encryption deployment secret", () => {
  test("requires the secret in development and production API containers", () => {
    expect(devCompose).toContain(requiredComposeValue);
    expect(productionCompose).toContain(requiredComposeValue);
  });

  test("injects the environment-scoped secret into development deployment", () => {
    expect(workflowStep(devDeploy, "Deploy dev services")).toContain(
      requiredWorkflowSecret,
    );
  });

  test("injects the environment-scoped secret into production compose steps", () => {
    for (const stepName of ["Pull latest images", "Recreate services"]) {
      expect(workflowStep(productionDeploy, stepName)).toContain(
        requiredWorkflowSecret,
      );
    }
  });
});

describe("WeChat mini session encryption deployment secret", () => {
  test("requires the secret in development and production API containers", () => {
    expect(devCompose).toContain(requiredWechatSessionComposeValue);
    expect(productionCompose).toContain(requiredWechatSessionComposeValue);
  });

  test("injects the environment-scoped secret into development deployment", () => {
    expect(workflowStep(devDeploy, "Deploy dev services")).toContain(
      requiredWechatSessionWorkflowSecret,
    );
  });

  test("injects the environment-scoped secret into production compose steps", () => {
    for (const stepName of ["Pull latest images", "Recreate services"]) {
      expect(workflowStep(productionDeploy, stepName)).toContain(
        requiredWechatSessionWorkflowSecret,
      );
    }
  });
});
