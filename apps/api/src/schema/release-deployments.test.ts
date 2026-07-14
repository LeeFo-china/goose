import { describe, expect, test } from "bun:test";

import {
  ReleaseDispatchSchema,
  ReleaseProductionCandidateDeploySchema,
  ReleaseProductionCandidateParamsSchema,
  ReleaseProductionMigrationPrecheckDispatchSchema,
} from "./release-deployments";

describe("release deployment schemas", () => {
  test("requires candidate-build confirmation for production dispatch", () => {
    expect(ReleaseDispatchSchema.safeParse({
      environment: "production",
      service: "api",
      ref_type: "tag",
      ref: "v2026.07.13.1",
      confirm_text: "确认构建生产候选",
    }).success).toBe(true);
    expect(ReleaseDispatchSchema.safeParse({
      environment: "production",
      service: "api",
      ref_type: "tag",
      ref: "v2026.07.13.1",
      confirm_text: "确认发布生产",
    }).success).toBe(false);
    expect(ReleaseDispatchSchema.safeParse({
      environment: "production",
      service: "api",
      ref_type: "tag",
      ref: "v2026.07.13.1",
      operation: "rollback",
      confirm_text: "确认构建生产候选",
    }).success).toBe(true);
  });

  test("allows a development rollback to an explicitly selected Ref", () => {
    expect(ReleaseDispatchSchema.safeParse({
      environment: "dev",
      service: "api",
      ref_type: "tag",
      ref: "v2026.07.13.1",
      operation: "rollback",
    }).success).toBe(true);
  });

  test("requires a numeric candidate run ID", () => {
    expect(ReleaseProductionCandidateParamsSchema.safeParse({ runId: "123" }).success).toBe(true);
    expect(ReleaseProductionCandidateParamsSchema.safeParse({ runId: "abc" }).success).toBe(false);
  });

  test("keeps production migration precheck read-only and branch or tag based", () => {
    expect(ReleaseProductionMigrationPrecheckDispatchSchema.safeParse({
      ref_type: "branch",
      ref: "main",
    }).success).toBe(true);
    expect(ReleaseProductionMigrationPrecheckDispatchSchema.safeParse({
      ref_type: "tag",
      ref: "v2026.07.14.1",
    }).success).toBe(true);
    expect(ReleaseProductionMigrationPrecheckDispatchSchema.safeParse({
      ref_type: "commit",
      ref: "a".repeat(40),
    }).success).toBe(false);
  });

  test("requires explicit services and the exact production deploy confirmation", () => {
    expect(ReleaseProductionCandidateDeploySchema.safeParse({
      services: ["api"],
      confirm_text: "确认部署生产环境",
      reason: "受控发布",
    }).success).toBe(true);
    expect(ReleaseProductionCandidateDeploySchema.safeParse({
      services: ["all"],
      confirm_text: "确认部署生产环境",
    }).success).toBe(false);
    expect(ReleaseProductionCandidateDeploySchema.safeParse({
      services: [],
      confirm_text: "确认部署生产环境",
    }).success).toBe(false);
    expect(ReleaseProductionCandidateDeploySchema.safeParse({
      services: ["api"],
      confirm_text: "确认发布生产",
    }).success).toBe(false);
    expect(ReleaseProductionCandidateDeploySchema.safeParse({
      services: ["api"],
      confirm_text: "确认部署生产环境",
      reason: "a".repeat(201),
    }).success).toBe(false);
  });
});
