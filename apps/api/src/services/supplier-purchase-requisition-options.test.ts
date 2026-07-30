import { describe, expect, mock, test } from "bun:test";

import { Errors } from "@/errors/error-factory";
import type { AuthContext } from "@/services/authorization";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const TENANT_ID = "65000000-0000-4000-8000-000000000001";
const PROJECT_ID = "65000000-0000-4000-8000-000000000002";
const RELATIONSHIP_ID = "65000000-0000-4000-8000-000000000003";
const NOW = "2026-07-30T06:00:00.000Z";

const auth = {
  authUserId: "65000000-0000-4000-8000-000000000004",
  employeeId: "65000000-0000-4000-8000-000000000005",
  tenantId: TENANT_ID,
} as AuthContext;

function dependencies() {
  const scope = {
    tenantId: TENANT_ID,
    authUserId: auth.authUserId,
    employeeId: auth.employeeId,
  };
  return {
    access: {
      requireView: mock(async () => scope),
      requireManage: mock(async () => scope),
      requireApprove: mock(async () => scope),
      requireFinanceBudgetManage: mock(async () => undefined),
      getVisibleProjectIds: mock(async () => [PROJECT_ID]),
      getVisibleProjectUpdateIds: mock(async () => [PROJECT_ID]),
      assertProjectUpdate: mock(async () => undefined),
    },
    repository: {
      listRequisitions: mock(async () => ({})),
      findRequisitionScope: mock(async () => null),
      findRequisition: mock(async () => null),
      listItems: mock(async () => ({})),
      saveDraft: mock(async () => ({})),
      submit: mock(async () => ({})),
      review: mock(async () => ({})),
      cancel: mock(async () => ({})),
      convert: mock(async () => ({})),
    },
    optionsRepository: {
      listProjectOptions: mock(async (input: unknown) => ({ input })),
      listSupplierOptions: mock(async (input: unknown) => ({ input })),
      listCatalog: mock(async (input: unknown) => ({ input })),
    },
    costCategoryRepository: {
      list: mock(async (tenantId: string, query: unknown) => ({
        tenantId,
        query,
      })),
    },
    tenantSuppliers: {
      assertCanCreatePurchaseOrderForTenant: mock(async () => undefined),
    },
    nowFactory: () => new Date(NOW),
  };
}

async function serviceFor() {
  const deps = dependencies();
  const { SupplierPurchaseRequisitionsService } = await import(
    "./supplier-purchase-requisitions"
  );
  return {
    deps,
    service: new SupplierPurchaseRequisitionsService(deps as never),
  };
}

describe("SupplierPurchaseRequisitionsService option endpoints", () => {
  test("uses requisition view scope for paginated project and supplier options", async () => {
    const { deps, service } = await serviceFor();

    await service.listProjectOptions(auth, {
      page: 2,
      pageSize: 100,
      keyword: "项目",
    });
    await service.listSupplierOptions(auth, {
      page: 3,
      pageSize: 20,
      keyword: "供应商",
    });

    expect(deps.access.requireView).toHaveBeenCalledTimes(2);
    expect(deps.access.getVisibleProjectIds).toHaveBeenCalledWith(auth);
    expect(deps.optionsRepository.listProjectOptions).toHaveBeenCalledWith({
      tenant_id: TENANT_ID,
      visible_project_ids: [PROJECT_ID],
      page: 2,
      pageSize: 100,
      keyword: "项目",
    });
    expect(deps.optionsRepository.listSupplierOptions).toHaveBeenCalledWith({
      tenant_id: TENANT_ID,
      checked_at: NOW,
      page: 3,
      pageSize: 20,
      keyword: "供应商",
    });
  });

  test("uses requisition manage scope for catalog and active cost categories", async () => {
    const { deps, service } = await serviceFor();

    await service.listCatalog(auth, {
      tenantSupplierId: RELATIONSHIP_ID,
      page: 4,
      pageSize: 20,
      keyword: "SKU",
    });
    await service.listCostCategories(auth, {
      page: 2,
      pageSize: 100,
    });

    expect(deps.access.requireManage).toHaveBeenCalledTimes(2);
    expect(deps.optionsRepository.listCatalog).toHaveBeenCalledWith({
      tenant_id: TENANT_ID,
      tenant_supplier_id: RELATIONSHIP_ID,
      priced_at: NOW,
      page: 4,
      pageSize: 20,
      keyword: "SKU",
    });
    expect(deps.costCategoryRepository.list).toHaveBeenCalledWith(
      TENANT_ID,
      { page: 2, pageSize: 100, status: "active" },
    );
  });

  test("fails closed before auxiliary repositories when manage access is missing", async () => {
    const { deps, service } = await serviceFor();
    deps.access.requireManage.mockImplementation(async () => {
      throw Errors.forbidden();
    });

    await expect(service.listCatalog(auth, {
      tenantSupplierId: RELATIONSHIP_ID,
      page: 1,
      pageSize: 20,
    })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(service.listCostCategories(auth, {
      page: 1,
      pageSize: 20,
    })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(deps.optionsRepository.listCatalog).not.toHaveBeenCalled();
    expect(deps.costCategoryRepository.list).not.toHaveBeenCalled();
  });
});
