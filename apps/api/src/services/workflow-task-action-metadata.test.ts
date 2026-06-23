import { describe, expect, test } from "bun:test";
import { PERMISSION_CODE_VALUES, PermissionCodeConfig } from "@gooes/domain";
import { ErrorCodes } from "../errors/error-codes";
import { buildWorkflowTaskActions } from "./workflow-task-action-metadata";

describe("buildWorkflowTaskActions", () => {
  test("declares procedure assignment permissions and stale action errors", () => {
    expect(PERMISSION_CODE_VALUES).toEqual(
      expect.arrayContaining([
        "project_procedure.read",
        "project_procedure.assign",
        "project_procedure.adjust",
        "project_procedure.complete",
      ]),
    );
    expect(PermissionCodeConfig["project_procedure.assign"]).toMatchObject({
      module: "project_procedure",
      label: "开始工序派工",
    });
    expect(ErrorCodes.WORKFLOW_ACTION_STALE).toBe("WORKFLOW_ACTION_STALE");
    expect(ErrorCodes.PROCEDURE_ASSIGNMENT_REQUIRED).toBe(
      "PROCEDURE_ASSIGNMENT_REQUIRED",
    );
  });

  test("builds start_following action for customer potential node", () => {
    const actions = buildWorkflowTaskActions({
      subjectType: "customer",
      nodeKey: "potential",
      nodeType: "business",
      taskTitle: "潜在客户",
    });

    expect(actions).toEqual([
      {
        key: "complete",
        label: "开始跟进",
        business_domain: "customer_status",
        business_action: "start_following",
        requires_reason: false,
        output_fields: [],
      },
      {
        key: "mark_invalid",
        label: "作废客户",
        business_domain: "customer_status",
        business_action: "mark_invalid",
        requires_reason: true,
        output_fields: [],
      },
    ]);
  });

  test("describes customer workflow task actions", () => {
    expect(buildWorkflowTaskActions({
      subjectType: "customer",
      nodeKey: "following",
      taskTitle: "跟进客户",
    })).toEqual([
      {
        key: "complete",
        label: "标记到店",
        business_domain: "customer_status",
        business_action: "mark_arrived",
        requires_reason: false,
        output_fields: [],
      },
      {
        key: "mark_invalid",
        label: "作废客户",
        business_domain: "customer_status",
        business_action: "mark_invalid",
        requires_reason: true,
        output_fields: [],
      },
    ]);

    expect(buildWorkflowTaskActions({
      subjectType: "customer",
      nodeKey: "designing",
      taskTitle: "方案设计",
    })).toEqual([
      {
        key: "complete",
        label: "方案设计",
        business_domain: null,
        business_action: null,
        requires_reason: false,
        output_fields: [],
      },
      {
        key: "mark_invalid",
        label: "作废客户",
        business_domain: "customer_status",
        business_action: "mark_invalid",
        requires_reason: true,
        output_fields: [],
      },
    ]);
  });

  test("keeps legacy customer signed node completable", () => {
    expect(buildWorkflowTaskActions({
      subjectType: "customer",
      nodeKey: "signed",
      taskTitle: "项目签约",
    })).toEqual([
      {
        key: "complete",
        label: "项目签约",
        business_domain: null,
        business_action: null,
        requires_reason: false,
        output_fields: [],
      },
    ]);
  });

  test("describes project required output fields", () => {
    expect(buildWorkflowTaskActions({
      subjectType: "project",
      nodeKey: "construction_start",
      taskTitle: "开工",
    })[0]).toMatchObject({
      key: "complete",
      label: "开工",
      business_domain: "workflow_project",
      business_action: "construction_start",
      requires_reason: false,
      output_fields: [],
    });

    expect(buildWorkflowTaskActions({
      subjectType: "project",
      nodeKey: "proposal_confirmed",
      taskTitle: "项目签约",
    })[0]).toMatchObject({
      key: "complete",
      label: "项目签约",
      business_domain: "workflow_project",
      business_action: "proposal_confirmed",
      requires_reason: false,
      output_fields: [
        {
          name: "signed_amount",
          label: "签约金额",
          type: "number",
          required: true,
        },
      ],
    });

    expect(buildWorkflowTaskActions({
      subjectType: "project",
      nodeKey: "design_finalized",
      taskTitle: "排期开工",
    })[0]?.output_fields).toEqual([
      {
        name: "start_date",
        label: "开工日期",
        type: "date",
        required: true,
      },
      {
        name: "construction_manager_employee_id",
        label: "工程负责人",
        type: "employee",
        required: true,
      },
    ]);

    expect(buildWorkflowTaskActions({
      subjectType: "project",
      nodeKey: "final_acceptance",
      taskTitle: "竣工验收",
    })[0]).toMatchObject({
      key: "complete",
      label: "竣工验收",
      business_domain: "workflow_project",
      business_action: "final_acceptance",
      requires_reason: false,
      output_fields: [],
    });
  });

  test("describes handover as a generic project workflow completion action", () => {
    expect(buildWorkflowTaskActions({
      subjectType: "project",
      nodeKey: "handover",
      nodeType: "confirmation",
      taskTitle: "交房",
    })).toEqual([
      {
        key: "complete",
        label: "交房",
        business_domain: null,
        business_action: null,
        requires_reason: false,
        output_fields: [],
      },
    ]);
  });

  test("describes payment collection gate actions", () => {
    const action = buildWorkflowTaskActions({
      subjectType: "project",
      nodeKey: "middle_payment",
      nodeType: "confirmation",
      taskTitle: "中期进度款",
      currentNodeSnapshot: {
        node_key: "middle_payment",
        business_kind: "payment_collection",
        config: {
          payment_type: "stage_2",
          requirement_mode: "any_confirmed",
        },
      },
    })[0];

    expect(action).toMatchObject({
      key: "complete",
      label: "中期进度款",
      business_domain: "payment_collection",
      business_action: "confirm_payment",
      requires_reason: false,
    });

    expect(action?.output_fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "payment_status",
          label: "中期进度款",
          type: "payment_collection",
          required: true,
          payment_type: "stage_2",
          payment_label: "中期进度款",
          requirement_mode: "any_confirmed",
        }),
        expect.objectContaining({
          name: "amount",
          label: "入账金额",
          type: "number",
          required: true,
          payment_type: "stage_2",
          payment_label: "中期进度款",
          requirement_mode: "any_confirmed",
        }),
        expect.objectContaining({
          name: "paid_at",
          label: "入账时间",
          type: "datetime",
          required: false,
        }),
        expect.objectContaining({
          name: "evidence_images",
          label: "收款凭证",
          type: "image_list",
          required: true,
          min_image_count: 1,
        }),
        expect.objectContaining({
          name: "remark",
          label: "收款备注",
          type: "string",
          required: true,
        }),
      ]),
    );
  });

  test("describes expense approval and payment actions", () => {
    expect(buildWorkflowTaskActions({
      subjectType: "expense_request",
      nodeKey: "manager_review",
      taskTitle: "经理审批",
    })).toEqual([
      {
        key: "approve",
        label: "审批通过",
        business_domain: "expense_request",
        business_action: "approve",
        requires_reason: false,
        output_fields: [
          {
            name: "comment",
            label: "审批意见",
            type: "string",
            required: false,
          },
        ],
      },
      {
        key: "reject",
        label: "审批驳回",
        business_domain: "expense_request",
        business_action: "reject",
        requires_reason: true,
        output_fields: [
          {
            name: "comment",
            label: "审批意见",
            type: "string",
            required: false,
          },
        ],
      },
    ]);

    expect(buildWorkflowTaskActions({
      subjectType: "expense_request",
      nodeKey: "payment",
      taskTitle: "登记打款",
    })[0]?.output_fields.map((field) => field.name)).toEqual([
      "payee_name",
      "payee_bank",
      "payee_account",
      "method",
      "paid_amount",
      "paid_at",
      "evidence_images",
      "remark",
    ]);
  });

  test("describes procedure node start action with assignment schedule fields", () => {
    expect(buildWorkflowTaskActions({
      subjectType: "procedure",
      nodeKey: "plumbing",
      nodeType: "procedure",
      taskTitle: "水电施工",
      currentNodeSnapshot: {
        node_key: "plumbing",
        config: {
          stage_key: "plumbing_electrical",
          require_log: true,
          min_image_count: 2,
          require_procedure_assignment: true,
          default_duration_days: 3,
          allow_duration_override: true,
        },
      },
    })).toEqual([
      {
        key: "start_procedure",
        label: "开始水电施工",
        business_domain: "project_procedure",
        business_action: "start_procedure",
        requires_reason: false,
        output_fields: expect.arrayContaining([
          expect.objectContaining({
            name: "assignee_employee_id",
            source: "procedure_candidate",
            stage_code: "plumbing_electrical",
          }),
          expect.objectContaining({
            name: "planned_start_date",
            type: "date",
          }),
          expect.objectContaining({
            name: "planned_duration_days",
            default_value: 3,
          }),
        ]),
      },
    ]);
  });

  test("describes procedure completion action when assignment is disabled", () => {
    expect(buildWorkflowTaskActions({
      subjectType: "procedure",
      nodeKey: "plumbing",
      nodeType: "procedure",
      taskTitle: "水电施工",
      currentNodeSnapshot: {
        node_key: "plumbing",
        config: {
          stage_key: "plumbing_electrical",
          require_procedure_assignment: false,
        },
      },
    })).toEqual([
      {
        key: "complete_procedure",
        label: "水电施工",
        business_domain: "project_procedure",
        business_action: "complete_procedure",
        requires_reason: false,
        output_fields: [],
      },
    ]);
  });

  test("does not expose generic complete action for procedure nodes that require manual acceptance", () => {
    expect(buildWorkflowTaskActions({
      subjectType: "procedure",
      nodeKey: "plumbing",
      nodeType: "procedure",
      taskTitle: "水电施工",
      currentNodeSnapshot: {
        node_key: "plumbing",
        config: {
          stage_key: "plumbing_electrical",
          require_procedure_assignment: false,
          require_log: true,
          trigger_acceptance: true,
          min_image_count: 2,
        },
      },
    })).toEqual([]);
  });
});
