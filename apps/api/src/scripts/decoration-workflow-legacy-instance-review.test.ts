import { describe, expect, test } from "bun:test";
import {
  buildDecorationWorkflowLegacyInstanceReviewReport,
  classifyDecorationWorkflowLegacyInstance,
  parseDecorationWorkflowLegacyInstanceReviewArgs,
  resolveDecorationWorkflowLegacyInstanceReviewDatabaseUrl,
} from "./decoration-workflow-legacy-instance-review";

const baseInstance = {
  tenant_id: "tenant-1",
  definition_id: "definition-1",
  instance_id: "instance-1",
  subject_id: "subject-1",
  subject_title: "测试对象",
};

describe("classifyDecorationWorkflowLegacyInstance", () => {
  test("keeps legacy customer snapshots on compatible runtime actions", () => {
    const result = classifyDecorationWorkflowLegacyInstance({
      ...baseInstance,
      workflow_key: "customer_main",
      subject_type: "customer",
      current_node_key: "signed",
      subject_status: "signed",
    });

    expect(result).toEqual({
      classification: "compatible_runtime",
      recommended_action: "continue_current_task",
      recommended_workflow_key: "customer_main",
      reason: "旧客户流程节点已有运行时兼容，可继续完成当前待办。",
    });
  });

  test("requires manual review when a running customer instance points to an invalid customer", () => {
    const result = classifyDecorationWorkflowLegacyInstance({
      ...baseInstance,
      workflow_key: "customer_main",
      subject_type: "customer",
      current_node_key: "potential",
      subject_status: "invalid",
    });

    expect(result).toEqual({
      classification: "manual_restore_required",
      recommended_action: "confirm_customer_status_before_continue",
      recommended_workflow_key: null,
      reason: "客户已是关闭状态但旧流程仍在运行，需人工确认是否取消或恢复实例。",
    });
  });

  test("routes project signing nodes from legacy construction snapshots to project_signing rebuild", () => {
    const result = classifyDecorationWorkflowLegacyInstance({
      ...baseInstance,
      workflow_key: "construction_main",
      subject_type: "project",
      current_node_key: "designing",
      subject_status: "designing",
    });

    expect(result).toEqual({
      classification: "rebuild_candidate",
      recommended_action: "dry_run_then_rebuild_project_signing",
      recommended_workflow_key: "project_signing",
      reason: "旧项目实例处于签约阶段节点，应先 dry-run，再受控重建到 project_signing。",
    });
  });

  test("requires a manual restore point for late-stage project legacy snapshots", () => {
    const result = classifyDecorationWorkflowLegacyInstance({
      ...baseInstance,
      workflow_key: "construction_main",
      subject_type: "project",
      current_node_key: "acceptance",
      subject_status: "acceptance",
    });

    expect(result).toEqual({
      classification: "manual_restore_required",
      recommended_action: "define_restore_point_before_rebuild",
      recommended_workflow_key: null,
      reason: "旧项目实例已进入施工后段，不能直接重建到新流程起点。",
    });
  });
});

describe("buildDecorationWorkflowLegacyInstanceReviewReport", () => {
  test("summarizes review classifications and highlights required actions", () => {
    const report = buildDecorationWorkflowLegacyInstanceReviewReport({
      generatedAt: "2026-06-17T00:00:00.000Z",
      items: [
        {
          ...baseInstance,
          workflow_key: "customer_main",
          subject_type: "customer",
          current_node_key: "designing",
          subject_status: "designing",
        },
        {
          ...baseInstance,
          instance_id: "instance-2",
          workflow_key: "construction_main",
          subject_type: "project",
          current_node_key: "designing",
          subject_status: "designing",
        },
        {
          ...baseInstance,
          instance_id: "instance-3",
          workflow_key: "construction_main",
          subject_type: "project",
          current_node_key: "acceptance",
          subject_status: "acceptance",
        },
      ],
    });

    expect(report).toMatchObject({
      generated_at: "2026-06-17T00:00:00.000Z",
      ok: true,
      sample_size: 3,
      needs_rebuild: true,
      needs_manual_restore: true,
      has_unknown_review_required: false,
      totals: {
        compatible_runtime: 1,
        rebuild_candidate: 1,
        manual_restore_required: 1,
        unknown_review_required: 0,
      },
    });
  });

  test("adds guarded shell commands only for controllable legacy actions", () => {
    const report = buildDecorationWorkflowLegacyInstanceReviewReport({
      generatedAt: "2026-06-17T00:00:00.000Z",
      items: [
        {
          ...baseInstance,
          tenant_id: "tenant-1",
          instance_id: "project-instance-1",
          subject_id: "project-1",
          workflow_key: "construction_main",
          subject_type: "project",
          current_node_key: "designing",
          subject_status: "designing",
        },
        {
          ...baseInstance,
          tenant_id: "tenant-1",
          instance_id: "customer-instance-1",
          subject_id: "customer-1",
          workflow_key: "customer_main",
          subject_type: "customer",
          current_node_key: "potential",
          subject_status: "invalid",
        },
        {
          ...baseInstance,
          tenant_id: "tenant-1",
          instance_id: "late-project-instance-1",
          subject_id: "project-2",
          workflow_key: "construction_main",
          subject_type: "project",
          current_node_key: "acceptance",
          subject_status: "acceptance",
        },
      ],
    });

    expect(report.items[0]?.action_commands).toEqual({
      dry_run:
        "bun --env-file=.env.local apps/api/src/scripts/decoration-workflow-legacy-rebuild.ts --tenant-id tenant-1 --subject-type project --subject-id project-1 --workflow-key project_signing",
      apply:
        "bun --env-file=.env.local apps/api/src/scripts/decoration-workflow-legacy-rebuild.ts --apply --confirm-rebuild project-1 --tenant-id tenant-1 --subject-type project --subject-id project-1 --workflow-key project_signing",
      note: "先执行 dry-run，业务确认后才允许执行 apply。",
    });
    expect(report.items[1]?.action_commands).toEqual({
      dry_run:
        "bun --env-file=.env.local apps/api/src/scripts/decoration-workflow-legacy-cancel.ts --tenant-id tenant-1 --instance-id customer-instance-1",
      apply:
        "bun --env-file=.env.local apps/api/src/scripts/decoration-workflow-legacy-cancel.ts --apply --confirm-cancel customer-instance-1 --tenant-id tenant-1 --instance-id customer-instance-1",
      note: "仅用于客户已关闭但旧流程仍 running 的实例，业务确认后才允许执行 apply。",
    });
    expect(report.items[2]?.action_commands).toEqual({
      dry_run: null,
      apply: null,
      note: "需先定义人工恢复点或取消方案，不生成自动处置命令。",
    });
  });
});

describe("parseDecorationWorkflowLegacyInstanceReviewArgs", () => {
  test("parses sample limit", () => {
    expect(parseDecorationWorkflowLegacyInstanceReviewArgs([
      "--sample-limit",
      "25",
    ])).toEqual({ sampleLimit: 25 });
  });

  test("rejects unsupported arguments", () => {
    expect(() =>
      parseDecorationWorkflowLegacyInstanceReviewArgs(["--unknown"])
    ).toThrow(/Unsupported argument/);
  });
});

describe("resolveDecorationWorkflowLegacyInstanceReviewDatabaseUrl", () => {
  test("prefers direct database url before pooled url", () => {
    expect(resolveDecorationWorkflowLegacyInstanceReviewDatabaseUrl({
      SUPABASE_DB_DIRECT_URL: "postgres://direct",
      SUPABASE_DB_URL: "postgres://pooled",
    })).toBe("postgres://direct");
  });
});
