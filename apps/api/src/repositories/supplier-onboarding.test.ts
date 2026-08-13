import { describe, expect, mock, test } from "bun:test";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const supplier = {
  id: "11111111-1111-4111-8111-111111111111",
  code: "SUP-111111111111",
  name: "晴天建材",
  legal_name: "晴天建材有限公司",
  unified_social_credit_code: "91411525MA9G000000",
  supplier_type: "distributor",
  onboarding_status: "draft",
  operational_status: "active",
  legal_representative_name: null,
  registered_address_text: null,
  review_remark: null,
  reviewed_by_employee_id: null,
  reviewed_at: null,
  blacklisted_by_employee_id: null,
  blacklisted_at: null,
  blacklist_reason: null,
  version: 1,
  created_by_employee_id: "22222222-2222-4222-8222-222222222222",
  updated_by_employee_id: "22222222-2222-4222-8222-222222222222",
  created_at: "2026-07-24T10:00:00.000Z",
  updated_at: "2026-07-24T10:00:00.000Z",
};
const qualification = {
  id: "33333333-3333-4333-8333-333333333333",
  supplier_id: supplier.id,
  qualification_type_id: "44444444-4444-4444-8444-444444444444",
  document_file_id: "55555555-5555-4555-8555-555555555555",
  certificate_no: supplier.unified_social_credit_code,
  valid_from: null,
  valid_until: null,
  verification_status: "pending",
  verified_by_employee_id: null,
  verified_at: null,
  rejection_reason: null,
  version: 1,
  created_by_employee_id: supplier.created_by_employee_id,
  updated_by_employee_id: supplier.updated_by_employee_id,
  created_at: supplier.created_at,
  updated_at: supplier.updated_at,
};
const primaryContact = {
  id: "66666666-6666-4666-8666-666666666666",
  supplier_id: supplier.id,
  contact_type: "primary",
  name: "张三",
  phone: "13800138000",
  email: null,
  is_public: false,
  is_primary: true,
  status: "active",
  version: 1,
  created_by_employee_id: supplier.created_by_employee_id,
  updated_by_employee_id: supplier.updated_by_employee_id,
  created_at: supplier.created_at,
  updated_at: supplier.updated_at,
};

function buildRepository(rpcData: unknown = {
  status: "created",
  idempotent: false,
  version: 1,
  supplier,
  qualification,
  primary_contact: primaryContact,
}) {
  const rpc = mock(async () => ({ data: rpcData, error: null }));
  const eq = mock(() => query);
  const limit = mock(() => query);
  const maybeSingle = mock(async () => ({ data: supplier, error: null }));
  const query = {
    select: mock(() => query),
    eq,
    limit,
    maybeSingle,
  };
  const from = mock(() => query);
  return {
    rpc,
    from,
    repositoryPromise: import("./supplier-onboarding").then((module) =>
      new module.SupplierOnboardingRepository(() => ({ rpc, from }))
    ),
  };
}

describe("SupplierOnboardingRepository", () => {
  test("calls only create_supplier_onboarding RPC for aggregate creation", async () => {
    const { repositoryPromise, rpc, from } = buildRepository();
    const repository = await repositoryPromise;

    const result = await repository.create({
      supplier_id: supplier.id,
      name: supplier.name,
      legal_name: supplier.legal_name,
      unified_social_credit_code: supplier.unified_social_credit_code,
      supplier_type: "distributor",
      legal_representative_name: null,
      registered_address_text: null,
      license_file_id: qualification.document_file_id,
      ocr_recognition_id: null,
      license_valid_from: null,
      license_valid_until: null,
      primary_contact: { name: "张三", phone: "13800138000", email: null },
      actor_user_id: "77777777-7777-4777-8777-777777777777",
      actor_employee_id: supplier.created_by_employee_id,
      idempotency_key: "supplier-onboarding-1",
    });

    expect(result).toMatchObject({ status: "created", supplier: { id: supplier.id } });
    expect(from).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith(
      "create_supplier_onboarding",
      expect.objectContaining({
        p_expected_version: 0,
        p_supplier_id: supplier.id,
        p_primary_contact_phone: "13800138000",
      }),
    );
  });

  test("rejects incomplete aggregate RPC envelopes", async () => {
    const { repositoryPromise } = buildRepository({ status: "created" });
    const repository = await repositoryPromise;

    await expect(repository.create({
      supplier_id: supplier.id,
      name: supplier.name,
      legal_name: supplier.legal_name,
      unified_social_credit_code: supplier.unified_social_credit_code,
      supplier_type: "distributor",
      legal_representative_name: null,
      registered_address_text: null,
      license_file_id: qualification.document_file_id,
      ocr_recognition_id: null,
      license_valid_from: null,
      license_valid_until: null,
      primary_contact: { name: "张三", phone: "13800138000", email: null },
      actor_user_id: "77777777-7777-4777-8777-777777777777",
      actor_employee_id: supplier.created_by_employee_id,
      idempotency_key: "supplier-onboarding-1",
    })).rejects.toMatchObject({ code: "DB_ERROR" });
  });

  test("identity check uses exact normalized credit code and limit one", async () => {
    const { repositoryPromise, from } = buildRepository();
    const repository = await repositoryPromise;

    await expect(repository.findByCreditCode(" 91411525ma9g000000 "))
      .resolves.toMatchObject({ id: supplier.id });

    const query = from.mock.results[0]?.value as {
      eq: ReturnType<typeof mock>;
      limit: ReturnType<typeof mock>;
    };
    expect(from).toHaveBeenCalledWith("suppliers");
    expect(query.eq).toHaveBeenCalledWith(
      "unified_social_credit_code",
      "91411525MA9G000000",
    );
    expect(query.eq).toHaveBeenCalledWith("ownership_scope", "platform");
    expect(query.limit).toHaveBeenCalledWith(1);
  });
});
