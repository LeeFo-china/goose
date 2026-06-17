import { describe, expect, test } from "bun:test";
import {
  buildDecorationWorkflowLegacyCancelPlan,
  parseDecorationWorkflowLegacyCancelArgs,
} from "./decoration-workflow-legacy-cancel";

const closedCustomerItem = {
  tenant_id: "tenant-1",
  definition_id: "definition-1",
  workflow_key: "customer_main",
  instance_id: "instance-1",
  subject_type: "customer",
  subject_id: "customer-1",
  subject_title: "关闭客户",
  current_node_key: "potential",
  subject_status: "invalid",
};

describe("parseDecorationWorkflowLegacyCancelArgs", () => {
  test("defaults to dry-run for an explicit instance target", () => {
    expect(parseDecorationWorkflowLegacyCancelArgs([
      "--tenant-id",
      "tenant-1",
      "--instance-id",
      "instance-1",
    ])).toEqual({
      mode: "dry-run",
      tenantId: "tenant-1",
      instanceId: "instance-1",
      actorEmployeeId: null,
      reason: "decoration_workflow_legacy_cancel",
      confirmInstanceId: null,
    });
  });

  test("requires instance confirmation before apply mode", () => {
    expect(() =>
      parseDecorationWorkflowLegacyCancelArgs([
        "--apply",
        "--tenant-id",
        "tenant-1",
        "--instance-id",
        "instance-1",
      ])
    ).toThrow("--apply 必须同时传 --confirm-cancel <instance-id>");

    expect(() =>
      parseDecorationWorkflowLegacyCancelArgs([
        "--apply",
        "--tenant-id",
        "tenant-1",
        "--instance-id",
        "instance-1",
        "--confirm-cancel",
        "instance-2",
      ])
    ).toThrow("--confirm-cancel 必须等于 --instance-id");
  });
});

describe("buildDecorationWorkflowLegacyCancelPlan", () => {
  test("builds a dry-run cancel request for a closed customer legacy instance", () => {
    const plan = buildDecorationWorkflowLegacyCancelPlan({
      item: closedCustomerItem,
      options: parseDecorationWorkflowLegacyCancelArgs([
        "--tenant-id",
        "tenant-1",
        "--instance-id",
        "instance-1",
      ]),
    });

    expect(plan).toEqual({
      ok: true,
      request: {
        tenantId: "tenant-1",
        definitionId: "definition-1",
        instanceId: "instance-1",
        reason: "decoration_workflow_legacy_cancel",
        actorEmployeeId: null,
        dryRun: true,
        context: {
          source: "decoration_workflow_legacy_cancel",
          legacy_workflow_key: "customer_main",
          legacy_current_node_key: "potential",
          legacy_subject_type: "customer",
          legacy_subject_id: "customer-1",
          legacy_subject_status: "invalid",
        },
      },
    });
  });

  test("rejects compatible customer instances", () => {
    const plan = buildDecorationWorkflowLegacyCancelPlan({
      item: {
        ...closedCustomerItem,
        subject_status: "designing",
        current_node_key: "designing",
      },
      options: parseDecorationWorkflowLegacyCancelArgs([
        "--tenant-id",
        "tenant-1",
        "--instance-id",
        "instance-1",
      ]),
    });

    expect(plan).toEqual({
      ok: false,
      reason: "action_not_cancelable",
      classification: "compatible_runtime",
      recommendedAction: "continue_current_task",
    });
  });

  test("rejects late-stage project instances", () => {
    const plan = buildDecorationWorkflowLegacyCancelPlan({
      item: {
        ...closedCustomerItem,
        workflow_key: "construction_main",
        subject_type: "project",
        subject_id: "project-1",
        current_node_key: "acceptance",
        subject_status: "acceptance",
      },
      options: parseDecorationWorkflowLegacyCancelArgs([
        "--tenant-id",
        "tenant-1",
        "--instance-id",
        "instance-1",
      ]),
    });

    expect(plan).toEqual({
      ok: false,
      reason: "action_not_cancelable",
      classification: "manual_restore_required",
      recommendedAction: "define_restore_point_before_rebuild",
    });
  });
});
