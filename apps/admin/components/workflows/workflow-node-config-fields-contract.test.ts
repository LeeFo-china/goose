import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

describe("workflow node config contract labels", () => {
  test("shows procedure and payment node attributes required by runtime contract", () => {
    const procedureSource = readFileSync(
      new URL("./workflow-procedure-config-fields.tsx", import.meta.url),
      "utf8",
    );
    const paymentSource = readFileSync(
      new URL("./workflow-payment-collection-config-fields.tsx", import.meta.url),
      "utf8",
    );

    expect(procedureSource).toContain("require_log");
    expect(procedureSource).toContain("min_image_count");
    expect(procedureSource).toContain("acceptance_enabled");
    expect(procedureSource).toContain("require_procedure_assignment");
    expect(procedureSource).toContain("default_duration_days");
    expect(procedureSource).toContain("allow_duration_override");
    expect(procedureSource).toContain("candidate_department_codes");
    expect(readFileSync(
      new URL("./workflow-node-config-fields.tsx", import.meta.url),
      "utf8",
    )).toContain("final_acceptance_report_enabled");
    expect(paymentSource).toContain("收款要求");
    expect(paymentSource).toContain("金额/比例规则");
    expect(paymentSource).toContain("财务负责人");
  });

  test("uses searchable approval assignee selectors instead of raw code input", () => {
    const configSource = readFileSync(
      new URL("./workflow-node-config-fields.tsx", import.meta.url),
      "utf8",
    );
    const assigneeSource = readFileSync(
      new URL("./workflow-approval-assignee-select.tsx", import.meta.url),
      "utf8",
    );

    expect(configSource).toContain("WorkflowApprovalAssigneeSelect");
    expect(configSource).not.toContain("员工 ID、部门 ID 或角色编码");
    expect(assigneeSource).toContain("搜索员工姓名或手机号");
    expect(assigneeSource).toContain("搜索角色名称或编码");
    expect(configSource).toContain("申请人部门经理");
    expect(assigneeSource).toContain("提交后自动派给申请人所属部门的经理");
    expect(assigneeSource).toContain("部门审批对象暂未接入待办分配");
  });
});
