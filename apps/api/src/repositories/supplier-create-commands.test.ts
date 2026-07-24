import { describe, expect, test } from "bun:test";
import { createClient } from "@supabase/supabase-js";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const SUPPLIER_ID = "00000000-0000-4000-8000-000000000101";
const RESOURCE_ID = "00000000-0000-4000-8000-000000000201";
const REPLAY_ID = "00000000-0000-4000-8000-000000000202";
const TYPE_ID = "00000000-0000-4000-8000-000000000203";
const USER_ID = "00000000-0000-4000-8000-000000000301";
const EMPLOYEE_ID = "00000000-0000-4000-8000-000000000302";
const NOW = "2026-07-24T00:00:00.000Z";

type StubResponse = { body: unknown; status?: number };

async function createPlatformRepository(
  responder: (request: Request) => StubResponse,
) {
  const requests: Request[] = [];
  const fetchStub = (async (input: string | URL | Request, init?: RequestInit) => {
    const request = input instanceof Request
      ? input
      : new Request(input.toString(), init);
    requests.push(request);
    const response = responder(request);
    return new Response(JSON.stringify(response.body), {
      status: response.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  const client = createClient("http://127.0.0.1:54321", "test-key", {
    global: { fetch: fetchStub },
  });
  const { PlatformSuppliersRepository } = await import("./platform-suppliers");
  return {
    repository: new PlatformSuppliersRepository(() => client as never),
    requests,
  };
}

async function createCatalogRepository(
  responder: (request: Request) => StubResponse,
) {
  const requests: Request[] = [];
  const fetchStub = (async (input: string | URL | Request, init?: RequestInit) => {
    const request = input instanceof Request
      ? input
      : new Request(input.toString(), init);
    requests.push(request);
    const response = responder(request);
    return new Response(JSON.stringify(response.body), {
      status: response.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  const client = createClient("http://127.0.0.1:54321", "test-key", {
    global: { fetch: fetchStub },
  });
  const { SupplierCatalogRepository } = await import("./supplier-catalog");
  return {
    repository: new SupplierCatalogRepository(() => client),
    requests,
  };
}

describe("supplier create command repositories", () => {
  test("uses five platform RPCs and returns the first resource on replay", async () => {
    const rows = platformRows();
    let qualificationTypeCalls = 0;
    const { repository, requests } = await createPlatformRepository((request) => {
      const name = new URL(request.url).pathname.split("/").at(-1) ?? "";
      if (name === "create_supplier_qualification_type") {
        qualificationTypeCalls += 1;
      }
      const resourceKey = platformRpcKeys[name as keyof typeof platformRpcKeys];
      return {
        body: {
          status: "created",
          idempotent: qualificationTypeCalls > 1,
          [resourceKey]: rows[resourceKey],
          version: 1,
        },
      };
    });
    const command = {
      actor_user_id: USER_ID,
      actor_employee_id: EMPLOYEE_ID,
      idempotency_key: "platform-create-1",
    };

    const first = await repository.createQualificationType({
      qualification_type_id: RESOURCE_ID,
      code: "LICENSE",
      name: "营业执照",
      applicable_supplier_types: [],
      warning_days: 30,
      is_required: true,
      blocks_new_orders: true,
      status: "active",
      sort_order: 100,
      ...command,
    } as never);
    const replay = await repository.createQualificationType({
      qualification_type_id: REPLAY_ID,
      code: "LICENSE",
      name: "营业执照",
      applicable_supplier_types: [],
      warning_days: 30,
      is_required: true,
      blocks_new_orders: true,
      status: "active",
      sort_order: 100,
      ...command,
    } as never);
    await repository.createQualification({
      qualification_id: RESOURCE_ID,
      supplier_id: SUPPLIER_ID,
      qualification_type_id: TYPE_ID,
      document_file_id: RESOURCE_ID,
      ...command,
    } as never);
    await repository.createServiceRegion({
      region_id: RESOURCE_ID,
      supplier_id: SUPPLIER_ID,
      region_code: "411502",
      region_level: "district",
      status: "active",
      ...command,
    } as never);
    await repository.createAddress({
      address_id: RESOURCE_ID,
      supplier_id: SUPPLIER_ID,
      address_type: "registered",
      region_code: "411502",
      address_detail: "测试路 1 号",
      is_default: true,
      status: "active",
      ...command,
    } as never);
    await repository.createContact({
      contact_id: RESOURCE_ID,
      supplier_id: SUPPLIER_ID,
      contact_type: "primary",
      name: "张三",
      is_public: true,
      is_primary: true,
      status: "active",
      ...command,
    } as never);

    expect(first).toMatchObject({
      idempotent: false,
      qualification_type: { id: RESOURCE_ID },
    });
    expect(replay).toMatchObject({
      idempotent: true,
      qualification_type: { id: RESOURCE_ID },
    });
    expect(requests.map((request) => new URL(request.url).pathname)).toEqual([
      "/rest/v1/rpc/create_supplier_qualification_type",
      "/rest/v1/rpc/create_supplier_qualification_type",
      "/rest/v1/rpc/create_supplier_qualification",
      "/rest/v1/rpc/create_supplier_service_region",
      "/rest/v1/rpc/create_supplier_address",
      "/rest/v1/rpc/create_supplier_contact",
    ]);
    for (const request of requests) {
      const payload = await request.clone().json();
      expect(payload).toMatchObject({
        p_actor_user_id: USER_ID,
        p_actor_employee_id: EMPLOYEE_ID,
        p_idempotency_key: "platform-create-1",
      });
    }
  });

  test("uses three catalog RPCs and preserves conversion factor text", async () => {
    const rows = catalogRows();
    const { repository, requests } = await createCatalogRepository((request) => {
      const name = new URL(request.url).pathname.split("/").at(-1) ?? "";
      const resourceKey = catalogRpcKeys[name as keyof typeof catalogRpcKeys];
      return {
        body: {
          status: "created",
          idempotent: false,
          [resourceKey]: rows[resourceKey],
          version: 1,
        },
      };
    });
    const command = {
      actor_user_id: USER_ID,
      actor_employee_id: EMPLOYEE_ID,
      idempotency_key: "catalog-create-1",
    };

    await repository.createCategory({
      category_id: RESOURCE_ID,
      parent_id: null,
      code: "CAT-001",
      name: "主材",
      level: 1,
      status: "active",
      sort_order: 100,
      ...command,
    } as never);
    await repository.createBrand({
      brand_id: RESOURCE_ID,
      code: "BR-001",
      name: "雨虹",
      status: "active",
      sort_order: 100,
      ...command,
    } as never);
    const unitResult = await repository.createUnit({
      unit_id: RESOURCE_ID,
      code: "UNIT-BOX",
      name: "箱",
      symbol: "箱",
      base_unit_id: null,
      conversion_factor: "999999999999.123456",
      status: "active",
      sort_order: 100,
      ...command,
    } as never);

    expect(requests.map((request) => new URL(request.url).pathname)).toEqual([
      "/rest/v1/rpc/create_catalog_category",
      "/rest/v1/rpc/create_catalog_brand",
      "/rest/v1/rpc/create_catalog_unit",
    ]);
    expect(unitResult).toMatchObject({
      unit: { conversion_factor: "999999999999.123456" },
    });
    expect(await requests[2]?.clone().json()).toMatchObject({
      p_conversion_factor: "999999999999.123456",
      p_actor_user_id: USER_ID,
      p_idempotency_key: "catalog-create-1",
    });
  });
});

const platformRpcKeys = {
  create_supplier_qualification_type: "qualification_type",
  create_supplier_qualification: "qualification",
  create_supplier_service_region: "service_region",
  create_supplier_address: "address",
  create_supplier_contact: "contact",
} as const;

const catalogRpcKeys = {
  create_catalog_category: "category",
  create_catalog_brand: "brand",
  create_catalog_unit: "unit",
} as const;

function platformRows() {
  const audit = {
    version: 1,
    created_at: NOW,
    updated_at: NOW,
  };
  const childAudit = {
    supplier_id: SUPPLIER_ID,
    created_by_employee_id: EMPLOYEE_ID,
    updated_by_employee_id: EMPLOYEE_ID,
    ...audit,
  };
  return {
    qualification_type: {
      id: RESOURCE_ID,
      code: "LICENSE",
      name: "营业执照",
      applicable_supplier_types: [],
      warning_days: 30,
      is_required: true,
      blocks_new_orders: true,
      status: "active",
      sort_order: 100,
      ...audit,
    },
    qualification: {
      id: RESOURCE_ID,
      qualification_type_id: TYPE_ID,
      document_file_id: RESOURCE_ID,
      certificate_no: null,
      valid_from: null,
      valid_until: null,
      verification_status: "pending",
      verified_by_employee_id: null,
      verified_at: null,
      rejection_reason: null,
      ...childAudit,
    },
    service_region: {
      id: RESOURCE_ID,
      region_code: "411502",
      region_level: "district",
      status: "active",
      valid_from: null,
      valid_until: null,
      ...childAudit,
    },
    address: {
      id: RESOURCE_ID,
      address_type: "registered",
      province: null,
      city: null,
      district: null,
      region_code: "411502",
      address_detail: "测试路 1 号",
      longitude: null,
      latitude: null,
      is_default: true,
      status: "active",
      ...childAudit,
    },
    contact: {
      id: RESOURCE_ID,
      contact_type: "primary",
      name: "张三",
      phone: null,
      email: null,
      is_public: true,
      is_primary: true,
      status: "active",
      ...childAudit,
    },
  };
}

function catalogRows() {
  const audit = { version: 1, created_at: NOW, updated_at: NOW };
  return {
    category: {
      id: RESOURCE_ID,
      parent_id: null,
      code: "CAT-001",
      name: "主材",
      level: 1,
      status: "active",
      sort_order: 100,
      ...audit,
    },
    brand: {
      id: RESOURCE_ID,
      code: "BR-001",
      name: "雨虹",
      legal_name: null,
      logo_file_id: null,
      status: "active",
      sort_order: 100,
      ...audit,
    },
    unit: {
      id: RESOURCE_ID,
      code: "UNIT-BOX",
      name: "箱",
      symbol: "箱",
      base_unit_id: null,
      conversion_factor: "999999999999.123456",
      status: "active",
      sort_order: 100,
      ...audit,
    },
  };
}
