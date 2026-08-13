import { describe, expect, test } from "bun:test";
import { createClient } from "@supabase/supabase-js";
process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";
const SUPPLIER_ID = "00000000-0000-4000-8000-000000000101";
const QUALIFICATION_ID = "00000000-0000-4000-8000-000000000201";
const TYPE_ID = "00000000-0000-4000-8000-000000000202";
const ACTOR_USER_ID = "00000000-0000-4000-8000-000000000401";
const ACTOR_EMPLOYEE_ID = "00000000-0000-4000-8000-000000000402";
const NOW = "2026-07-24T00:00:00.000Z";
type StubResponse = {
  body: unknown; count?: number; status?: number;
};
async function createRepository(
  responder: (request: Request) => StubResponse,
) {
  const requests: Request[] = [];
  const fetchStub = (async (input: string | URL | Request, init?: RequestInit) => {
    const request = input instanceof Request
      ? input
      : new Request(input.toString(), init);
    requests.push(request);
    const response = responder(request);
    const rows = Array.isArray(response.body) ? response.body.length : 1;
    return new Response(JSON.stringify(response.body), {
      status: response.status ?? 200,
      headers: {
        "content-type": "application/json",
        ...(response.count === undefined
          ? {}
          : { "content-range": `0-${Math.max(0, rows - 1)}/${response.count}` }),
      },
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
describe("PlatformSuppliersRepository", () => {
  test("filters database-side health before exact-count range in one request", async () => {
    const { repository, requests } = await createRepository(() => ({
      body: [{ ...supplierListRow, qualification_health: "expiring" }],
      count: 7,
    }));
    const result = await repository.listSuppliers({
      page: 2,
      pageSize: 500,
      keyword: "  晴天,().%_\u0000建材  ",
      supplier_type: "manufacturer",
      qualification_health: "expiring",
    });
    expect(result.pagination).toEqual({
      page: 2,
      pageSize: 100,
      total: 7,
      totalPages: 1,
    });
    expect(result.list[0]?.qualification_health).toBe("expiring");
    expect(requests).toHaveLength(1);
    const listUrl = new URL(requests[0]?.url ?? "http://invalid");
    expect(listUrl.pathname).toEndWith("/rest/v1/platform_supplier_directory");
    expect(listUrl.searchParams.get("select")).toBe(
      "id,code,name,legal_name,unified_social_credit_code,supplier_type,onboarding_status,operational_status,version,created_at,updated_at,qualification_health",
    );
    expect(listUrl.searchParams.get("select")).not.toContain("*");
    expect(listUrl.searchParams.get("offset")).toBe("100");
    expect(listUrl.searchParams.get("limit")).toBe("100");
    expect(listUrl.searchParams.get("supplier_type")).toBe("eq.manufacturer");
    expect(listUrl.searchParams.get("qualification_health")).toBe("eq.expiring");
    expect(listUrl.searchParams.get("order")).toBe(
      "updated_at.desc,id.desc",
    );
    expect(listUrl.searchParams.get("or")).toBe(
      "(code.ilike.%晴天 建材%,name.ilike.%晴天 建材%,legal_name.ilike.%晴天 建材%,unified_social_credit_code.ilike.%晴天 建材%)",
    );
    expect(requests[0]?.headers.get("prefer")).toContain("count=exact");
    expect(listUrl.search.indexOf("qualification_health=eq.expiring"))
      .toBeLessThan(listUrl.search.indexOf("offset=100"));
  });

  test("accepts four health values and represents pending-only suppliers as missing", async () => {
    const pendingOnly = await createRepository(() => ({
      body: [{ ...supplierListRow, qualification_health: "missing" }], count: 1,
    }));
    expect((await pendingOnly.repository.listSuppliers({
      page: 1, pageSize: 20,
    })).list[0]?.qualification_health).toBe("missing");
    const invalid = await createRepository(() => ({
      body: [{ ...supplierListRow, qualification_health: "unchecked" }], count: 1,
    }));
    await expect(invalid.repository.listSuppliers({
      page: 1, pageSize: 20,
    })).rejects.toMatchObject({ code: "DB_ERROR" });
  });

  test("keeps core detail separate and paginates qualification children", async () => {
    const { repository, requests } = await createRepository((request) => {
      if (request.url.includes("/supplier_qualifications")) {
        return { body: [qualificationRow], count: 21 };
      }
      return { body: supplierDetailRow };
    });

    const detail = await repository.findSupplierById(SUPPLIER_ID);
    expect(detail?.id).toBe(SUPPLIER_ID);
    expect(requests).toHaveLength(1);
    const detailUrl = new URL(requests[0]?.url ?? "http://invalid");
    expect(detailUrl.searchParams.get("select")).not.toContain("*");
    expect(detailUrl.searchParams.get("select")).not.toContain("(");
    expect(detailUrl.searchParams.get("ownership_scope")).toBe("eq.platform");
    expect(detailUrl.searchParams.get("owner_tenant_id")).toBe("is.null");

    const qualifications = await repository.listQualifications({
      supplier_id: SUPPLIER_ID,
      page: 2,
      pageSize: 20,
    });
    expect(qualifications.pagination).toEqual({
      page: 2,
      pageSize: 20,
      total: 21,
      totalPages: 2,
    });
    expect(new URL(requests[1]?.url ?? "http://invalid").pathname)
      .toEndWith("/rest/v1/suppliers");
    const childUrl = new URL(requests[2]?.url ?? "http://invalid");
    expect(childUrl.searchParams.get("offset")).toBe("20");
    expect(childUrl.searchParams.get("limit")).toBe("20");
    expect(childUrl.searchParams.get("supplier_id")).toBe(`eq.${SUPPLIER_ID}`);
    expect(requests[2]?.headers.get("prefer")).toContain("count=exact");
  });

  test("includes universal types and targets every supplier-owned child by id", async () => {
    const rows = {
      supplier_qualification_types: { ...qualificationTypeRow,
        applicable_supplier_types: [] },
      supplier_qualifications: qualificationRow,
      supplier_service_regions: serviceRegionRow,
      supplier_addresses: addressRow,
      supplier_contacts: contactRow,
    };
    const { repository, requests } = await createRepository((request) => {
      if (request.url.includes("/suppliers?")) return { body: supplierDetailRow };
      const table = Object.keys(rows).find((name) => request.url.includes(name));
      const row = rows[table as keyof typeof rows];
      return { body: request.headers.get("prefer")?.includes("count=exact") ? [row] : row };
    });
    const types = await repository.listQualificationTypes({
      supplier_type: "manufacturer", page: 1, pageSize: 20,
    });
    expect(types.list[0]?.applicable_supplier_types).toEqual([]);
    expect((await repository.findQualificationTypeById(TYPE_ID))?.id).toBe(TYPE_ID);
    await repository.findQualificationByIdForSupplier(SUPPLIER_ID, QUALIFICATION_ID);
    await repository.findServiceRegionByIdForSupplier(SUPPLIER_ID, QUALIFICATION_ID);
    await repository.findAddressByIdForSupplier(SUPPLIER_ID, QUALIFICATION_ID);
    await repository.findContactByIdForSupplier(SUPPLIER_ID, QUALIFICATION_ID);
    const typeListUrl = new URL(requests[0]?.url ?? "http://invalid");
    expect(typeListUrl.searchParams.get("or")).toBe(
      "(applicable_supplier_types.eq.{},applicable_supplier_types.cs.{manufacturer})",
    );
    expect(typeListUrl.searchParams.has("applicable_supplier_types")).toBe(false);
    expect(new URL(requests[1]?.url ?? "http://invalid").searchParams.get("id"))
      .toBe(`eq.${TYPE_ID}`);
    for (const request of requests.filter((item) =>
      Object.keys(rows).some((table) => item.url.includes(table)) &&
      !item.url.includes("supplier_qualification_types")
    )) {
      const url = new URL(request.url);
      expect(url.searchParams.get("id")).toBe(`eq.${QUALIFICATION_ID}`);
      expect(url.searchParams.get("supplier_id")).toBe(`eq.${SUPPLIER_ID}`);
      expect(url.searchParams.get("select")).not.toContain("*");
    }
  });

  test("paginates regions, addresses, contacts, and events independently", async () => {
    const rows = {
      supplier_service_regions: serviceRegionRow,
      supplier_addresses: addressRow,
      supplier_contacts: contactRow,
      supplier_command_events: eventRow,
    };
    const { repository, requests } = await createRepository((request) => {
      if (request.url.includes("/suppliers?")) return { body: supplierDetailRow };
      const table = Object.keys(rows).find((name) => request.url.includes(name));
      return { body: [rows[table as keyof typeof rows]], count: 35 };
    });
    const page = { supplier_id: SUPPLIER_ID, page: 3, pageSize: 10 };
    const calls = [
      () => repository.listServiceRegions(page),
      () => repository.listAddresses(page),
      () => repository.listContacts(page),
      () => repository.listEvents(page),
    ];
    for (const [index, call] of calls.entries()) {
      const result = await call();
      expect(result.pagination).toEqual({
        page: 3, pageSize: 10, total: 35, totalPages: 4,
      });
      const preflight = new URL(requests[index * 2]?.url ?? "http://invalid");
      expect(preflight.pathname).toEndWith("/rest/v1/suppliers");
      const url = new URL(requests[index * 2 + 1]?.url ?? "http://invalid");
      expect(url.searchParams.get("offset")).toBe("20");
      expect(url.searchParams.get("limit")).toBe("10");
      expect(requests[index * 2 + 1]?.headers.get("prefer"))
        .toContain("count=exact");
    }
  });

  test("wraps invalid rows and Supabase failures as database errors", async () => {
    const invalid = await createRepository(() => ({ body: [{}] }));
    await expect(invalid.repository.listQualificationTypes({
      page: 1, pageSize: 20,
    })).rejects.toMatchObject({ code: "DB_ERROR" });
    const failed = await createRepository(() => ({
      body: { code: "42P01", message: "missing relation", details: null, hint: null },
      status: 400,
    }));
    await expect(failed.repository.listAddresses({
      supplier_id: SUPPLIER_ID, page: 1, pageSize: 20,
    })).rejects.toMatchObject({ code: "DB_ERROR" });
  });

  test("uses optimistic version filters for profile updates", async () => {
    const { repository, requests } = await createRepository(() => ({
      body: { ...supplierDetailRow, name: "更新后的供应商", version: 3 },
    }));

    const result = await repository.updateSupplier({
      supplier_id: SUPPLIER_ID,
      expected_version: 2,
      name: "更新后的供应商",
      updated_by_employee_id: ACTOR_EMPLOYEE_ID,
    });

    expect(result).toMatchObject({ status: "updated", version: 3 });
    expect(requests).toHaveLength(1);
    expect(requests[0]?.method).toBe("PATCH");
    const url = new URL(requests[0]?.url ?? "http://invalid");
    expect(url.searchParams.get("id")).toBe(`eq.${SUPPLIER_ID}`);
    expect(url.searchParams.get("version")).toBe("eq.2");
    expect(url.searchParams.get("ownership_scope")).toBe("eq.platform");
    expect(url.searchParams.get("owner_tenant_id")).toBe("is.null");
    expect(await requests[0]?.clone().json()).toEqual({
      name: "更新后的供应商",
      updated_by_employee_id: ACTOR_EMPLOYEE_ID,
      version: 3,
    });
  });

  test("calls the three supplier command RPCs with migration-exact payloads", async () => {
    const { repository, requests } = await createRepository((request) => {
      if (request.url.includes("review_supplier_qualification")) {
        return {
          body: {
            status: "updated",
            idempotent: false,
            qualification: { ...qualificationRow, verification_status: "verified", version: 2 },
            previous_qualification: qualificationRow,
            version: 2,
          },
        };
      }
      return {
        body: {
          status: request.url.includes("create_platform_supplier")
            ? "created"
            : "updated",
          idempotent: false,
          supplier: supplierDetailRow,
          ...(request.url.includes("mutate_platform_supplier")
            ? { previous_supplier: { ...supplierDetailRow, version: 1 } } : {}),
          version: 1,
        },
      };
    });
    const context = {
      actor_user_id: ACTOR_USER_ID,
      actor_employee_id: ACTOR_EMPLOYEE_ID,
      idempotency_key: "command-1",
    };

    await repository.createSupplier({
      supplier_id: SUPPLIER_ID,
      code: "SUP-001",
      name: "晴天建材",
      legal_name: "晴天建材有限公司",
      unified_social_credit_code: null,
      supplier_type: "manufacturer",
      ...context,
    });
    const mutated = await repository.mutateSupplier({
      supplier_id: SUPPLIER_ID,
      action: "approve",
      expected_version: 1,
      ...context,
    });
    const reviewed = await repository.reviewQualification({
      supplier_id: SUPPLIER_ID,
      qualification_id: QUALIFICATION_ID,
      verification_status: "verified",
      expected_version: 1,
      ...context,
    });
    expect(mutated).toMatchObject({ previous_supplier: { version: 1 } });
    expect(reviewed).toMatchObject({ previous_qualification: { version: 1 } });

    expect(requests.map((request) => new URL(request.url).pathname)).toEqual([
      "/rest/v1/rpc/create_platform_supplier",
      "/rest/v1/rpc/mutate_platform_supplier_guarded",
      "/rest/v1/rpc/review_supplier_qualification_guarded",
    ]);
    expect(await requests[0]?.clone().json()).toEqual({
      p_supplier_id: SUPPLIER_ID,
      p_code: "SUP-001",
      p_name: "晴天建材",
      p_legal_name: "晴天建材有限公司",
      p_unified_social_credit_code: null,
      p_supplier_type: "manufacturer",
      p_expected_version: 0,
      p_actor_user_id: ACTOR_USER_ID,
      p_actor_employee_id: ACTOR_EMPLOYEE_ID,
      p_idempotency_key: "command-1",
    });
    expect(await requests[1]?.clone().json()).toEqual({
      p_supplier_id: SUPPLIER_ID,
      p_action: "approve",
      p_expected_version: 1,
      p_actor_user_id: ACTOR_USER_ID,
      p_actor_employee_id: ACTOR_EMPLOYEE_ID,
      p_idempotency_key: "command-1",
      p_reason: null,
    });
    expect(await requests[2]?.clone().json()).toEqual({
      p_supplier_id: SUPPLIER_ID,
      p_qualification_id: QUALIFICATION_ID,
      p_verification_status: "verified",
      p_expected_version: 1,
      p_actor_user_id: ACTOR_USER_ID,
      p_actor_employee_id: ACTOR_EMPLOYEE_ID,
      p_idempotency_key: "command-1",
      p_reason: null,
    });
  });

  test("scopes child updates by supplier without allowing re-parenting", async () => {
    const rows = {
      supplier_qualifications: { ...qualificationRow, version: 2 },
      supplier_service_regions: { ...serviceRegionRow, version: 2 },
      supplier_addresses: { ...addressRow, version: 2 },
      supplier_contacts: { ...contactRow, version: 2 },
    };
    const { repository, requests } = await createRepository((request) => {
      if (request.url.includes("/suppliers?")) return { body: supplierDetailRow };
      const table = Object.keys(rows).find((name) => request.url.includes(name));
      return { body: rows[table as keyof typeof rows] };
    });
    const audit = { supplier_id: SUPPLIER_ID, expected_version: 1,
      updated_by_employee_id: ACTOR_EMPLOYEE_ID };
    await repository.updateQualification({
      ...audit, qualification_id: QUALIFICATION_ID, certificate_no: "CERT-NEW",
    });
    await repository.upsertServiceRegion({
      ...audit, region_id: QUALIFICATION_ID, status: "inactive",
    });
    await repository.upsertAddress({
      ...audit, address_id: QUALIFICATION_ID, status: "inactive",
    });
    await repository.upsertContact({
      ...audit, contact_id: QUALIFICATION_ID, name: "李四",
    });
    const updates = requests.filter((request) => request.method === "PATCH");
    expect(updates).toHaveLength(4);
    for (const request of updates) {
      const url = new URL(request.url);
      expect(request.method).toBe("PATCH");
      expect(url.searchParams.get("id")).toBe(`eq.${QUALIFICATION_ID}`);
      expect(url.searchParams.get("supplier_id")).toBe(`eq.${SUPPLIER_ID}`);
      expect(url.searchParams.get("version")).toBe("eq.1");
      expect(await request.clone().json()).not.toHaveProperty("supplier_id");
    }
  });

  test("hides tenant-private suppliers from platform detail and children", async () => {
    const { repository, requests } = await createRepository(() => ({
      body: null,
    }));

    expect(await repository.findSupplierById(SUPPLIER_ID)).toBeNull();
    await expect(repository.listQualifications({
      supplier_id: SUPPLIER_ID,
      page: 1,
      pageSize: 20,
    })).rejects.toMatchObject({
      statusCode: 404,
      code: "SUPPLIER_NOT_FOUND",
    });
    for (const request of requests) {
      const url = new URL(request.url);
      expect(url.pathname).toEndWith("/rest/v1/suppliers");
      expect(url.searchParams.get("ownership_scope")).toBe("eq.platform");
      expect(url.searchParams.get("owner_tenant_id")).toBe("is.null");
    }
  });

  test("maps guarded private supplier commands to a stable not-found error", async () => {
    const guarded = await createRepository(() => ({ status: 400,
      body: { code: "P0001", message: "SUPPLIER_NOT_FOUND" } }));
    await expect(guarded.repository.mutateSupplier({
      supplier_id: SUPPLIER_ID, action: "submit", expected_version: 1,
      actor_user_id: ACTOR_USER_ID, actor_employee_id: ACTOR_EMPLOYEE_ID,
      idempotency_key: "private-platform-command",
    })).rejects.toMatchObject({ statusCode: 404, code: "SUPPLIER_NOT_FOUND" });
  });
});

const supplierListRow = {
  id: SUPPLIER_ID, code: "SUP-001", name: "晴天建材",
  legal_name: "晴天建材有限公司", unified_social_credit_code: null,
  supplier_type: "manufacturer", onboarding_status: "approved",
  operational_status: "active", version: 2, created_at: NOW, updated_at: NOW,
};
const supplierDetailRow = { ...supplierListRow,
  legal_representative_name: null, registered_address_text: null,
  review_remark: null,
  reviewed_by_employee_id: null,
  reviewed_at: null,
  blacklisted_by_employee_id: null,
  blacklisted_at: null,
  blacklist_reason: null,
  created_by_employee_id: ACTOR_EMPLOYEE_ID,
  updated_by_employee_id: ACTOR_EMPLOYEE_ID,
};
const qualificationRow = {
  id: QUALIFICATION_ID,
  supplier_id: SUPPLIER_ID,
  qualification_type_id: TYPE_ID,
  document_file_id: QUALIFICATION_ID,
  certificate_no: "CERT-001",
  valid_from: "2026-01-01",
  valid_until: "2099-12-31",
  verification_status: "pending",
  verified_by_employee_id: null,
  verified_at: null,
  rejection_reason: null,
  version: 1,
  created_by_employee_id: ACTOR_EMPLOYEE_ID,
  updated_by_employee_id: ACTOR_EMPLOYEE_ID,
  created_at: NOW,
  updated_at: NOW,
};
const contactRow = {
  id: QUALIFICATION_ID,
  supplier_id: SUPPLIER_ID,
  contact_type: "primary",
  name: "张三",
  phone: null,
  email: null,
  is_public: true,
  is_primary: true,
  status: "active",
  version: 1,
  created_by_employee_id: ACTOR_EMPLOYEE_ID,
  updated_by_employee_id: ACTOR_EMPLOYEE_ID,
  created_at: NOW,
  updated_at: NOW,
};
const qualificationTypeRow = {
  id: TYPE_ID, code: "license", name: "营业执照",
  applicable_supplier_types: ["manufacturer"], warning_days: 30,
  is_required: true, blocks_new_orders: true, status: "active",
  sort_order: 10, version: 1, created_at: NOW, updated_at: NOW,
};
const serviceRegionRow = {
  id: QUALIFICATION_ID, supplier_id: SUPPLIER_ID, region_code: "411502",
  region_level: "district", status: "active", valid_from: null, valid_until: null,
  version: 1, created_by_employee_id: ACTOR_EMPLOYEE_ID,
  updated_by_employee_id: ACTOR_EMPLOYEE_ID, created_at: NOW, updated_at: NOW,
};
const addressRow = {
  id: QUALIFICATION_ID, supplier_id: SUPPLIER_ID, address_type: "registered",
  province: "河南省", city: "信阳市", district: "浉河区", region_code: "411502",
  address_detail: "测试路 1 号", longitude: null, latitude: null,
  is_default: true, status: "active", version: 1,
  created_by_employee_id: ACTOR_EMPLOYEE_ID,
  updated_by_employee_id: ACTOR_EMPLOYEE_ID, created_at: NOW, updated_at: NOW,
};
const eventRow = {
  id: QUALIFICATION_ID, tenant_id: null, resource_type: "supplier",
  resource_id: SUPPLIER_ID, command: "mutate_platform_supplier:submit",
  from_state: {}, to_state: {}, reason: null, actor_user_id: ACTOR_USER_ID,
  actor_employee_id: ACTOR_EMPLOYEE_ID, idempotency_key: "event-1",
  result_version: 2, created_at: NOW,
};
