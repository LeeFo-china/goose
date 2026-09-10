import { expect, mock, test } from "bun:test";

import { createCustomerProjectDetailPageDefinition } from "./page";

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";

test("customer project detail loads project and all construction logs", async () => {
  const fetchLogs = mock(async () => ({
    list: [log()],
    pagination: { page: 1, pageSize: 10, total: 1, totalPages: 1 },
  }));
  const page = attachSetData(createCustomerProjectDetailPageDefinition({
    getApp: () => ({ customerApi: {} }),
    fetchCustomerProjectDetail: mock(async () => project()),
    fetchCustomerProjectLogs: fetchLogs,
    showToast: mock(() => undefined),
    stopPullDownRefresh: mock(() => undefined),
  } as never));

  await page.load(PROJECT_ID, "refresh");

  expect(page.data.project?.id).toBe(PROJECT_ID);
  expect(page.data.logs).toHaveLength(1);
  expect(fetchLogs).toHaveBeenCalledWith({}, PROJECT_ID, { page: 1, pageSize: 10 });
});

function attachSetData<T extends { data: Record<string, unknown> }>(definition: T) {
  return Object.assign(definition, {
    setData(patch: Record<string, unknown>) {
      Object.assign(definition.data, patch);
    },
  });
}

function project() {
  return {
    id: PROJECT_ID,
    name: "湖畔花园装修",
    status: "constructing",
    status_label: "施工中",
    budget: 320000,
    address: "湖畔花园",
    start_date: "2026-09-01",
    style_tags: ["现代"],
    property: { community: "湖畔花园", layout: "三室两厅", area: 120 },
  };
}

function log() {
  return {
    id: "22222222-2222-4222-8222-222222222222",
    project_id: PROJECT_ID,
    employee_name: "王工",
    stage_label: "水电",
    node_name: "水电施工",
    content: "水管走向确认完成",
    images: ["https://cdn.example.com/log.jpg"],
    image_count: 1,
    created_at: "2026-09-10T08:00:00.000Z",
  };
}
