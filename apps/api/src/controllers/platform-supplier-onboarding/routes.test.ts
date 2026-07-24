import { beforeEach, describe, expect, mock, test } from "bun:test";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const create = mock(async () => ({ status: "created" }));
const checkIdentity = mock(async () => ({ exists: false, supplier: null }));

mock.module("@/services/supplier-onboarding", () => ({
  supplierOnboardingService: { create, checkIdentity },
}));

const auth = {
  authUserId: "77777777-7777-4777-8777-777777777777",
  employeeId: "22222222-2222-4222-8222-222222222222",
  isPlatformAdmin: true,
};

async function controller() {
  const { default: value } = await import(".");
  Object.defineProperty(value, "getRequiredPlatformAdminContext", {
    configurable: true,
    value: mock(async () => auth),
  });
  return value;
}

const body = {
  name: "晴天建材",
  legal_name: "晴天建材有限公司",
  unified_social_credit_code: "91411525ma9g000000",
  supplier_type: "distributor",
  legal_representative_name: null,
  registered_address_text: null,
  license_file_id: "55555555-5555-4555-8555-555555555555",
  ocr_recognition_id: null,
  license_valid_from: null,
  license_valid_until: null,
  primary_contact: {
    name: "张三",
    phone: "13800138000",
    email: null,
  },
};

describe("PlatformSupplierOnboardingController", () => {
  beforeEach(() => {
    create.mockClear();
    checkIdentity.mockClear();
  });

  test("registers supplier onboarding routes", async () => {
    const value = await controller();
    const routes: Array<{ method: string; path: string }> = [];

    value.registerExtraRoutes({
      get: (path: string) => routes.push({ method: "GET", path }),
      post: (path: string) => routes.push({ method: "POST", path }),
    } as never);

    expect(routes).toEqual([
      { method: "POST", path: "/platform/suppliers/onboarding" },
      { method: "GET", path: "/platform/suppliers/identity-check" },
    ]);
  });

  test("requires idempotency key and passes validated create payload", async () => {
    const value = await controller();

    await value.onboardSupplier({
      body,
      headers: { "idempotency-key": "supplier-onboarding-1" },
    } as never);

    expect(create).toHaveBeenCalledWith(
      auth,
      expect.objectContaining({
        unified_social_credit_code: "91411525MA9G000000",
      }),
      "supplier-onboarding-1",
    );
  });

  test("rejects create without idempotency key", async () => {
    const value = await controller();

    await expect(value.onboardSupplier({ body, headers: {} } as never))
      .rejects.toMatchObject({ statusCode: 400, code: "VALIDATION_ERROR" });
    expect(create).not.toHaveBeenCalled();
  });

  test("passes normalized identity check query", async () => {
    const value = await controller();

    await value.checkIdentity({
      query: { unified_social_credit_code: " 91411525ma9g000000 " },
    } as never);

    expect(checkIdentity).toHaveBeenCalledWith(
      auth,
      "91411525MA9G000000",
    );
  });
});
