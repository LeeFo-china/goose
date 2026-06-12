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
      business_domain: "project_status",
      business_action: "sign_contract",
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
});
