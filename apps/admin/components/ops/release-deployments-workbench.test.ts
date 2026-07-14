import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { ReleaseRun } from "./ops-types";
import {
  isReleaseRunActive,
  statusLabel,
  statusVariant,
} from "./release-deployments-shared";

function run(overrides: Partial<ReleaseRun> = {}): ReleaseRun {
  return {
    id: "run_1",
    environment: "production",
    workflow_id: "release-production.yml",
    workflow_label: "生产环境",
    services: ["api"],
    service_label: "API",
    stage: "building",
    stage_label: "构建中",
    legacy: false,
    audit: null,
    title: "Production build api candidate v2026.07.13.1",
    status: "in_progress",
    conclusion: null,
    event: "workflow_dispatch",
    head_branch: "v2026.07.13.1",
    head_sha: "a".repeat(40),
    html_url: "https://github.com/acme/repo/actions/runs/1",
    created_at: "2026-07-13T01:00:00Z",
    updated_at: "2026-07-13T01:05:00Z",
    run_started_at: "2026-07-13T01:01:00Z",
    ...overrides,
  };
}

describe("release deployment workbench contracts", () => {
  test("uses two-stage production copy and candidate evidence UI", () => {
    const dispatchSource = readFileSync(join(import.meta.dir, "release-deployments-dispatch-card.tsx"), "utf8");
    const candidateSource = readFileSync(join(import.meta.dir, "release-candidate-evidence.tsx"), "utf8");

    expect(dispatchSource).toContain("构建并发布到开发环境");
    expect(dispatchSource).toContain("构建生产候选");
    expect(dispatchSource).toContain("确认构建生产候选");
    expect(dispatchSource).not.toContain("生产发布会触发构建并重建对应生产容器");
    expect(candidateSource).toContain("部署此构建到生产");
    expect(candidateSource).toContain("确认部署生产环境");
    expect(candidateSource).toContain("Commit SHA");
    expect(candidateSource).toContain("构建 Run");
    expect(candidateSource).toContain("镜像清单已验证");
    expect(candidateSource).toContain("AlertDialog");
    expect(candidateSource).not.toContain("<Card");
  });

  test("uses production candidate API paths", () => {
    const sharedSource = readFileSync(join(import.meta.dir, "release-deployments-shared.ts"), "utf8");

    expect(sharedSource).toContain("/admin/ops/releases/production-candidates/${encodeURIComponent(runId)}");
    expect(sharedSource).toContain("/deploy");
  });

  test("maps release stages before raw GitHub status", () => {
    expect(statusLabel(run({ stage: "ready_to_deploy", stage_label: "可部署", status: "completed", conclusion: "success" }))).toBe("可部署");
    expect(statusLabel(run({ stage: "deploy_failed", stage_label: "部署失败", status: "completed", conclusion: "failure" }))).toBe("部署失败");
    expect(statusLabel(run({ stage: "deployed", stage_label: "已部署", status: "completed", conclusion: "success" }))).toBe("已部署");

    expect(statusVariant(run({ stage: "ready_to_deploy", stage_label: "可部署" }))).toBe("success");
    expect(statusVariant(run({ stage: "deploy_failed", stage_label: "部署失败" }))).toBe("danger");
    expect(statusVariant(run({ stage: "building", stage_label: "构建中" }))).toBe("warning");
    expect(statusVariant(run({ stage: "legacy", stage_label: "历史记录", legacy: true, status: "completed", conclusion: "success" }))).toBe("success");
  });

  test("polls only active stages", () => {
    expect(isReleaseRunActive(run({ stage: "build_queued", stage_label: "构建排队中", status: "queued" }))).toBe(true);
    expect(isReleaseRunActive(run({ stage: "building", stage_label: "构建中", status: "in_progress" }))).toBe(true);
    expect(isReleaseRunActive(run({ stage: "deploy_queued", stage_label: "部署排队中", status: "queued" }))).toBe(true);
    expect(isReleaseRunActive(run({ stage: "deploying", stage_label: "部署中", status: "in_progress" }))).toBe(true);
    expect(isReleaseRunActive(run({ stage: "ready_to_deploy", stage_label: "可部署", status: "completed", conclusion: "success" }))).toBe(false);
    expect(isReleaseRunActive(run({ stage: "deployed", stage_label: "已部署", status: "completed", conclusion: "success" }))).toBe(false);
    expect(isReleaseRunActive(run({ stage: "legacy", stage_label: "历史记录", legacy: true, status: "queued", conclusion: null }))).toBe(true);
  });
});
