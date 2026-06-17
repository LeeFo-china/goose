import { describe, expect, test } from "bun:test";
import {
  buildDecorationWorkflowLegacyRebuildPlan,
  parseDecorationWorkflowLegacyRebuildArgs,
} from "./decoration-workflow-legacy-rebuild";

const baseItem = {
  tenant_id: "tenant-1",
  definition_id: "legacy-definition-1",
  workflow_key: "construction_main",
  instance_id: "instance-1",
  subject_type: "project",
  subject_id: "project-1",
  subject_title: "测试项目",
  current_node_key: "designing",
  subject_status: "designing",
};

describe("parseDecorationWorkflowLegacyRebuildArgs", () => {
  test("defaults to dry-run for an explicit subject target", () => {
    expect(parseDecorationWorkflowLegacyRebuildArgs([
      "--tenant-id",
      "tenant-1",
      "--subject-type",
      "project",
      "--subject-id",
      "project-1",
      "--workflow-key",
      "project_signing",
    ])).toEqual({
      mode: "dry-run",
      tenantId: "tenant-1",
      subjectType: "project",
      subjectId: "project-1",
      workflowKey: "project_signing",
      actorEmployeeId: null,
      reason: "decoration_workflow_legacy_rebuild",
      projectStatus: null,
      deleteCompletedInstances: false,
      confirmSubjectId: null,
    });
  });

  test("requires subject confirmation before apply mode", () => {
    expect(() =>
      parseDecorationWorkflowLegacyRebuildArgs([
        "--apply",
        "--tenant-id",
        "tenant-1",
        "--subject-type",
        "project",
        "--subject-id",
        "project-1",
        "--workflow-key",
        "project_signing",
      ])
    ).toThrow("--apply 必须同时传 --confirm-rebuild <subject-id>");

    expect(() =>
      parseDecorationWorkflowLegacyRebuildArgs([
        "--apply",
        "--tenant-id",
        "tenant-1",
        "--subject-type",
        "project",
        "--subject-id",
        "project-1",
        "--workflow-key",
        "project_signing",
        "--confirm-rebuild",
        "project-2",
      ])
    ).toThrow("--confirm-rebuild 必须等于 --subject-id");
  });
});

describe("buildDecorationWorkflowLegacyRebuildPlan", () => {
  test("builds a dry-run RPC request for a project signing rebuild candidate", () => {
    const plan = buildDecorationWorkflowLegacyRebuildPlan({
      item: baseItem,
      targetDefinitionId: "target-definition-1",
      options: parseDecorationWorkflowLegacyRebuildArgs([
        "--tenant-id",
        "tenant-1",
        "--subject-type",
        "project",
        "--subject-id",
        "project-1",
        "--workflow-key",
        "project_signing",
      ]),
    });

    expect(plan).toEqual({
      ok: true,
      request: {
        tenantId: "tenant-1",
        definitionId: "target-definition-1",
        subjectType: "project",
        subjectId: "project-1",
        reason: "decoration_workflow_legacy_rebuild",
        actorEmployeeId: null,
        projectStatus: null,
        deleteCompletedInstances: false,
        dryRun: true,
        context: {
          source: "decoration_workflow_legacy_rebuild",
          legacy_definition_id: "legacy-definition-1",
          legacy_instance_id: "instance-1",
          legacy_workflow_key: "construction_main",
          legacy_current_node_key: "designing",
          legacy_subject_status: "designing",
          target_workflow_key: "project_signing",
        },
      },
    });
  });

  test("rejects legacy items that are not rebuild candidates", () => {
    const plan = buildDecorationWorkflowLegacyRebuildPlan({
      item: {
        ...baseItem,
        workflow_key: "customer_main",
        subject_type: "customer",
        current_node_key: "designing",
        subject_status: "designing",
      },
      targetDefinitionId: "target-definition-1",
      options: parseDecorationWorkflowLegacyRebuildArgs([
        "--tenant-id",
        "tenant-1",
        "--subject-type",
        "customer",
        "--subject-id",
        "project-1",
        "--workflow-key",
        "customer_main",
      ]),
    });

    expect(plan).toEqual({
      ok: false,
      reason: "classification_not_rebuild_candidate",
      classification: "compatible_runtime",
    });
  });
});
