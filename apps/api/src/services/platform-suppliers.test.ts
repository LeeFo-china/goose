import { describe, expect, mock, test } from "bun:test";
import type { AuthContext } from "@/services/authorization";
process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";
const SUPPLIER_ID = "00000000-0000-4000-8000-000000000101";
const QUALIFICATION_ID = "00000000-0000-4000-8000-000000000201";
const TYPE_ID = "00000000-0000-4000-8000-000000000202";
const TENANT_ID = "00000000-0000-4000-8000-000000000301";
const USER_ID = "00000000-0000-4000-8000-000000000401";
const EMPLOYEE_ID = "00000000-0000-4000-8000-000000000402";
const NOW = "2026-07-24T00:00:00.000Z";
async function createService(deps: ReturnType<typeof dependencies>) {
  const { PlatformSuppliersService } = await import("./platform-suppliers");
  return new PlatformSuppliersService(deps as never);
}
function auth(permissionCodes: string[], isPlatformAdmin = true): AuthContext {
  return {
    authUserId: USER_ID,
    employeeId: EMPLOYEE_ID,
    tenantId: null, tenantName: null, tenantSlug: null, tenantStatus: null,
    isPlatformAdmin,
    employeeName: "平台管理员", employeeStatus: "active",
    departmentId: null, tenantDepartmentId: null,
    departmentCode: null, departmentName: null,
    postId: null, postName: null, avatar: null,
    roleCodes: [],
    roles: [],
    permissions: permissionCodes.map((code) => ({ code, scope: "all" })),
  };
}
function dependencies(overrides: Record<string, unknown> = {}) {
  const repository = {
    listSuppliers: mock(async ({ page, pageSize }) => emptyPage(page, pageSize)),
    findSupplierById: mock(async (): Promise<unknown> => supplier),
    listQualificationTypes: mock(async ({ page, pageSize }): Promise<unknown> =>
      emptyPage(page, pageSize)),
    findQualificationTypeById: mock(async () => qualificationType),
    createQualificationType: mock(async (input) => ({ ...qualificationType, ...input })),
    updateQualificationType: mock(async (input) => ({ ...qualificationType, ...input })),
    createSupplier: mock(async (): Promise<unknown> => ({
      status: "created" as const,
      idempotent: false,
      supplier,
      version: 1,
    })),
    updateSupplier: mock(async () => ({
      status: "updated" as const,
      idempotent: false,
      supplier: { ...supplier, version: 3 },
      version: 3,
    })),
    mutateSupplier: mock(async (input): Promise<unknown> => ({
      status: "updated" as const,
      idempotent: false,
      supplier: mutationSupplier(input.action),
      previous_supplier: supplier,
      version: 3,
    })),
    listQualifications: mock(async ({ page, pageSize }) =>
      pageOf([qualification], page, pageSize)),
    findQualificationByIdForSupplier: mock(async (): Promise<unknown> => qualification),
    createQualification: mock(async (input) => ({ ...qualification, ...input })),
    updateQualification: mock(async (input) => ({ ...qualification, ...input })),
    reviewQualification: mock(async (input): Promise<unknown> => ({
      status: "updated" as const,
      idempotent: false,
      qualification: {
        ...qualification,
        verification_status: input.verification_status,
        version: 2,
      },
      previous_qualification: qualification,
      version: 2,
    })),
    listServiceRegions: mock(async ({ page, pageSize }): Promise<unknown> =>
      emptyPage(page, pageSize)),
    findServiceRegionByIdForSupplier: mock(async (): Promise<unknown> => serviceRegion),
    upsertServiceRegion: mock(async (input) => ({ ...serviceRegion, ...input })),
    listAddresses: mock(async ({ page, pageSize }) => emptyPage(page, pageSize)),
    findAddressByIdForSupplier: mock(async (): Promise<unknown> => address),
    upsertAddress: mock(async (input) => input),
    listContacts: mock(async ({ page, pageSize }) => emptyPage(page, pageSize)),
    findContactByIdForSupplier: mock(async (): Promise<unknown> => contact),
    upsertContact: mock(async (input) => input),
    listEvents: mock(async ({ page, pageSize }) => emptyPage(page, pageSize)),
    getTenantSupplierSettings: mock(async () => settings),
    setTenantSupplierSettings: mock(async (input): Promise<unknown> => ({
      status: "updated" as const, idempotent: false,
      setting: { ...settings, ...input, version: 2 }, previous_setting: settings,
      version: 2,
    })),
  };
  return {
    repository,
    accessPolicy: {
      assertPermission: mock((context: AuthContext, permission: string) => {
        if (!context.permissions.some((item) => item.code === permission)) {
          throw Object.assign(new Error("forbidden"), { statusCode: 403, code: "FORBIDDEN" });
        }
        return "all";
      }),
    },
    audit: { recordBestEffort: mock(async () => null) },
    regions: {
      list: mock(async () => [{
        adcode: "411502",
        name: "浉河区",
        level: "district",
        status: "active",
      }]),
    },
    ...overrides,
  };
}
describe("PlatformSuppliersService identity and permissions", () => {
  test("requires a platform identity before data access", async () => {
    const deps = dependencies();
    const service = await createService(deps);
    expect(() => service.listSuppliers(
      auth(["platform.supplier.view"], false),
      { page: 1, pageSize: 20 },
    )).toThrow("无权限");
    expect(deps.repository.listSuppliers).not.toHaveBeenCalled();
  });
  test("checks view, manage, review, and blacklist independently", async () => {
    const deps = dependencies();
    const service = await createService(deps);
    await service.listSuppliers(
      auth(["platform.supplier.view"]),
      { page: 1, pageSize: 20 },
    );
    await service.createSupplier(auth(["platform.supplier.manage"]), {
      supplierId: SUPPLIER_ID,
      input: {
        code: "SUP-001",
        name: "晴天建材",
        legal_name: "晴天建材有限公司",
        supplier_type: "manufacturer",
      },
      idempotencyKey: "create-1",
    });
    await service.mutateSupplier(
      auth(["platform.supplier.review"]),
      SUPPLIER_ID,
      "approve",
      { expected_version: 2 },
      "approve-1",
    );
    await service.mutateSupplier(
      auth(["platform.supplier.blacklist"]),
      SUPPLIER_ID,
      "blacklist",
      { expected_version: 2, reason: "严重违规" },
      "blacklist-1",
    );
    expect(deps.accessPolicy.assertPermission.mock.calls.map((call) => call[1]))
      .toEqual([
        "platform.supplier.view",
        "platform.supplier.manage",
        "platform.supplier.review",
        "platform.supplier.blacklist",
      ]);
  });
  test("maps repository command conflicts to stable API errors", async () => {
    const cases = [
      ["supplier_not_found", 404, "SUPPLIER_NOT_FOUND"],
      ["state_conflict", 409, "SUPPLIER_STATE_CONFLICT"],
      ["version_conflict", 409, "SUPPLIER_VERSION_CONFLICT"],
      ["idempotency_conflict", 409, "SUPPLIER_IDEMPOTENCY_CONFLICT"],
    ] as const;
    for (const [status, statusCode, code] of cases) {
      const deps = dependencies();
      deps.repository.mutateSupplier.mockImplementationOnce(async () => ({ status }));
      const service = await createService(deps);
      await expect(service.mutateSupplier(
        auth(["platform.supplier.review"]),
        SUPPLIER_ID,
        "approve",
        { expected_version: 2 },
        `command-${status}`,
      )).rejects.toMatchObject({ statusCode, code });
    }
  });
});
describe("PlatformSuppliersService domain boundaries", () => {
  test("delegates submit qualification gate to the atomic RPC", async () => {
    const deps = dependencies();
    deps.repository.mutateSupplier.mockImplementationOnce(async () => ({
      status: "state_conflict" as const,
      error_code: "SUPPLIER_STATE_CONFLICT",
      reason: "required_qualification_missing",
    }));
    const service = await createService(deps);
    await expect(service.mutateSupplier(
      auth(["platform.supplier.manage"]),
      SUPPLIER_ID,
      "submit",
      { expected_version: 2 },
      "submit-1",
    )).rejects.toMatchObject({
      statusCode: 409,
      code: "SUPPLIER_STATE_CONFLICT",
    });
    expect(deps.repository.mutateSupplier).toHaveBeenCalledTimes(1);
    expect(deps.repository.listQualificationTypes).not.toHaveBeenCalled();
    expect(deps.repository.listQualifications).not.toHaveBeenCalled();
  });
  test("validates duplicate types, warning bounds, and blocking requirements separately", async () => {
    const deps = dependencies();
    const service = await createService(deps);
    const context = auth(["platform.supplier.manage"]);
    const invalid = [
      { applicable_supplier_types: ["manufacturer", "manufacturer"], warning_days: 30,
        is_required: true, blocks_new_orders: true },
      { applicable_supplier_types: ["manufacturer"], warning_days: 3651,
        is_required: true, blocks_new_orders: true },
      { applicable_supplier_types: ["manufacturer"], warning_days: 30,
        is_required: false, blocks_new_orders: true },
    ] as const;
    for (const rules of invalid) await expect(service.createQualificationType(context, {
      code: "unsafe", name: "不安全资质", ...rules,
      applicable_supplier_types: [...rules.applicable_supplier_types],
      status: "active", sort_order: 100,
    })).rejects.toMatchObject({ statusCode: 400 });
    expect(deps.repository.createQualificationType).not.toHaveBeenCalled();
  });
  test("uses targeted lookups for qualification type and region beyond page 100", async () => {
    const deps = dependencies();
    deps.repository.listServiceRegions.mockImplementationOnce(async () =>
      pageOf(Array.from({ length: 100 }, (_, index) => ({
        ...serviceRegion, id: `unrelated-${index}`,
      })), 1, 100));
    const service = await createService(deps);
    await service.updateQualificationType(auth(["platform.supplier.manage"]), {
      qualification_type_id: TYPE_ID, expected_version: 1, warning_days: 60,
    });
    await service.upsertServiceRegion(auth(["platform.supplier.manage"]), {
      supplier_id: SUPPLIER_ID, region_id: serviceRegion.id,
      region_code: "411502", expected_version: 1,
    });
    expect(deps.repository.findQualificationTypeById).toHaveBeenCalledWith(TYPE_ID);
    expect(deps.repository.findServiceRegionByIdForSupplier)
      .toHaveBeenCalledWith(SUPPLIER_ID, serviceRegion.id);
    expect(deps.repository.upsertServiceRegion).toHaveBeenCalledWith(
      expect.objectContaining({ region_level: "district" }));
    expect(deps.repository.listServiceRegions).not.toHaveBeenCalled();
  });

  test("rejects another supplier's ids through targeted child ownership checks", async () => {
    const deps = dependencies();
    deps.repository.findQualificationByIdForSupplier.mockImplementation(async () => null);
    deps.repository.findServiceRegionByIdForSupplier.mockImplementation(async () => null);
    deps.repository.findAddressByIdForSupplier.mockImplementation(async () => null);
    deps.repository.findContactByIdForSupplier.mockImplementation(async () => null);
    const service = await createService(deps);
    const context = auth(["platform.supplier.manage"]);
    const writes = [
      () => service.updateQualification(context, {
        supplier_id: SUPPLIER_ID, qualification_id: QUALIFICATION_ID,
        expected_version: 1, certificate_no: "CERT-NEW",
      }),
      () => service.upsertServiceRegion(context, {
        supplier_id: SUPPLIER_ID, region_id: serviceRegion.id,
        expected_version: 1, region_code: "411502", region_level: "district",
      }),
      () => service.upsertAddress(context, {
        supplier_id: SUPPLIER_ID, address_id: address.id,
        expected_version: 1, status: "inactive",
      }),
      () => service.upsertContact(context, {
        supplier_id: SUPPLIER_ID, contact_id: contact.id,
        expected_version: 1, name: "李四",
      }),
    ];
    for (const write of writes) {
      await expect(write()).rejects.toMatchObject({
        statusCode: 404, code: "SUPPLIER_NOT_FOUND",
      });
    }
    expect(deps.repository.updateQualification).not.toHaveBeenCalled();
    expect(deps.repository.upsertServiceRegion).not.toHaveBeenCalled();
    expect(deps.repository.upsertAddress).not.toHaveBeenCalled();
    expect(deps.repository.upsertContact).not.toHaveBeenCalled();
  });

  test("returns stable 404 before creating any child for a missing supplier", async () => {
    const deps = dependencies();
    deps.repository.findSupplierById.mockImplementation(async () => null);
    const service = await createService(deps);
    const context = auth(["platform.supplier.manage"]);
    const creates = [
      () => service.createQualification(context, {
        supplier_id: SUPPLIER_ID, qualification_type_id: TYPE_ID,
        document_file_id: QUALIFICATION_ID,
      }),
      () => service.upsertServiceRegion(context, {
        supplier_id: SUPPLIER_ID, region_code: "411502",
        region_level: "district", status: "active",
      }),
      () => service.upsertAddress(context, {
        supplier_id: SUPPLIER_ID, address_type: "registered",
        region_code: "411502", address_detail: "测试路 1 号",
        is_default: true, status: "active",
      }),
      () => service.upsertContact(context, {
        supplier_id: SUPPLIER_ID, contact_type: "primary", name: "张三",
        is_public: true, is_primary: true, status: "active",
      }),
    ];
    for (const create of creates) {
      await expect(create()).rejects.toMatchObject({
        statusCode: 404, code: "SUPPLIER_NOT_FOUND",
      });
    }
    expect(deps.repository.createQualification).not.toHaveBeenCalled();
    expect(deps.repository.upsertServiceRegion).not.toHaveBeenCalled();
    expect(deps.repository.upsertAddress).not.toHaveBeenCalled();
    expect(deps.repository.upsertContact).not.toHaveBeenCalled();
  });

  test("rejects missing administrative regions and level mismatch separately", async () => {
    const deps = dependencies();
    deps.regions.list.mockImplementationOnce(async () => []);
    const service = await createService(deps);
    const write = {
      supplier_id: SUPPLIER_ID, region_code: "411502",
      region_level: "city" as const, status: "active" as const,
    };
    await expect(service.upsertServiceRegion(
      auth(["platform.supplier.manage"]), write,
    )).rejects.toMatchObject({ statusCode: 400 });
    deps.regions.list.mockImplementationOnce(async () => [{
      adcode: "411502",
      name: "浉河区",
      level: "district",
      status: "active",
    }]);
    await expect(service.upsertServiceRegion(
      auth(["platform.supplier.manage"]), write,
    )).rejects.toMatchObject({ statusCode: 400 });
    expect(deps.repository.upsertServiceRegion).not.toHaveBeenCalled();
  });

  test("records best-effort audit with explicit resource and state metadata", async () => {
    const deps = dependencies();
    const service = await createService(deps);
    await service.mutateSupplier(
      auth(["platform.supplier.review"]),
      SUPPLIER_ID,
      "approve",
      { expected_version: 2 },
      "approve-audit-1",
    );

    expect(deps.audit.recordBestEffort).toHaveBeenCalledWith({
      action: "platform_supplier_approve",
      actorEmployeeId: EMPLOYEE_ID,
      actorUserId: USER_ID,
      resourceType: "supplier",
      resourceId: SUPPLIER_ID,
      resourceLabel: "晴天建材",
      status: "success",
      summary: "审核通过平台供应商「晴天建材」",
      metadata: {
        from: {
          onboarding_status: "pending_review",
          operational_status: "active",
          version: 2,
        },
        to: {
          onboarding_status: "approved",
          operational_status: "active",
          version: 3,
        },
        reason: null,
      },
    });
  });

  test("skips audit and avoidable state reads for idempotent RPC replays", async () => {
    for (const kind of ["create", "lifecycle", "review", "module"] as const) {
      const deps = dependencies();
      const replay = { status: "updated" as const, idempotent: true,
        supplier: mutationSupplier("approve"), version: 3 };
      if (kind === "create") deps.repository.createSupplier.mockImplementationOnce(
        async () => ({ ...replay, status: "created" as const }));
      if (kind === "lifecycle") deps.repository.mutateSupplier.mockImplementationOnce(
        async () => replay);
      if (kind === "review") deps.repository.reviewQualification.mockImplementationOnce(
        async () => ({ status: "updated" as const, idempotent: true,
          qualification: { ...qualification, version: 2 }, version: 2 }));
      if (kind === "module") deps.repository.setTenantSupplierSettings.mockImplementationOnce(
        async () => ({ status: "updated" as const, idempotent: true,
          setting: { ...settings, version: 2 }, version: 2 }));
      const service = await createService(deps);
      if (kind === "create") await service.createSupplier(
        auth(["platform.supplier.manage"]), createRequest);
      if (kind === "lifecycle") await service.mutateSupplier(
        auth(["platform.supplier.review"]), SUPPLIER_ID, "approve",
        { expected_version: 2 }, "replay-1");
      if (kind === "review") await service.reviewQualification(
        auth(["platform.supplier.review"]), SUPPLIER_ID, QUALIFICATION_ID,
        "verified", { expected_version: 1 }, "replay-1");
      if (kind === "module") await service.setTenantSupplierSettings(
        auth(["platform.supplier.manage"]), settingsRequest);
      expect(deps.audit.recordBestEffort).not.toHaveBeenCalled();
      if (kind === "lifecycle") expect(deps.repository.findSupplierById).not.toHaveBeenCalled();
      if (kind === "review") expect(deps.repository.findSupplierById).not.toHaveBeenCalled();
      if (kind === "module") expect(deps.repository.getTenantSupplierSettings).not.toHaveBeenCalled();
    }
  });
});
function emptyPage(page: number, pageSize: number) { return {
  list: [], pagination: { page, pageSize, total: 0, totalPages: 0 } }; }
