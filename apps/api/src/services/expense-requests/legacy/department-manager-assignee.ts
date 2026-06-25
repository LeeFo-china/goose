import { Errors } from "@/errors/error-factory";
import { expenseRequestRepository } from "@/repositories/expense-requests";

export async function resolveApplicantDepartmentManagerAssignee(
  applicantEmployeeId: string,
  tenantId?: string | null,
) {
  const resolution = await expenseRequestRepository.findApplicantDepartmentManager({
    applicantEmployeeId,
    tenantId,
  });

  if (!resolution?.applicant_exists) {
    throw Errors.badRequest("申请人不存在或不可用");
  }

  if (!resolution.applicant_tenant_department_id) {
    throw Errors.badRequest("申请人未配置所属部门，无法解析部门经理");
  }

  if (!resolution.manager_employee_id) {
    throw Errors.badRequest("申请人所属部门未配置审批经理");
  }

  if (resolution.manager_status !== "active") {
    throw Errors.badRequest("申请人所属部门审批经理已停用");
  }

  if (
    resolution.manager_tenant_department_id &&
    resolution.manager_tenant_department_id !==
      resolution.applicant_tenant_department_id
  ) {
    throw Errors.badRequest("申请人所属部门审批经理不属于该部门");
  }

  return resolution.manager_employee_id;
}
