import { describe, expect, mock, test } from "bun:test";

const hasActiveProjectAssignmentForEmployee = mock(async () => true);

mock.module("@/repositories/project-procedure-assignments", () => ({
  projectProcedureAssignmentRepository: {
    hasActiveProjectAssignmentForEmployee,
  },
}));

describe("procedure assignment project access", () => {
  test("allows project detail access from active procedure assignment", async () => {
    const { canAccessProjectByProcedureAssignment } = await import("./project-access");

    await expect(canAccessProjectByProcedureAssignment({
      authContext: {
        tenantId: "tenant-1",
        employeeId: "employee-1",
        permissions: [{ code: "project.read", scope: "self" }],
      } as never,
      projectId: "project-1",
    })).resolves.toBe(true);

    expect(hasActiveProjectAssignmentForEmployee).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      projectId: "project-1",
      employeeId: "employee-1",
    });
  });

  test("keeps project detail blocked without project read permission", async () => {
    const { canAccessProjectByProcedureAssignment } = await import("./project-access");

    await expect(canAccessProjectByProcedureAssignment({
      authContext: {
        tenantId: "tenant-1",
        employeeId: "employee-1",
        permissions: [],
      } as never,
      projectId: "project-1",
    })).resolves.toBe(false);
  });
});
