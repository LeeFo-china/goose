import { describe, expect, mock, test } from "bun:test";

import type { AuthContext } from "@/services/authorization";
import { SupplierPurchaseBatchCatalogService } from
  "@/services/supplier-purchase-batch-catalog";

const TENANT_ID = "68000000-0000-4000-8000-000000000001";
const USER_ID = "68000000-0000-4000-8000-000000000005";
const EMPLOYEE_ID = "68000000-0000-4000-8000-000000000006";

const auth = {
  authUserId: USER_ID,
  employeeId: EMPLOYEE_ID,
  tenantId: TENANT_ID,
} as AuthContext;

describe("SupplierPurchaseBatchCatalogService", () => {
  test("requires batch manage permission and scopes category options", async () => {
    const access = {
      requireManage: mock(async () => ({
        tenantId: TENANT_ID,
        authUserId: USER_ID,
        employeeId: EMPLOYEE_ID,
      })),
    };
    const repository = {
      listCategoryOptions: mock(async (_input: unknown) => ({
        list: [],
        pagination: { page: 4, pageSize: 20, total: 0, totalPages: 0 },
      })),
    };
    const service = new SupplierPurchaseBatchCatalogService({
      access,
      repository,
      nowFactory: () => new Date("2026-08-27T03:04:05.000Z"),
    });

    await service.listCategoryOptions(auth, {
      page: 4,
      pageSize: 20,
      keyword: "主材",
    });

    expect(access.requireManage).toHaveBeenCalledWith(auth);
    expect(repository.listCategoryOptions).toHaveBeenCalledWith({
      tenant_id: TENANT_ID,
      priced_at: "2026-08-27T03:04:05.000Z",
      page: 4,
      pageSize: 20,
      keyword: "主材",
    });
  });
});
