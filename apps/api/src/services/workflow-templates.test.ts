import { describe, expect, spyOn, test } from "bun:test";
import type { AuthContext } from "./authorization";
import { WORKFLOW_TEMPLATE_SUBJECT_TYPES } from "./workflow-template-definition";
import { workflowTemplateService } from "./workflow-templates";
import { workflowService } from "./workflows";

const authContext: AuthContext = {
  authUserId: "auth-user-1",
  employeeId: "employee-1",
  tenantId: "tenant-1",
  tenantName: "测试租户",
  tenantSlug: "test-tenant",
  tenantStatus: "active",
  isPlatformAdmin: false,
  employeeName: "测试管理员",
  employeeStatus: "active",
  departmentId: null,
  tenantDepartmentId: null,
  departmentCode: null,
  departmentName: null,
  postId: null,
  postName: null,
  avatar: null,
  roleCodes: [],
  roles: [],
  permissions: [],
};

describe("workflowTemplateService template subjects", () => {
  test("assigns an exact subject to every existing template key", () => {
    expect(WORKFLOW_TEMPLATE_SUBJECT_TYPES).toEqual({
      customer_main: "customer",
      sales_main: "customer",
      project_signing: "project",
      construction_main: "project",
      procedure_standard: "procedure",
      expense_approval: "expense_request",
      supplier_purchase_batch_approval: "supplier_purchase_batch",
    });
  });

  test("returns immutable templates with their exact workflow subjects", () => {
    for (const [templateKey, subjectType] of [
      ["customer_main", "customer"],
      ["project_signing", "project"],
      ["construction_main", "project"],
      ["expense_approval", "expense_request"],
      ["supplier_purchase_batch_approval", "supplier_purchase_batch"],
    ] as const) {
      const template = workflowTemplateService.getTemplateForTest({
        template_key: templateKey,
      });
      expect(template.subject_type).toBe(subjectType);
      expect(Object.isFrozen(template)).toBe(true);
      expect(Object.isFrozen(template.graph)).toBe(true);
      expect(Object.isFrozen(template.graph.nodes)).toBe(true);
      expect(Object.isFrozen(template.graph.nodes[0])).toBe(true);
    }

    const supplierTemplate = workflowTemplateService.getTemplateForTest({
      template_key: "supplier_purchase_batch_approval",
    });
    const approvalConfig = supplierTemplate.graph.nodes[1]?.config;
    expect(Object.isFrozen(approvalConfig)).toBe(true);
    expect(
      approvalConfig && "actions" in approvalConfig
        ? Object.isFrozen(approvalConfig.actions)
        : false,
    ).toBe(true);
  });

  test("passes only the trusted template subject into publication metadata", async () => {
    const definition = {
      id: "definition-1",
      tenant_id: "tenant-1",
      workflow_key: "supplier_purchase_batch_approval",
      name: "采购批次审批",
      description: null,
      category: "approval",
      status: "draft",
      active_version_id: null,
      created_by: "employee-1",
      updated_by: "employee-1",
      created_at: "2026-08-30T00:00:00.000Z",
      updated_at: "2026-08-30T00:00:00.000Z",
    } satisfies Awaited<ReturnType<typeof workflowService.createDefinition>>;
    const createDefinition = spyOn(workflowService, "createDefinition")
      .mockResolvedValue(definition);
    const saveDraftGraph = spyOn(workflowService, "saveDraftGraph")
      .mockResolvedValue(undefined as unknown as Awaited<
        ReturnType<typeof workflowService.saveDraftGraph>
      >);
    const publishDefinition = spyOn(workflowService, "publishDefinition")
      .mockResolvedValue(undefined as unknown as Awaited<
        ReturnType<typeof workflowService.publishDefinition>
      >);

    try {
      await workflowTemplateService.createFromTemplate(authContext, {
        template_key: "supplier_purchase_batch_approval",
      });
      expect(publishDefinition).toHaveBeenCalledWith(
        authContext,
        "definition-1",
        {},
        { subjectType: "supplier_purchase_batch" },
      );
    } finally {
      createDefinition.mockRestore();
      saveDraftGraph.mockRestore();
      publishDefinition.mockRestore();
    }
  });

  test("exposes deep readonly template graph types", () => {
    const template = workflowTemplateService.getTemplateForTest({
      template_key: "supplier_purchase_batch_approval",
    });
    if (false) {
      // @ts-expect-error template DTO properties are readonly
      template.subject_type = "customer";
      // @ts-expect-error template node collections are readonly
      template.graph.nodes.push(template.graph.nodes[0]);
      // @ts-expect-error nested permission collections are readonly
      template.graph.nodes[1]?.config.required_permissions.push("workflow.manage");
    }
    expect(template.subject_type).toBe("supplier_purchase_batch");
  });
});

