import { describe, expect, mock, test } from "bun:test";
import type { AuthContext } from "@/services/authorization";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const SUPPLIER_ID = "00000000-0000-4000-8000-000000000101";
const TENANT_ID = "00000000-0000-4000-8000-000000000301";
const USER_ID = "00000000-0000-4000-8000-000000000401";
const EMPLOYEE_ID = "00000000-0000-4000-8000-000000000402";
const NOW = "2026-07-24T00:00:00.000Z";

async function createHarness() {
  const repository = {
    mutateSupplier: mock(async (input: { action: string }): Promise<unknown> => ({
      status: "updated",
      idempotent: false,
      supplier: mutatedSupplier(input.action),
      previous_supplier: supplier,
      version: 3,
    })),
    listQualificationTypes: mock(async () => emptyPage),
    mutateTenantSupplier: mock(async () => null),
    getTenantSupplierSettings: mock(async () => settings),
    setTenantSupplierSettings: mock(async (input: typeof settings): Promise<unknown> => ({
      status: "updated",
      idempotent: false,
      setting: { ...settings, ...input, version: 2 },
      previous_setting: settings,
      version: 2,
    })),
  };
  const accessPolicy = {
    assertPermission: mock((context: AuthContext, permission: string) => {
      if (!context.permissions.some((item) => item.code === permission)) {
        throw Object.assign(new Error("forbidden"), {
          statusCode: 403,
          code: "FORBIDDEN",
        });
      }
      return "all";
    }),
  };
  const audit = { recordBestEffort: mock(async () => null) };
  const { PlatformSuppliersService } = await import("./platform-suppliers");
  return {
    service: new PlatformSuppliersService({
      repository,
      accessPolicy,
      audit,
    } as never),
    repository,
    audit,
  };
}

function auth(permissionCodes: string[], isPlatformAdmin = true): AuthContext {
  return {
    authUserId: USER_ID,
    employeeId: EMPLOYEE_ID,
    tenantId: null,
    tenantName: null,
    tenantSlug: null,
    tenantStatus: null,
    isPlatformAdmin,
    employeeName: "平台管理员",
    employeeStatus: "active",
    departmentId: null,
    tenantDepartmentId: null,
    departmentCode: null,
    departmentName: null,
    postId: null,
    postName: null,
    avatar: null,
    roleCodes: [],
    roles: [],
    permissions: permissionCodes.map((code) => ({ code, scope: "all" })),
  };
}

