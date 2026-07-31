import { describe, expect, mock, test } from "bun:test";

import type { AuthContext } from "@/services/authorization";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const TENANT_ID = "89000000-0000-4000-8000-000000000001";
const PROJECT_ID = "89000000-0000-4000-8000-000000000002";
const PAYABLE_ID = "89000000-0000-4000-8000-000000000003";
const auth = { tenantId: TENANT_ID } as unknown as AuthContext;

describe("SupplierPayablesService.batch", () => {
  test("requires payable read and applies visible project scope", async () => {
    const access = {
      requirePayableRead: mock(async () => ({ tenantId: TENANT_ID })),
      getVisibleProjectIds: mock(async () => [PROJECT_ID]),
    };
    const repository = {
      list: mock(async () => ({})),
      listFilterOptions: mock(async () => ({})),
      getPurchaseOrderSummary: mock(async () => ({})),
      batch: mock(async () => []),
    };
    const { SupplierPayablesService } = await import("./supplier-payables");
    const service = new SupplierPayablesService({ access, repository } as never);

    expect(await service.batch(auth, { ids: [PAYABLE_ID] })).toEqual([]);
    expect(access.requirePayableRead).toHaveBeenCalledWith(auth);
    expect(access.getVisibleProjectIds).toHaveBeenCalledWith(auth);
    expect(repository.batch).toHaveBeenCalledWith({
      tenant_id: TENANT_ID,
      visible_project_ids: [PROJECT_ID],
      ids: [PAYABLE_ID],
    });
  });

  test("request draft facts require manage and project update scope", async () => {
    const access = {
      requirePayableRead: mock(async () => ({ tenantId: TENANT_ID })),
      requireRequestManage: mock(async () => ({ tenantId: TENANT_ID })),
      getVisibleProjectIds: mock(async () => ["read-project"]),
      getUpdatableProjectIds: mock(async () => [PROJECT_ID]),
    };
    const repository = {
      list: mock(async () => ({})),
      listFilterOptions: mock(async () => ({})),
      getPurchaseOrderSummary: mock(async () => ({})),
      batch: mock(async () => []),
    };
    const { SupplierPayablesService } = await import("./supplier-payables");
    const service = new SupplierPayablesService({ access, repository } as never);
    expect(await service.requestDraftBatch(auth, { ids: [PAYABLE_ID] }))
      .toEqual([]);
    expect(access.requireRequestManage).toHaveBeenCalledWith(auth);
    expect(access.getUpdatableProjectIds).toHaveBeenCalledWith(auth);
    expect(access.requirePayableRead).not.toHaveBeenCalled();
    expect(access.getVisibleProjectIds).not.toHaveBeenCalled();
    expect(repository.batch).toHaveBeenCalledWith({
      tenant_id: TENANT_ID,
      visible_project_ids: [PROJECT_ID],
      ids: [PAYABLE_ID],
    });
  });
});
