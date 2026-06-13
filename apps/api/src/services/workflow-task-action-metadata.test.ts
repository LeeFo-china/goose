import { describe, expect, test } from "bun:test";
import { buildWorkflowTaskActions } from "./workflow-task-action-metadata";

describe("buildWorkflowTaskActions", () => {
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
  });

  test("describes project required output fields", () => {
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
  });

  test("describes payment collection gate actions", () => {
    expect(buildWorkflowTaskActions({
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
    })).toEqual([
      {
        key: "complete",
        label: "中期进度款",
        business_domain: "payment_collection",
        business_action: "confirm_payment",
        requires_reason: false,
        output_fields: [
          {
            name: "payment_status",
            label: "中期进度款",
            type: "payment_collection",
            required: true,
            payment_type: "stage_2",
            payment_label: "中期进度款",
            requirement_mode: "any_confirmed",
          },
        ],
      },
    ]);
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

  test("describes procedure node construction log requirements", () => {
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
        },
      },
    })).toEqual([
      {
        key: "complete",
        label: "水电施工",
        business_domain: null,
        business_action: null,
        requires_reason: false,
        output_fields: [
          {
            name: "project_log_id",
            label: "施工日志",
            type: "project_log",
            required: true,
            stage_code: "plumbing_electrical",
            min_image_count: 2,
          },
        ],
      },
    ]);
  });
});
