import { describe, expect, test } from "bun:test";
import { ApiClient, type TransportInput } from "./request";
import {
  fetchProjectDetail,
  fetchProjectLogs,
  fetchProjects,
} from "./projects";

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_PROJECT_ID = "22222222-2222-4222-8222-222222222222";
const LOG_ID = "33333333-3333-4333-8333-333333333333";

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
  title: "现代简约实景",
  phase: "in_progress",
  cover_image_url: "https://cdn.example.com/cover.jpg",
  public_images: ["https://cdn.example.com/cover.jpg"],
  style_tags: ["现代", "简约"],
  layout: "三室两厅",
  area: 120,
  budget_band: "30-50万",
  community: "示例花园",
  city: "郑州市",
  district: "金水区",
  start_date: "2026-07-01",
  updated_at: "2026-07-20T00:00:00.000Z",
  description: "明亮通透的现代简约空间",
  customer_phone: "must-not-leak",
};

describe("Douyin unified public project API client", () => {
  test("uses bounded encoded phase/style/layout filters and validates pagination echo", async () => {
    const paths: string[] = [];
    const client = clientWith((input) => {
      paths.push(input.path);
      return {
        items: [project],
        pagination: { page: 2, pageSize: 20, total: 21, totalPages: 2 },
      };
    });

    const result = await fetchProjects(client, {
      page: 2,
      pageSize: 20,
      phase: "in_progress",
      style: "现代 简约",
      layout: "三室两厅",
    });

    expect(paths).toEqual([
      "/douyin-mini/projects?page=2&pageSize=20&phase=in_progress&style=%E7%8E%B0%E4%BB%A3%20%E7%AE%80%E7%BA%A6&layout=%E4%B8%89%E5%AE%A4%E4%B8%A4%E5%8E%85",
    ]);
    expect(result.items[0]).toMatchObject({ id: PROJECT_ID, phase: "in_progress" });
    expect(result.items[0]).not.toHaveProperty("customer_phone");

    const malformed = clientWith(() => ({
      items: [project],
      pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
    }));
    await expect(fetchProjects(malformed, { page: 2, pageSize: 20 }))
      .rejects.toMatchObject({ code: "INVALID_API_RESPONSE" });
  });

  test("rejects invalid project queries before sending a request", async () => {
    const requests: TransportInput[] = [];
    const client = clientWith((input) => {
      requests.push(input);
      return null;
    });

    await expect(fetchProjects(client, { page: 0, pageSize: 20 }))
      .rejects.toMatchObject({ code: "INVALID_CONTENT_QUERY" });
    await expect(fetchProjects(client, {
      page: 1,
      pageSize: 20,
      phase: "started" as never,
    })).rejects.toMatchObject({ code: "INVALID_CONTENT_QUERY" });
    await expect(fetchProjects(client, {
      page: 1,
      pageSize: 20,
      style: "x".repeat(41),
    })).rejects.toMatchObject({ code: "INVALID_CONTENT_QUERY" });
    expect(requests).toHaveLength(0);
  });

  test("validates detail IDs and requires the response ID to match", async () => {
    const paths: string[] = [];
    const client = clientWith((input) => {
      paths.push(input.path);
      return project;
    });

    await expect(fetchProjectDetail(client, PROJECT_ID)).resolves.toMatchObject({
      id: PROJECT_ID,
      phase: "in_progress",
    });
    await expect(fetchProjectDetail(client, `${PROJECT_ID}?tenant_id=forged`))
      .rejects.toMatchObject({ code: "INVALID_CONTENT_ID" });
    await expect(fetchProjectDetail(client, OTHER_PROJECT_ID))
      .rejects.toMatchObject({ code: "INVALID_API_RESPONSE" });
    expect(paths).toEqual([
      `/douyin-mini/projects/${PROJECT_ID}`,
      `/douyin-mini/projects/${OTHER_PROJECT_ID}`,
    ]);
  });

  test("uses the unified paginated logs route and checks pagination echo", async () => {
    const paths: string[] = [];
    const client = clientWith((input) => {
      paths.push(input.path);
      return {
        items: [{
          id: LOG_ID,
          stage_code: "water-electric",
          node_name: "水电施工",
          images: ["https://cdn.example.com/progress.jpg"],
          created_at: "2026-07-20T08:00:00.000Z",
        }],
        pagination: { page: 2, pageSize: 10, total: 11, totalPages: 2 },
      };
    });

    const result = await fetchProjectLogs(client, PROJECT_ID, { page: 2, pageSize: 10 });
    expect(paths).toEqual([
      `/douyin-mini/projects/${PROJECT_ID}/logs?page=2&pageSize=10`,
    ]);
    expect(result.items[0]).toMatchObject({ id: LOG_ID, node_name: "水电施工" });

    const malformed = clientWith(() => ({
      items: [], pagination: { page: 1, pageSize: 10, total: 0, totalPages: 0 },
    }));
    await expect(fetchProjectLogs(malformed, PROJECT_ID, { page: 2, pageSize: 10 }))
      .rejects.toMatchObject({ code: "INVALID_API_RESPONSE" });
  });
});
