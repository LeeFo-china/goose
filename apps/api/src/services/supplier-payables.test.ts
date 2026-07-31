import { describe, expect, mock, test } from "bun:test";

import type { AuthContext } from "@/services/authorization";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const TENANT_ID = "83000000-0000-4000-8000-000000000001";
const PROJECT_ID = "83000000-0000-4000-8000-000000000002";
const auth = {
  authUserId: "83000000-0000-4000-8000-000000000004",
  employeeId: "83000000-0000-4000-8000-000000000005",
  tenantId: TENANT_ID,
} as unknown as AuthContext;

function dependencies(visibleProjectIds: string[] | null = [PROJECT_ID]) {
  return {
    access: {
      requirePayableRead: mock(async () => ({
        tenantId: TENANT_ID,
        authUserId: auth.authUserId,
        employeeId: auth.employeeId!,
      })),
      getVisibleProjectIds: mock(async () => visibleProjectIds),
    },
    repository: {
      list: mock(async (input: unknown) => ({
        list: [],
        pagination: { page: 1, pageSize: 20, total: 0 },
        input,
      })),
      getPurchaseOrderSummary: mock(async () => ({})),
    },
  };
}

describe("SupplierPayablesService", () => {
  test.each([
    [null, "all project scope"],
    [[PROJECT_ID], "scoped project ids"],
    [[], "empty project scope"],
  ] as const)("passes %s for %s before database pagination", async (
    visibleProjectIds,
  ) => {
    const deps = dependencies(
      visibleProjectIds === null ? null : [...visibleProjectIds],
    );
    const { SupplierPayablesService } = await import("./supplier-payables");
    const service = new SupplierPayablesService(deps as never);

    await service.list(auth, {
      project_id: PROJECT_ID,
      status: "open",
      page: 1,
      pageSize: 20,
    });

    expect(deps.access.requirePayableRead).toHaveBeenCalledWith(auth);
    expect(deps.access.getVisibleProjectIds).toHaveBeenCalledWith(auth);
    expect(deps.repository.list).toHaveBeenCalledWith({
      tenant_id: TENANT_ID,
      visible_project_ids: visibleProjectIds,
      project_id: PROJECT_ID,
      status: "open",
      page: 1,
      pageSize: 20,
    });
  });
});