describe("workflowTemplateService customer_main", () => {
  test("creates customer design workflow without project signing nodes", () => {
    const template = workflowTemplateService.getTemplateForTest({
      template_key: "customer_main",
    });

    expect(template.graph.nodes.map((node) => node.node_key)).toEqual([
      "start",
      "potential",
      "following",
      "arrived",
      "designing",
      "end",
    ]);
    expect(template.graph.edges.map((edge) => [
      edge.source_node_key,
      edge.target_node_key,
      edge.label,
    ])).toContainEqual(["potential", "following", "开始跟进"]);
  });
});

describe("workflowTemplateService project_signing", () => {
  test("creates project signing workflow from design to scheduled start", () => {
    const template = workflowTemplateService.getTemplateForTest({
      template_key: "project_signing",
    });

    expect(template.workflow_key).toBe("project_signing");
    expect(template.category).toBe("signing");
    expect(template.graph.nodes.map((node) => node.node_key)).toEqual([
      "start",
      "designing",
      "proposal_confirmed",
      "signed",
      "design_finalized",
      "pending_start",
      "end",
    ]);
    expect(template.graph.edges.map((edge) => [
      edge.source_node_key,
      edge.target_node_key,
    ])).toEqual([
      ["start", "designing"],
      ["designing", "proposal_confirmed"],
      ["proposal_confirmed", "signed"],
      ["signed", "design_finalized"],
      ["design_finalized", "pending_start"],
      ["pending_start", "end"],
    ]);
  });
});

describe("workflowTemplateService construction_main", () => {
  test("creates construction workflow with procedure and payment gates only", () => {
    const template = workflowTemplateService.getTemplateForTest({
      template_key: "construction_main",
    });

    expect(template.graph.nodes.map((node) => node.node_key)).toEqual([
      "start",
      "started",
      "procedure_demolition",
      "procedure_plumbing_electrical",
      "payment_stage_2",
      "procedure_tiling",
      "procedure_woodwork",
      "payment_stage_3",
      "procedure_painting",
      "procedure_installation",
      "final_acceptance",
      "handover",
      "end",
    ]);
    expect(template.graph.nodes.map((node) => node.node_key)).not.toContain("on_hold");
    expect(template.graph.nodes.map((node) => node.node_key)).not.toContain("invalid");
    expect(
      template.graph.nodes.find((node) => node.node_key === "payment_stage_2"),
    ).toMatchObject({
      node_type: "confirmation",
      business_kind: "payment_collection",
      config: {
        payment_type: "stage_2",
        required_permissions: ["finance.payment.confirm"],
      },
    });
    expect(
      template.graph.nodes.find((node) => node.node_key === "payment_stage_3"),
    ).toMatchObject({
      title: "工程尾款",
      node_type: "confirmation",
      business_kind: "payment_collection",
      config: {
        payment_type: "stage_3",
        required_permissions: ["finance.payment.confirm"],
      },
    });
    expect(template.graph.edges.map((edge) => [
      edge.source_node_key,
      edge.target_node_key,
      edge.label,
    ])).toContainEqual(["procedure_woodwork", "payment_stage_3", "工程尾款"]);
    expect(
      template.graph.nodes.find((node) => node.node_key === "procedure_woodwork"),
    ).toMatchObject({
      node_type: "procedure",
      business_kind: "procedure_template",
      config: {
        stage_key: "woodwork",
      },
    });
  });
});

describe("workflowTemplateService expense_approval", () => {
  test("uses applicant department manager for manager review", () => {
    const template = workflowTemplateService.getTemplateForTest({
      template_key: "expense_approval",
    });

    expect(
      template.graph.nodes.find((node) => node.node_key === "manager_review"),
    ).toMatchObject({
      title: "经理审批",
      node_type: "approval",
      business_kind: "expense_approval",
      config: {
        approval_type: "expense_approval",
        assignee_rule: "applicant_department_manager",
        required_permissions: ["expense_request.approve_manager"],
      },
    });
    expect(
      template.graph.nodes.find((node) => node.node_key === "finance_review"),
    ).toMatchObject({
      title: "财务审批",
      config: {
        assignee_rule: "role",
        assignee_id: "finance_base",
        assignee_permission_code: "expense_request.approve_finance",
        required_permissions: ["expense_request.approve_finance"],
      },
    });
    expect(
      template.graph.nodes.find((node) => node.node_key === "payment"),
    ).toMatchObject({
      title: "出纳打款",
      config: {
        assignee_permission_code: "expense_request.pay",
        required_permissions: ["expense_request.pay"],
      },
    });
    expect(
      template.graph.nodes.find((node) => node.node_key === "payment")?.config,
    ).not.toMatchObject({
      assignee_rule: "role",
      assignee_id: "finance_base",
    });
    expect(
      template.graph.nodes.find((node) => node.node_key === "rejected"),
    ).toMatchObject({
      title: "已驳回",
      node_type: "end",
      description: "费用审批驳回后流程结束，申请人可修改后重新提交。",
    });
    expect(template.graph.edges).not.toContainEqual(
      expect.objectContaining({
        source_node_key: "rejected",
        target_node_key: "start",
      }),
    );
  });
});