describe("PlatformSuppliersService regression boundaries", () => {
  test("stocktake flag is merged at current version and stale replay preserves omission", async () => {
    const { service, repository, audit } = await createHarness();
    repository.getTenantSupplierSettings.mockImplementation(async () => ({ ...settings,
      module_enabled: true, warehouse_stocktakes_enabled: true, version: 8 }));
    const request = { ...settings, tenantId: TENANT_ID, module_enabled: false,
      expected_version: 8, reason: '停用', idempotencyKey: 'stocktake-disable-module' };
    await expect(service.setTenantSupplierSettings(auth(['platform.supplier.manage']), request))
      .rejects.toMatchObject({ code: 'SUPPLIER_ROLLOUT_ORDER_INVALID' });
    expect(repository.setTenantSupplierSettings).not.toHaveBeenCalled();
    repository.setTenantSupplierSettings.mockImplementation(async () => ({ status: 'updated', idempotent: true,
      setting: settings, previous_setting: null, version: 1 }));
    await service.setTenantSupplierSettings(auth(['platform.supplier.manage']), { ...request, expected_version: 0 });
    expect(repository.setTenantSupplierSettings.mock.calls[0]?.[0]).not.toHaveProperty('warehouse_stocktakes_enabled');
    expect(audit.recordBestEffort).not.toHaveBeenCalled();
  });

  test("explicit stocktake flag is forwarded and audited independently", async () => {
    const { service, repository, audit } = await createHarness();
    repository.getTenantSupplierSettings.mockImplementation(async () => ({ ...settings, module_enabled: true }));
    await service.setTenantSupplierSettings(auth(['platform.supplier.manage']), { ...settings,
      tenantId: TENANT_ID, module_enabled: true, warehouse_stocktakes_enabled: true,
      expected_version: 1, idempotencyKey: 'stocktake-enable' });
    expect(repository.setTenantSupplierSettings.mock.calls[0]?.[0]).toMatchObject({ warehouse_stocktakes_enabled: true });
    expect(audit.recordBestEffort).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({
        from: expect.objectContaining({ warehouse_stocktakes_enabled: false }),
        to: expect.objectContaining({ warehouse_stocktakes_enabled: true }),
      }),
    }));
  });
  test("transfer flag is forwarded and audited only by platform managers", async () => {
    const { service, repository, audit } = await createHarness();
    repository.getTenantSupplierSettings.mockImplementation(async () => ({ ...settings, module_enabled: true }));
    const request = { ...settings, tenantId: TENANT_ID, module_enabled: true,
      warehouse_transfers_enabled: true, expected_version: 1, idempotencyKey: "transfer-enable" };
    for (const context of [auth([]), auth(["platform.supplier.manage"], false),
      { ...auth(["platform.supplier.manage"]), tenantId: TENANT_ID }]) {
      await expect(service.setTenantSupplierSettings(context, request)).rejects.toMatchObject({ statusCode: 403 });
    }
    expect(repository.setTenantSupplierSettings).not.toHaveBeenCalled();
    await service.setTenantSupplierSettings(auth(["platform.supplier.manage"]), request);
    expect(repository.setTenantSupplierSettings.mock.calls[0]?.[0]).toMatchObject({ warehouse_transfers_enabled: true });
    expect(audit.recordBestEffort).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({ to: expect.objectContaining({ warehouse_transfers_enabled: true }) }),
    }));
  });

  test("omitted enabled transfer blocks module disable but stale requests still reach replay", async () => {
    const { service, repository, audit } = await createHarness();
    repository.getTenantSupplierSettings.mockImplementation(async () => ({ ...settings, module_enabled: true, warehouse_transfers_enabled: true, version: 8 }));
    const request = { ...settings, tenantId: TENANT_ID, expected_version: 8, reason: "停用", idempotencyKey: "transfer-disable-module" };
    await expect(service.setTenantSupplierSettings(auth(["platform.supplier.manage"]), request)).rejects.toMatchObject({ code: "SUPPLIER_ROLLOUT_ORDER_INVALID" });
    expect(repository.setTenantSupplierSettings).not.toHaveBeenCalled();
    repository.setTenantSupplierSettings.mockImplementation(async () => ({ status: "updated", idempotent: true, setting: settings, previous_setting: null, version: 1 }));
    await service.setTenantSupplierSettings(auth(["platform.supplier.manage"]), { ...request, expected_version: 0 });
    expect(repository.setTenantSupplierSettings.mock.calls[0]?.[0]).not.toHaveProperty("warehouse_transfers_enabled");
    expect(audit.recordBestEffort).not.toHaveBeenCalled();
  });

  test("module disable preserves omitted materials and rejects only current-version invalid targets", async () => {
    const { service, repository, audit } = await createHarness();
    repository.getTenantSupplierSettings.mockImplementation(async () => ({
      ...settings, module_enabled: true, warehouse_materials_enabled: true, version: 8,
    }));
    const request = { ...settings, tenantId: TENANT_ID, expected_version: 8,
      reason: "停用", idempotencyKey: "materials-module-disable" };
    await expect(service.setTenantSupplierSettings(auth(["platform.supplier.manage"]), request))
      .rejects.toMatchObject({ code: "SUPPLIER_ROLLOUT_ORDER_INVALID" });
    expect(repository.setTenantSupplierSettings).not.toHaveBeenCalled();
    repository.setTenantSupplierSettings.mockImplementation(async () => ({
      status: "updated", idempotent: true, setting: settings, previous_setting: null, version: 1,
    }));
    await service.setTenantSupplierSettings(auth(["platform.supplier.manage"]), { ...request, expected_version: 0 });
    expect(repository.setTenantSupplierSettings.mock.calls[0]?.[0]).not.toHaveProperty("warehouse_materials_enabled");
    expect(audit.recordBestEffort).not.toHaveBeenCalled();
  });

  test("explicit material transitions are forwarded and audited independently of procurement", async () => {
    const { service, repository, audit } = await createHarness();
    repository.getTenantSupplierSettings.mockImplementation(async () => ({ ...settings, module_enabled: true }));
    await service.setTenantSupplierSettings(auth(["platform.supplier.manage"]), {
      ...settings, tenantId: TENANT_ID, module_enabled: true,
      warehouse_materials_enabled: true, expected_version: 1, idempotencyKey: "materials-enable",
    });
    expect(repository.setTenantSupplierSettings.mock.calls[0]?.[0]).toMatchObject({ warehouse_materials_enabled: true });
    expect(audit.recordBestEffort).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({ to: expect.objectContaining({ warehouse_materials_enabled: true }) }),
    }));
  });
  test("warehouse command preserves omission and audits the RPC before and after", async () => {
    const { service, repository, audit } = await createHarness();
    const workflow = { ...settings, module_enabled: true, ownership_reads_enabled: true,
      private_supplier_writes_enabled: true, private_catalog_writes_enabled: true,
      procurement_snapshot_v1_enabled: true, purchase_batch_workflow_enabled: true,
      warehouse_procurement_enabled: false };
    repository.getTenantSupplierSettings.mockImplementation(async () => workflow);
    repository.setTenantSupplierSettings.mockImplementation(async (input) => ({
      status: "updated", idempotent: false, previous_setting: workflow,
      setting: { ...workflow, ...input, version: 2 }, version: 2,
    }));
    const input = { ...workflow, tenantId: TENANT_ID, expected_version: 1,
      warehouse_procurement_enabled: true, idempotencyKey: "warehouse-enable" };
    for (const context of [auth([]), { ...auth(["platform.supplier.manage"]), tenantId: TENANT_ID },
      auth(["platform.supplier.manage"], false)]) {
      await expect(service.setTenantSupplierSettings(context, input)).rejects.toMatchObject({ statusCode: 403 });
    }
    await service.setTenantSupplierSettings(auth(["platform.supplier.manage"]), input);
    expect(repository.setTenantSupplierSettings).toHaveBeenCalledWith(expect.objectContaining({ warehouse_procurement_enabled: true }));
    expect(audit.recordBestEffort).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({ from: expect.objectContaining({ warehouse_procurement_enabled: false }),
        to: expect.objectContaining({ warehouse_procurement_enabled: true }) }),
    }));
    const { warehouse_procurement_enabled: _omitted, ...legacy } = input;
    await service.setTenantSupplierSettings(auth(["platform.supplier.manage"]), legacy);
    expect(repository.setTenantSupplierSettings.mock.calls.at(-1)?.[0])
      .not.toHaveProperty("warehouse_procurement_enabled");
  });

  test("legacy retry reaches historical replay despite current warehouse state", async () => {
    const { service, repository, audit } = await createHarness();
    repository.getTenantSupplierSettings.mockImplementation(async () => ({ ...settings, version: 8,
      module_enabled: true, ownership_reads_enabled: true, private_supplier_writes_enabled: true,
      private_catalog_writes_enabled: true, procurement_snapshot_v1_enabled: true,
      purchase_batch_workflow_enabled: true, warehouse_procurement_enabled: true }));
    repository.setTenantSupplierSettings.mockImplementation(async () => ({
      status: "updated", idempotent: true, setting: { ...settings, module_enabled: true },
      previous_setting: null, version: 1,
    }));
    await service.setTenantSupplierSettings(auth(["platform.supplier.manage"]), {
      ...settings, tenantId: TENANT_ID, module_enabled: true, expected_version: 0,
      idempotencyKey: "historical-module-enable",
    });
    expect(repository.setTenantSupplierSettings).toHaveBeenCalledTimes(1);
    expect(audit.recordBestEffort).not.toHaveBeenCalled();
  });
  test("delegates approval completely to the atomic supplier RPC", async () => {
    const { service, repository } = await createHarness();

    await service.mutateSupplier(
      auth(["platform.supplier.review"]),
      SUPPLIER_ID,
      "approve",
      { expected_version: 2 },
      "approve-1",
    );

    expect(repository.mutateSupplier).toHaveBeenCalledWith({
      supplier_id: SUPPLIER_ID,
      action: "approve",
      expected_version: 2,
      actor_user_id: USER_ID,
      actor_employee_id: EMPLOYEE_ID,
      idempotency_key: "approve-1",
    });
    expect(repository.listQualificationTypes).not.toHaveBeenCalled();
  });

  test("platform blacklist never mutates a tenant-supplier relationship", async () => {
    const { service, repository } = await createHarness();

    await service.mutateSupplier(
      auth(["platform.supplier.blacklist"]),
      SUPPLIER_ID,
      "blacklist",
      { expected_version: 2, reason: "严重违规" },
      "blacklist-1",
    );

    expect(repository.mutateSupplier).toHaveBeenCalledTimes(1);
    expect(repository.mutateTenantSupplier).not.toHaveBeenCalled();
  });

  test("allows module enablement only to a platform manager", async () => {
    const { service, repository } = await createHarness();
    const input = {
      tenantId: TENANT_ID,
      module_enabled: true,
      require_active_contract_for_new_order: false,
      ownership_reads_enabled: false,
      private_supplier_writes_enabled: false,
      private_catalog_writes_enabled: false,
      procurement_snapshot_v1_enabled: false,
      purchase_batch_workflow_enabled: false,
      expected_version: 1,
      idempotencyKey: "module-1",
    };

    await expect(service.setTenantSupplierSettings(
      auth(["platform.supplier.manage"], false),
      input,
    )).rejects.toMatchObject({ statusCode: 403 });
    await service.setTenantSupplierSettings(
      auth(["platform.supplier.manage"]),
      input,
    );

    expect(repository.setTenantSupplierSettings).toHaveBeenCalledTimes(1);
  });

  test("passes the disable reason to the atomic RPC and platform audit", async () => {
    const { service, repository, audit } = await createHarness();
    repository.getTenantSupplierSettings.mockImplementationOnce(async () => ({
      ...settings,
      module_enabled: true,
    }));
    repository.setTenantSupplierSettings.mockImplementationOnce(async (input) => ({
      status: "updated",
      idempotent: false,
      setting: { ...settings, ...input, version: 2 },
      previous_setting: { ...settings, module_enabled: true },
      version: 2,
    }));

    await service.setTenantSupplierSettings(
      auth(["platform.supplier.manage"]),
      {
        tenantId: TENANT_ID,
        module_enabled: false,
        require_active_contract_for_new_order: false,
        ownership_reads_enabled: false,
        private_supplier_writes_enabled: false,
        private_catalog_writes_enabled: false,
        procurement_snapshot_v1_enabled: false,
        purchase_batch_workflow_enabled: false,
        expected_version: 1,
        reason: "合作策略调整",
        idempotencyKey: "module-disable-1",
      },
    );

    expect(repository.setTenantSupplierSettings).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "合作策略调整" }),
    );
    expect(audit.recordBestEffort).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "tenant_supplier_module_disable",
        metadata: expect.objectContaining({
          reason: "合作策略调整",
          to: expect.objectContaining({
            ownership_reads_enabled: false,
            private_supplier_writes_enabled: false,
            private_catalog_writes_enabled: false,
            procurement_snapshot_v1_enabled: false,
            purchase_batch_workflow_enabled: false,
          }),
        }),
      }),
    );
  });

  test("rejects rollout jumps before calling the repository", async () => {
    const { service, repository } = await createHarness();
    repository.getTenantSupplierSettings = mock(async () => settings);

    await expect(service.setTenantSupplierSettings(
      auth(["platform.supplier.manage"]),
      {
        tenantId: TENANT_ID,
        module_enabled: true,
        require_active_contract_for_new_order: false,
        ownership_reads_enabled: true,
        private_supplier_writes_enabled: true,
        private_catalog_writes_enabled: false,
        procurement_snapshot_v1_enabled: false,
        purchase_batch_workflow_enabled: false,
        expected_version: 1,
        idempotencyKey: "rollout-jump-1",
      },
    )).rejects.toMatchObject({
      statusCode: 409,
      code: "SUPPLIER_ROLLOUT_ORDER_INVALID",
    });
    expect(repository.setTenantSupplierSettings).not.toHaveBeenCalled();
  });

  test("rejects dependency-invalid flags before a stale version reaches the repository", async () => {
    const { service, repository } = await createHarness();

    await expect(service.setTenantSupplierSettings(
      auth(["platform.supplier.manage"]),
      {
        tenantId: TENANT_ID,
        module_enabled: true,
        require_active_contract_for_new_order: false,
        ownership_reads_enabled: false,
        private_supplier_writes_enabled: true,
        private_catalog_writes_enabled: false,
        procurement_snapshot_v1_enabled: false,
        purchase_batch_workflow_enabled: false,
        expected_version: 0,
        idempotencyKey: "stale-invalid-rollout-1",
      },
    )).rejects.toMatchObject({
      statusCode: 409,
      code: "SUPPLIER_ROLLOUT_ORDER_INVALID",
    });
    expect(repository.getTenantSupplierSettings).not.toHaveBeenCalled();
    expect(repository.setTenantSupplierSettings).not.toHaveBeenCalled();
  });

  test("rejects purchase workflow without procurement snapshot", async () => {
    const { service, repository } = await createHarness();

    await expect(service.setTenantSupplierSettings(
      auth(["platform.supplier.manage"]),
      {
        tenantId: TENANT_ID,
        module_enabled: true,
        require_active_contract_for_new_order: false,
        ownership_reads_enabled: true,
        private_supplier_writes_enabled: true,
        private_catalog_writes_enabled: true,
        procurement_snapshot_v1_enabled: false,
        purchase_batch_workflow_enabled: true,
        expected_version: 0,
        idempotencyKey: "stale-invalid-workflow-rollout-1",
      },
    )).rejects.toMatchObject({
      statusCode: 409,
      code: "SUPPLIER_ROLLOUT_ORDER_INVALID",
    });
    expect(repository.getTenantSupplierSettings).not.toHaveBeenCalled();
    expect(repository.setTenantSupplierSettings).not.toHaveBeenCalled();
  });

  test("lets a dependency-valid stale version reach the repository conflict", async () => {
    const { service, repository } = await createHarness();
    repository.setTenantSupplierSettings.mockImplementationOnce(async () => {
      throw Object.assign(new Error("数据版本已变化，请刷新后重试"), {
        statusCode: 409,
        code: "SUPPLIER_VERSION_CONFLICT",
      });
    });

    await expect(service.setTenantSupplierSettings(
      auth(["platform.supplier.manage"]),
      {
        tenantId: TENANT_ID,
        module_enabled: true,
        require_active_contract_for_new_order: false,
        ownership_reads_enabled: false,
        private_supplier_writes_enabled: false,
        private_catalog_writes_enabled: false,
        procurement_snapshot_v1_enabled: false,
        purchase_batch_workflow_enabled: false,
        expected_version: 0,
        idempotencyKey: "stale-valid-rollout-1",
      },
    )).rejects.toMatchObject({
      statusCode: 409,
      code: "SUPPLIER_VERSION_CONFLICT",
    });
    expect(repository.getTenantSupplierSettings).toHaveBeenCalledTimes(1);
    expect(repository.setTenantSupplierSettings).toHaveBeenCalledTimes(1);
  });
});

