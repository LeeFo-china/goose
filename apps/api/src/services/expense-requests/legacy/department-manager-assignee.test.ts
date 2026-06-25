import { describe, expect, mock, test } from "bun:test";
import type { ExpenseDepartmentManagerResolution } from "@/repositories/expense-requests";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const findApplicantDepartmentManager = mock(
  async (): Promise<ExpenseDepartmentManagerResolution> => ({
  applicant_exists: true,
  applicant_tenant_department_id: "department-1",
  department_name: "工程部",
  manager_employee_id: "manager-1",
  manager_status: "active",
  manager_tenant_department_id: "department-1",
}));

mock.module("@/repositories/expense-requests", () => ({
  expenseRequestRepository: {
    findApplicantDepartmentManager,
  },
}));

describe("resolveApplicantDepartmentManagerAssignee", () => {
  test("returns active manager configured on applicant department", async () => {
    const { resolveApplicantDepartmentManagerAssignee } = await import(
      "./department-manager-assignee"
    );

    const managerId = await resolveApplicantDepartmentManagerAssignee(
      "employee-1",
      "tenant-1",
    );

    expect(managerId).toBe("manager-1");
    expect(findApplicantDepartmentManager).toHaveBeenCalledWith({
      applicantEmployeeId: "employee-1",
      tenantId: "tenant-1",
    });
  });

  test("returns a clear error when applicant department has no manager", async () => {
    findApplicantDepartmentManager.mockImplementationOnce(async () => ({
      applicant_exists: true,
      applicant_tenant_department_id: "department-1",
      department_name: "工程部",
      manager_employee_id: null,
      manager_status: null,
      manager_tenant_department_id: null,
    }));
    const { resolveApplicantDepartmentManagerAssignee } = await import(
      "./department-manager-assignee"
    );

    await expect(resolveApplicantDepartmentManagerAssignee(
      "employee-1",
      "tenant-1",
    )).rejects.toThrow("申请人所属部门未配置审批经理");
  });
});
