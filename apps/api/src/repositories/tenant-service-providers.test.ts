import { describe, expect, test } from "bun:test";
import { createClient } from "@supabase/supabase-js";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

describe("TenantServiceProvidersRepository", () => {
  test("uses the real Supabase RPC builder with exact count and range", async () => {
    const requests: Request[] = [];
    const fetchStub = (async (input: string | URL | Request, init?: RequestInit) => {
      const request = input instanceof Request
        ? input
        : new Request(input.toString(), init);
      requests.push(request);
      return new Response(JSON.stringify([visitorRow]), {
        status: 200,
        headers: {
          "content-type": "application/json",
          "content-range": "20-20/21",
        },
      });
    }) as typeof fetch;
    const client = createClient("http://127.0.0.1:54321", "test-key", {
      global: { fetch: fetchStub },
    });
    const { TenantServiceProvidersRepository } = await import(
      "./tenant-service-providers"
    );
    const repository = new TenantServiceProvidersRepository(
      () => client as never,
    );

    const result = await repository.listVisitorProviders({
      regionCodes: ["411502", "411500", "410000"],
      page: 2,
      pageSize: 20,
    });

    expect(result.pagination).toEqual({
      page: 2, pageSize: 20, total: 21, totalPages: 2,
    });
    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toContain("/rpc/list_visitor_local_service_providers");
    const requestUrl = new URL(requests[0]?.url ?? "http://invalid");
    expect(requestUrl.searchParams.get("offset")).toBe("20");
    expect(requestUrl.searchParams.get("limit")).toBe("20");
    expect(requests[0]?.headers.get("prefer")).toContain("count=exact");
    expect(await requests[0]?.clone().json()).toEqual({
      p_region_codes: ["411502", "411500", "410000"],
    });
  });
});

const visitorRow = {
  tenant_id: "00000000-0000-4000-8000-000000000101",
  public_name: "青田装饰",
  introduction: "本地家装服务",
  public_phone: "13912349000",
  address_province: "河南省",
  address_city: "信阳市",
  address_district: "浉河区",
  address_region_code: "411502",
  address: "东方红大道 1 号",
  address_latitude: 32.12,
  address_longitude: 114.08,
  matched_region_code: "411502",
};
