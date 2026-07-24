import { describe, expect, mock, test } from "bun:test";
import type { AuthContext } from "@/services/authorization";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

mock.module("@/repositories/supplier-onboarding", () => ({
  supplierOnboardingRepository: {},
}));
mock.module("@/services/access-policy", () => ({
  accessPolicyService: { assertPermission: mock(() => "all") },
}));
mock.module("@/services/platform-audit-logs", () => ({
  platformAuditLogService: { recordBestEffort: mock(async () => null) },
}));

const auth = {
  authUserId: "77777777-7777-4777-8777-777777777777",
  employeeId: "22222222-2222-4222-8222-222222222222",
  tenantId: null,
  isPlatformAdmin: true,
  permissions: [{ code: "platform.supplier.manage", scope: "all" }],
} as AuthContext;

const input = {
  name: "晴天建材",
  legal_name: "晴天建材有限公司",
  unified_social_credit_code: "91411525MA9G000000",
  supplier_type: "distributor" as const,
  legal_representative_name: null,
  registered_address_text: null,
  license_file_id: "55555555-5555-4555-8555-555555555555",
  ocr_recognition_id: null,
  license_valid_from: null,
  license_valid_until: null,
  primary_contact: { name: "张三", phone: "13800138000", email: null },
};

const result = {
  status: "created" as const,
  idempotent: false as const,
  version: 1 as const,
  supplier: {
    id: "11111111-1111-4111-8111-111111111111",
    code: "SUP-111111111111",
    name: input.name,
    legal_name: input.legal_name,
    unified_social_credit_code: input.unified_social_credit_code,
    supplier_type: input.supplier_type,
    onboarding_status: "draft" as const,
    operational_status: "active" as const,
    legal_representative_name: null,
    registered_address_text: null,
    version: 1 as const,
    created_at: "2026-07-24T10:00:00.000Z",
    updated_at: "2026-07-24T10:00:00.000Z",
  },
  qualification: {
    id: "33333333-3333-4333-8333-333333333333",
    supplier_id: "11111111-1111-4111-8111-111111111111",
    qualification_type_id: "44444444-4444-4444-8444-444444444444",
    document_file_id: input.license_file_id,
    certificate_no: input.unified_social_credit_code,
    valid_from: null,
    valid_until: null,
    verification_status: "pending" as const,
    version: 1 as const,
    created_at: "2026-07-24T10:00:00.000Z",
    updated_at: "2026-07-24T10:00:00.000Z",
  },
  primary_contact: {
    id: "66666666-6666-4666-8666-666666666666",
    supplier_id: "11111111-1111-4111-8111-111111111111",
    contact_type: "primary" as const,
    name: input.primary_contact.name,
    phone: input.primary_contact.phone,
    email: null,
    is_public: false as const,
    is_primary: true as const,
    status: "active" as const,
    version: 1 as const,
    created_at: "2026-07-24T10:00:00.000Z",
    updated_at: "2026-07-24T10:00:00.000Z",
  },
};

async function harness(options: {
  repositoryError?: unknown;
  permissions?: AuthContext["permissions"];
} = {}) {
  const { SupplierOnboardingService } = await import("./supplier-onboarding");
  const repository = {
    create: mock(async () => {
      if (options.repositoryError) throw options.repositoryError;
      return result;
    }),
    findByCreditCode: mock(async () => null),
  };
  const accessPolicy = {
    assertPermission: mock((
      context: AuthContext,
      permission: string,
    ) => {
      if (!context.permissions.some((item) => item.code === permission)) {
        throw Object.assign(new Error("forbidden"), {
          statusCode: 403,
          code: "FORBIDDEN",
        });
      }
      return "all" as const;
    }),
  };
  const audit = { recordBestEffort: mock(async () => null) };
  return {
    service: new SupplierOnboardingService({
      repository,
      accessPolicy,
      audit,
      idFactory: () => result.supplier.id,
    }),
    dependencies: { repository, accessPolicy, audit },
    auth: { ...auth, permissions: options.permissions ?? auth.permissions },
  };
}

describe("SupplierOnboardingService", () => {
  test("requires platform supplier manage and creates aggregate with actor context", async () => {
    const { service, dependencies } = await harness();

    await service.create(auth, input, "supplier-onboarding-1");

    expect(dependencies.accessPolicy.assertPermission).toHaveBeenCalledWith(
      auth,
      "platform.supplier.manage",
    );
    expect(dependencies.repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        supplier_id: result.supplier.id,
        actor_user_id: auth.authUserId,
        actor_employee_id: auth.employeeId,
        idempotency_key: "supplier-onboarding-1",
      }),
    );
  });

  test("records sanitized audit metadata after non-idempotent creation", async () => {
    const { service, dependencies } = await harness();

    await service.create(auth, input, "supplier-onboarding-1");

    expect(dependencies.audit.recordBestEffort).toHaveBeenCalledWith(
      expect.objectContaining({
        resourceId: result.supplier.id,
        metadata: {
          supplier_id: result.supplier.id,
          qualification_id: result.qualification.id,
          primary_contact_id: result.primary_contact.id,
          idempotent: false,
        },
      }),
    );
    expect(JSON.stringify(dependencies.audit.recordBestEffort.mock.calls))
      .not.toContain("13800138000");
    expect(JSON.stringify(dependencies.audit.recordBestEffort.mock.calls))
      .not.toContain(input.unified_social_credit_code);
  });

  test("maps known RPC validation errors to stable business responses", async () => {
    const error = Object.assign(new Error("rpc failed"), {
      message: "SUPPLIER_FILE_INVALID",
      code: "P0001",
    });
    const { service } = await harness({ repositoryError: error });

    await expect(service.create(auth, input, "supplier-onboarding-1"))
      .rejects.toMatchObject({
        statusCode: 400,
        code: "SUPPLIER_FILE_INVALID",
      });
  });

  test("checks identity by normalized social credit code", async () => {
    const { service, dependencies } = await harness();

    await service.checkIdentity(auth, " 91411525ma9g000000 ");

    expect(dependencies.repository.findByCreditCode)
      .toHaveBeenCalledWith("91411525MA9G000000");
  });
});
