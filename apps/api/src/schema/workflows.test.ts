import { describe, expect, test } from "bun:test";
import {
  WorkflowGraphSaveSchema,
  WorkflowRuntimeRebuildSchema,
  WorkflowTemplateCreateSchema,
} from "./workflows";

describe("WorkflowTemplateCreateSchema", () => {
  test("accepts every supported template key", () => {
    for (const templateKey of [
      "customer_main",
      "sales_main",
      "project_signing",
      "construction_main",
      "procedure_standard",
      "expense_approval",
      "supplier_purchase_batch_approval",
    ] as const) {
      expect(WorkflowTemplateCreateSchema.parse({ template_key: templateKey }))
        .toEqual({ template_key: templateKey });
    }
  });

  test("rejects unknown top-level template fields", () => {
    expect(WorkflowTemplateCreateSchema.safeParse({
      template_key: "customer_main",
      subject_type: "supplier_purchase_batch",
    }).success).toBe(false);
  });

  test("accepts the supplier purchase batch approval template", () => {
    expect(WorkflowTemplateCreateSchema.parse({
      template_key: "supplier_purchase_batch_approval",
    })).toEqual({
      template_key: "supplier_purchase_batch_approval",
    });
  });
});

describe("WorkflowGraphSaveSchema", () => {
  test("accepts explicit approve and reject actions on approval nodes", () => {
    const result = WorkflowGraphSaveSchema.safeParse({
      nodes: [{
        node_key: "purchase_review",
        node_type: "approval",
        business_kind: null,
        title: "采购审批",
        position: { x: 320, y: 200 },
        config: {
          required_permissions: ["supplier.purchase-requisition.approve"],
          approval_type: "workflow_approval",
          assignee_rule: "role",
          assignee_permission_code: "supplier.purchase-requisition.approve",
          approve_mode: "any",
          actions: ["approve", "reject"],
        },
        sort_order: 20,
      }],
      edges: [],
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.nodes[0]?.config).toMatchObject({
      actions: ["approve", "reject"],
    });
  });

  test("accepts admin construction stage node config", () => {
    const result = WorkflowGraphSaveSchema.safeParse({
      nodes: [
        {
          node_key: "construction_start",
          node_type: "construction_stage",
          business_kind: "construction_start",
          title: "开工",
          description: null,
          position: { x: 100, y: 100 },
          config: {
            required_permissions: [],
            stage_type: "construction_start",
          },
          sort_order: 20,
        },
      ],
      edges: [],
    });

    expect(result.success).toBe(true);
  });

  test("accepts final acceptance report switch config", () => {
    const result = WorkflowGraphSaveSchema.safeParse({
      nodes: [
        {
          node_key: "final_acceptance",
          node_type: "construction_stage",
          business_kind: "final_acceptance",
          title: "竣工验收",
          description: null,
          position: { x: 100, y: 100 },
          config: {
            required_permissions: ["project.update"],
            stage_type: "final_acceptance",
            final_acceptance_report_enabled: true,
          },
          sort_order: 110,
        },
      ],
      edges: [],
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.nodes[0]?.config).toMatchObject({
      stage_type: "final_acceptance",
      final_acceptance_report_enabled: true,
    });
  });

  test("accepts admin payment collection node config", () => {
    const result = WorkflowGraphSaveSchema.safeParse({
      nodes: [
        {
          node_key: "middle_payment",
          node_type: "confirmation",
          business_kind: "payment_collection",
          title: "中期收款",
          description: null,
          position: { x: 100, y: 100 },
          config: {
            required_permissions: [],
            timeout_hours: null,
            rollback_target_key: null,
            finance_type: "payment_collection",
            payment_type: "stage_2",
            requirement_mode: "any_confirmed",
            required_percentage: null,
            block_message: null,
            finance_reviewer_employee_id: null,
          },
          sort_order: 110,
        },
      ],
      edges: [],
    });

    expect(result.success).toBe(true);
  });

  test("accepts applicant department manager approval assignee rule", () => {
    const result = WorkflowGraphSaveSchema.safeParse({
      nodes: [
        {
          node_key: "manager_review",
          node_type: "approval",
          business_kind: "expense_approval",
          title: "部门经理审批",
          description: null,
          position: { x: 100, y: 100 },
          config: {
            required_permissions: ["expense_request.approve_manager"],
            approval_type: "expense_approval",
            assignee_rule: "applicant_department_manager",
            assignee_id: null,
            approve_mode: "any",
          },
          sort_order: 30,
        },
      ],
      edges: [],
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.nodes[0]?.config).toMatchObject({
      assignee_rule: "applicant_department_manager",
      assignee_id: null,
    });
  });

  test("keeps payment collection receivable plan config", () => {
    const result = WorkflowGraphSaveSchema.safeParse({
      nodes: [
        {
          node_key: "middle_payment",
          node_type: "confirmation",
          business_kind: "payment_collection",
          title: "中期收款",
          description: null,
          position: { x: 100, y: 100 },
          config: {
            required_permissions: ["finance.payment.confirm"],
            finance_type: "payment_collection",
            payment_type: "stage_2",
            requirement_mode: "any_confirmed",
            receivable_plan_enabled: true,
            receivable_amount_mode: "signed_amount_percentage",
            receivable_fixed_amount: null,
            receivable_percentage: 30,
            receivable_due_offset_days: 3,
            receivable_due_date_rule: "node_entered_at",
            receivable_title: "中期进度款",
          },
          sort_order: 110,
        },
      ],
      edges: [],
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.nodes[0]?.config).toMatchObject({
      receivable_plan_enabled: true,
      receivable_amount_mode: "signed_amount_percentage",
      receivable_percentage: 30,
      receivable_due_offset_days: 3,
      receivable_due_date_rule: "node_entered_at",
      receivable_title: "中期进度款",
    });
  });
});

describe("WorkflowRuntimeRebuildSchema", () => {
  test("requires an operator reason and accepts project status correction", () => {
    expect(WorkflowRuntimeRebuildSchema.safeParse({
      subject_id: "project-1",
      reason: "",
      project_status: "started",
    }).success).toBe(false);

    const result = WorkflowRuntimeRebuildSchema.safeParse({
      subject_id: "project-1",
      reason: "流程图发布后按当前版本重建",
      project_status: "started",
      delete_completed_instances: true,
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toEqual({
      subject_type: "manual",
      subject_id: "project-1",
      reason: "流程图发布后按当前版本重建",
      project_status: "started",
      delete_completed_instances: true,
      context: {},
      dry_run: false,
    });
  });
});
