import { describe, expect, mock, test } from "bun:test";

import type { AuthContext } from "@/services/authorization";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const TENANT_ID = "83000000-0000-4000-8000-000000000001";
const PROJECT_ID = "83000000-0000-4000-8000-000000000002";
const OTHER_PROJECT_ID = "83000000-0000-4000-8000-000000000003";
const auth = {
  authUserId: "83000000-0000-4000-8000-000000000004",
  employeeId: "83000000-0000-4000-8000-000000000005",
  tenantId: TENANT_ID,
} as unknown as AuthContext;

function dependencies(projectIds = [PROJECT_ID]) {
  return {
    access: {
      requirePayableRead: mock(async () => ({
        tenantId: TENANT_ID,
        authUserId: auth.authUserId,
        employeeId: auth.employeeId!,
      })),
      assertProjectRead: mock(async () => undefined),
    },
    repository: {
      list: mock(async (input: unknown) => ({
        list: projectIds.map((project_id) => ({ project_id })),
        pagination: { page: 1, pageSize: 20, total: projectIds.length },
        input,
      })),
      getPurchaseOrderSummary: mock(async () => ({})),
    },
  };
}

describe("SupplierPayablesService", () => {
  test("injects the tenant and checks a requested project before querying", async () => {
    const deps = dependencies();
    const { SupplierPayablesService } = await import("./supplier-payables");
    const service = new SupplierPayablesService(deps as never);

    await service.list(auth, {
      project_id: PROJECT_ID,
      status: "open",
      page: 1,
      pageSize: 20,
    });

    expect(deps.access.requirePayableRead).toHaveBeenCalledWith(auth);
    expect(deps.access.assertProjectRead).toHaveBeenNthCalledWith(
      1,
      auth,
      PROJECT_ID,
    );
    expect(deps.repository.list).toHaveBeenCalledWith({
      tenant_id: TENANT_ID,
      project_id: PROJECT_ID,
      status: "open",
      page: 1,
      pageSize: 20,
    });
  });

  test("checks every distinct project returned by an unfiltered page", async () => {
    const deps = dependencies([PROJECT_ID, PROJECT_ID, OTHER_PROJECT_ID]);
    const { SupplierPayablesService } = await import("./supplier-payables");
    const service = new SupplierPayablesService(deps as never);

    await service.list(auth, { page: 1, pageSize: 20 });

    expect(deps.access.assertProjectRead).toHaveBeenCalledTimes(2);
    expect(deps.access.assertProjectRead).toHaveBeenNthCalledWith(
      1,
      auth,
      PROJECT_ID,
    );
    expect(deps.access.assertProjectRead).toHaveBeenNthCalledWith(
      2,
      auth,
      OTHER_PROJECT_ID,
    );
  });

  test("does not query when the explicit project is outside read scope", async () => {
    const deps = dependencies();
    deps.access.assertProjectRead.mockImplementation(async () => {
      throw Object.assign(new Error(), { code: "FORBIDDEN" });
    });
    const { SupplierPayablesService } = await import("./supplier-payables");
    const service = new SupplierPayablesService(deps as never);

    await expect(service.list(auth, {
      project_id: PROJECT_ID,
      page: 1,
      pageSize: 20,
    })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(deps.repository.list).not.toHaveBeenCalled();
  });
});
