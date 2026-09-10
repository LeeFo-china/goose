import { describe, expect, test } from "bun:test";

import { ApiClient, type TransportInput } from "./request";
import {
  fetchCustomerProjectDetail,
  fetchCustomerProjectLogs,
  fetchCustomerProjects,
} from "./customer";

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";

function clientWith(handler: (input: TransportInput) => unknown): ApiClient {
  return new ApiClient(
    { send: async (input) => handler(input) },
    {
      getAccessToken: async () => "customer-token",
      refreshAfterUnauthorized: async () => "refreshed-customer-token",
    },
  );
}

describe("Douyin customer project API client", () => {
  test("uses customer routes for projects, detail, and all logs", async () => {
    const calls: TransportInput[] = [];
    const client = clientWith((input) => {
      calls.push(input);
      if (input.path.startsWith("/customer/projects/") && input.path.endsWith("/logs?page=2&pageSize=10")) {
        return {
          list: [customerLog()],
          pagination: { page: 2, pageSize: 10, total: 11, totalPages: 2 },
        };
      }
      if (input.path === `/customer/projects/${PROJECT_ID}`) return customerProject();
      return {
        list: [customerProject()],
        pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
      };
    });

    await expect(fetchCustomerProjects(client, { page: 1, pageSize: 20 }))
      .resolves.toMatchObject({ list: [{ id: PROJECT_ID }] });
    await expect(fetchCustomerProjectDetail(client, PROJECT_ID))
      .resolves.toMatchObject({ id: PROJECT_ID });
    await expect(fetchCustomerProjectLogs(client, PROJECT_ID, { page: 2, pageSize: 10 }))
      .resolves.toMatchObject({ list: [{ project_id: PROJECT_ID }] });

    expect(calls.map((item) => `${item.method} ${item.path}`)).toEqual([
      "GET /customer/projects?page=1&pageSize=20",
      `GET /customer/projects/${PROJECT_ID}`,
      `GET /customer/projects/${PROJECT_ID}/logs?page=2&pageSize=10`,
    ]);
  });
});

function customerProject() {
  return {
    id: PROJECT_ID,
    name: "湖畔花园装修",
    status: "constructing",
    status_label: "施工中",
    budget: 320000,
    address: "湖畔花园 3-1201",
    start_date: "2026-09-01",
    style_tags: ["现代"],
    workflow_state: { current_node_title: "水电施工" },
    property: { community: "湖畔花园", layout: "三室两厅", area: 120 },
    recent_logs: [],
  };
}

function customerLog() {
  return {
    id: "22222222-2222-4222-8222-222222222222",
    project_id: PROJECT_ID,
    employee_name: "王工",
    stage_label: "水电",
    node_name: "水电施工",
    content: "水管走向确认完成",
    images: ["https://cdn.example.com/log.jpg"],
    image_items: [],
    image_count: 1,
    created_at: "2026-09-10T08:00:00.000Z",
    comment_count: 0,
    rating_count: 0,
    average_rating: null,
    my_rating: null,
  };
}