function mutatedSupplier(action: string) {
  return {
    ...supplier,
    onboarding_status: action === "approve"
      ? "approved"
      : supplier.onboarding_status,
    operational_status: action === "blacklist"
      ? "blacklisted"
      : supplier.operational_status,
    version: 3,
  };
}

const supplier = {
  id: SUPPLIER_ID,
  code: "SUP-001",
  name: "晴天建材",
  legal_name: "晴天建材有限公司",
  unified_social_credit_code: null,
  supplier_type: "manufacturer",
  onboarding_status: "pending_review",
  operational_status: "active",
  review_remark: null,
  reviewed_by_employee_id: null,
  reviewed_at: null,
  blacklisted_by_employee_id: null,
  blacklisted_at: null,
  blacklist_reason: null,
  version: 2,
  created_by_employee_id: EMPLOYEE_ID,
  updated_by_employee_id: EMPLOYEE_ID,
  created_at: NOW,
  updated_at: NOW,
};

const settings = {
  tenant_id: TENANT_ID,
  module_enabled: false,
  require_active_contract_for_new_order: false,
  ownership_reads_enabled: false,
  private_supplier_writes_enabled: false,
  private_catalog_writes_enabled: false,
  procurement_snapshot_v1_enabled: false,
  purchase_batch_workflow_enabled: false,
  enabled_by_employee_id: null,
  enabled_at: null,
  version: 1,
  created_at: NOW,
  updated_at: NOW,
};

const emptyPage = {
  list: [],
  pagination: {
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 0,
  },
};
