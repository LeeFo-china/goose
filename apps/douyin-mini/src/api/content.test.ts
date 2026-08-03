import { describe, expect, test } from "bun:test";
import { fetchCaseDetail, fetchCases } from "./cases";
import { fetchCompany } from "./company";
import { ApiClient, type TransportInput } from "./request";

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";

function clientWith(handler: (input: TransportInput) => unknown): ApiClient {
  return new ApiClient(
    { send: async (input) => handler(input) },
    {
      getAccessToken: async () => "test-token",
      refreshAfterUnauthorized: async () => "refreshed-token",
    },
  );
}

const project = {
  id: PROJECT_ID,
  title: "现代简约案例",
  cover_image_url: null,
  public_images: ["https://cdn.example.com/case.jpg", "http://unsafe.test/private.jpg"],
  style_tags: ["现代"],
  layout: "三室两厅",
  area: 120,
  budget_band: "20-30万",
  community: "示例花园",
  city: "郑州市",
  district: "金水区",
  status: "constructing",
  start_date: "2026-07-01",
  updated_at: "2026-07-20T00:00:00.000Z",
  description: "公开设计说明",
  customer_phone: "must-not-leak",
};

describe("Douyin public content API clients", () => {
  test("fetches and reconstructs only public company fields", async () => {
    const client = clientWith((input) => {
      expect(input.path).toBe("/douyin-mini/company");
      return {
        name: "示例装饰",
        logo_url: "https://cdn.example.com/logo.png",
        summary: "公司公开简介",
        service_phone: "4000000000",
        public_address: "公开门店地址",
        address_region: { province: "河南省", city: "郑州市", district: "金水区" },
        service_regions: [{ province: "河南省", city: "郑州市", district: "金水区" }],
        qualifications: [{ title: "示例资质", image_url: null }],
        tenant_id: "must-not-leak",
      };
    });

    const company = await fetchCompany(client);
    expect(company.name).toBe("示例装饰");
    expect(company).not.toHaveProperty("tenant_id");
  });

  test("uses bounded encoded filters and strips unsafe project media/private fields", async () => {
    const paths: string[] = [];
    const client = clientWith((input) => {
      paths.push(input.path);
      return input.path.includes(`/${PROJECT_ID}`)
        ? project
        : {
            items: [project],
            pagination: { page: 2, pageSize: 20, total: 21, totalPages: 2 },
          };
    });

    const result = await fetchCases(client, {
      page: 2,
      pageSize: 20,
      style: "现代 简约",
      layout: "三室两厅",
    });
    const detail = await fetchCaseDetail(client, PROJECT_ID);

    expect(paths).toEqual([
      "/douyin-mini/cases?page=2&pageSize=20&style=%E7%8E%B0%E4%BB%A3%20%E7%AE%80%E7%BA%A6&layout=%E4%B8%89%E5%AE%A4%E4%B8%A4%E5%8E%85",
      `/douyin-mini/cases/${PROJECT_ID}`,
    ]);
    expect(result.items[0]!.public_images).toEqual(["https://cdn.example.com/case.jpg"]);
    expect(detail).not.toHaveProperty("customer_phone");
  });

  test("rejects invalid IDs and malformed pagination responses", async () => {
    const malformed = clientWith(() => ({
      items: [project],
      pagination: { page: 1, pageSize: 200, total: 1, totalPages: 1 },
    }));

    await expect(fetchCases(malformed, { page: 1, pageSize: 20 }))
      .rejects.toMatchObject({ code: "INVALID_API_RESPONSE" });
    await expect(fetchCaseDetail(malformed, `${PROJECT_ID}?tenant_id=forged`))
      .rejects.toMatchObject({ code: "INVALID_CONTENT_ID" });
  });
});
