import { describe, expect, test } from "bun:test";
import { ApiClient, type TransportInput } from "./request";
import { fetchSiteDetail, fetchSiteLogs, fetchSites } from "./sites";

const SITE_ID = "11111111-1111-4111-8111-111111111111";
const LOG_ID = "22222222-2222-4222-8222-222222222222";

function clientWith(handler: (input: TransportInput) => unknown): ApiClient {
  return new ApiClient(
    { send: async (input) => handler(input) },
    {
      getAccessToken: async () => "test-token",
      refreshAfterUnauthorized: async () => "refreshed-token",
    },
  );
}

const site = {
  id: SITE_ID,
  title: "示例工地",
  cover_image_url: null,
  public_images: [],
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
  description: null,
};

describe("Douyin public site API clients", () => {
  test("uses bounded list/detail/log routes and reconstructs public fields", async () => {
    const paths: string[] = [];
    const client = clientWith((input) => {
      paths.push(input.path);
      if (input.path.endsWith("/logs?page=1&pageSize=20")) {
        return {
          items: [{
            id: LOG_ID,
            stage_code: "water-electric",
            node_name: "水电施工",
            images: ["https://cdn.example.com/site.jpg", "http://unsafe.test/private.jpg"],
            created_at: "2026-07-20T08:00:00.000Z",
            owner_phone: "must-not-leak",
          }],
          pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
        };
      }
      if (input.path === `/douyin-mini/sites/${SITE_ID}`) return { ...site, address: "1号楼101" };
      return {
        items: [site],
        pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
      };
    });

    const list = await fetchSites(client, { page: 1, pageSize: 20 });
    const detail = await fetchSiteDetail(client, SITE_ID);
    const logs = await fetchSiteLogs(client, SITE_ID, { page: 1, pageSize: 20 });

    expect(paths).toEqual([
      "/douyin-mini/sites?page=1&pageSize=20",
      `/douyin-mini/sites/${SITE_ID}`,
      `/douyin-mini/sites/${SITE_ID}/logs?page=1&pageSize=20`,
    ]);
    expect(list.items[0]!.community).toBe("示例花园");
    expect(detail).not.toHaveProperty("address");
    expect(logs.items[0]!.images).toEqual(["https://cdn.example.com/site.jpg"]);
    expect(logs.items[0]).not.toHaveProperty("owner_phone");
  });

  test("rejects forged IDs and inconsistent log pagination", async () => {
    const malformed = clientWith(() => ({
      items: [], pagination: { page: 2, pageSize: 20, total: 0, totalPages: 0 },
    }));
    await expect(fetchSiteDetail(malformed, `${SITE_ID}?tenant_id=forged`))
      .rejects.toMatchObject({ code: "INVALID_CONTENT_ID" });
    await expect(fetchSiteLogs(malformed, SITE_ID, { page: 1, pageSize: 20 }))
      .rejects.toMatchObject({ code: "INVALID_API_RESPONSE" });
  });
});