function pageOf<T>(list: T[], page: number, pageSize: number) { return {
  list, pagination: { page, pageSize, total: list.length, totalPages: 1 } }; }
function mutationSupplier(action: string) { return {
  ...supplier, onboarding_status: action === "approve"
    ? "approved" as const : supplier.onboarding_status,
  operational_status: action === "blacklist"
    ? "blacklisted" as const : supplier.operational_status, version: 3 }; }
const supplier = {
  id: SUPPLIER_ID,
  code: "SUP-001",
  name: "晴天建材",
  legal_name: "晴天建材有限公司",
  unified_social_credit_code: null,
  supplier_type: "manufacturer" as const,
  onboarding_status: "pending_review" as const,
  operational_status: "active" as const,
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
const qualificationType = {
  id: TYPE_ID,
  code: "business_license",
  name: "营业执照",
  applicable_supplier_types: ["manufacturer"] as const,
  warning_days: 30,
  is_required: true,
  blocks_new_orders: true,
  status: "active" as const,
  sort_order: 10,
  version: 1,
  created_at: NOW,
  updated_at: NOW,
};
const qualification = {
  id: QUALIFICATION_ID,
  supplier_id: SUPPLIER_ID,
  qualification_type_id: TYPE_ID,
  verification_status: "pending" as const,
  valid_from: "2026-01-01",
  valid_until: "2099-12-31",
  version: 1,
};
const serviceRegion = {
  id: "00000000-0000-4000-8000-000000000501",
  supplier_id: SUPPLIER_ID,
  region_code: "411502",
  region_level: "district" as const,
  status: "active" as const,
  version: 1,
};
const address = {
  id: QUALIFICATION_ID, supplier_id: SUPPLIER_ID, status: "active" as const,
};
const contact = {
  id: QUALIFICATION_ID, supplier_id: SUPPLIER_ID, name: "张三",
};
const settings = {
  tenant_id: TENANT_ID,
  module_enabled: false,
  require_active_contract_for_new_order: false,
  enabled_by_employee_id: null,
  enabled_at: null,
  version: 1,
  created_at: NOW,
  updated_at: NOW,
};
const createRequest = {
  supplierId: SUPPLIER_ID, input: { code: "SUP-001", name: "晴天建材",
    legal_name: "晴天建材有限公司", supplier_type: "manufacturer" as const },
  idempotencyKey: "replay-1" };
const settingsRequest = {
  tenantId: TENANT_ID, module_enabled: true,
  require_active_contract_for_new_order: false, expected_version: 1,
  idempotencyKey: "replay-1" };