describe("workflowTemplateService supplier_purchase_batch_approval", () => {
  test("returns the complete immutable purchase and conditional finance graph", () => {
    const template = workflowTemplateService.getTemplateForTest({
      template_key: "supplier_purchase_batch_approval",
    });

    expect(template).toEqual({
      workflow_key: "supplier_purchase_batch_approval",
      subject_type: "supplier_purchase_batch",
      name: "采购批次审批",
      description: "采购负责人先审批采购批次，超预算时再由财务审批。",
      category: "approval",
      graph: {
        nodes: [
          {
            node_key: "start",
            node_type: "start",
            business_kind: null,
            title: "开始",
            description: "采购批次提交审批。",
            position: { x: 80, y: 200 },
            config: { required_permissions: [] },
            sort_order: 10,
          },
          {
            node_key: "purchase_review",
            node_type: "approval",
            business_kind: null,
            title: "采购审批",
            description: "采购负责人审核采购批次。",
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
          },
          {
            node_key: "finance_review",
            node_type: "approval",
            business_kind: null,
            title: "财务审批",
            description: "财务负责人审核超预算采购批次。",
            position: { x: 600, y: 340 },
            config: {
              required_permissions: ["finance.budget.manage"],
              approval_type: "workflow_approval",
              assignee_rule: "role",
              assignee_permission_code: "finance.budget.manage",
              approve_mode: "any",
              actions: ["approve", "reject"],
            },
            sort_order: 30,
          },
          {
            node_key: "approved_end",
            node_type: "end",
            business_kind: null,
            title: "审批通过",
            description: "采购批次审批通过。",
            position: { x: 880, y: 160 },
            config: { required_permissions: [] },
            sort_order: 40,
          },
          {
            node_key: "rejected_end",
            node_type: "end",
            business_kind: null,
            title: "审批驳回",
            description: "采购批次审批驳回，申请人可修改后重新提交。",
            position: { x: 600, y: 500 },
            config: { required_permissions: [] },
            sort_order: 50,
          },
        ],
        edges: [
          {
            source_node_key: "start",
            target_node_key: "purchase_review",
            label: "提交审批",
            condition: { operator: "always" },
            priority: 10,
          },
          {
            source_node_key: "purchase_review",
            target_node_key: "rejected_end",
            label: "采购驳回",
            condition: {
              operator: "eq",
              field: "decision",
              value: "rejected",
            },
            priority: 10,
          },
          {
            source_node_key: "purchase_review",
            target_node_key: "approved_end",
            label: "采购通过",
            condition: {
              operator: "neq",
              field: "budget_status",
              value: "over_budget",
            },
            priority: 20,
          },
          {
            source_node_key: "purchase_review",
            target_node_key: "finance_review",
            label: "超预算复核",
            condition: {
              operator: "eq",
              field: "budget_status",
              value: "over_budget",
            },
            priority: 30,
          },
          {
            source_node_key: "finance_review",
            target_node_key: "approved_end",
            label: "财务通过",
            condition: {
              operator: "eq",
              field: "decision",
              value: "approved",
            },
            priority: 10,
          },
          {
            source_node_key: "finance_review",
            target_node_key: "rejected_end",
            label: "财务驳回",
            condition: {
              operator: "eq",
              field: "decision",
              value: "rejected",
            },
            priority: 20,
          },
        ],
      },
    });

    const approvalNodes = template.graph.nodes.filter(
      (node) => node.node_type === "approval",
    );
    expect(approvalNodes).toHaveLength(2);
    expect(template.graph.edges.filter((edge) =>
      approvalNodes.some((node) => node.node_key === edge.source_node_key)
    ).map((edge) => edge.condition.value)).toEqual([
      "rejected",
      "over_budget",
      "over_budget",
      "approved",
      "rejected",
    ]);
  });
});
