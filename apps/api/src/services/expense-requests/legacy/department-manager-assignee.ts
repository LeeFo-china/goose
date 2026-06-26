import { Errors } from "@/errors/error-factory";
import { expenseRequestRepository } from "@/repositories/expense-requests";

export async function resolveApplicantDepartmentManagerAssignee(
  applicantEmployeeId: string,
  tenantId?: string | null,
) {
  const resolution =
    await expenseRequestRepository.findApplicantDepartmentApprovalAssignee({
      applicantEmployeeId,
      tenantId,
      permissionCode: "expense_request.approve_manager",
    });

  if (!resolution?.applicant_exists) {
    throw Errors.badRequest("申请人不存在或不可用");
  }

  if (!resolution.applicant_tenant_department_id) {
    throw Errors.badRequest("申请人未配置所属部门，无法解析部门经理");
  }

  if (!resolution.permission_assignee_employee_id) {
    throw Errors.badRequest("申请人所属部门未配置具备费用经理审批权限的员工");
  }

  return resolution.permission_assignee_employee_id;
}
