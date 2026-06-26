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
    expect(assigneeSource).toContain("自动匹配申请人所属部门中具备经理审批权限的员工");
    expect(assigneeSource).toContain("部门审批对象暂未接入待办分配");
  });

  test("explains department manager as an optional approval preference", () => {
    const departmentSource = readFileSync(
      new URL("../organization/department-dialog.tsx", import.meta.url),
      "utf8",
    );
    const assigneeSource = readFileSync(
      new URL("./workflow-approval-assignee-select.tsx", import.meta.url),
      "utf8",
    );

    expect(departmentSource).toContain("部门负责人为组织管理字段");
    expect(departmentSource).toContain("优先使用具备审批权限的部门负责人");
    expect(departmentSource).toContain("本部门具备费用经理审批权限的员工");
    expect(assigneeSource).toContain("如部门负责人也具备该权限，会优先派给部门负责人");
  });
});
