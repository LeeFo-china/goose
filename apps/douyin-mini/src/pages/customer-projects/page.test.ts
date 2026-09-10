import { expect, mock, test } from "bun:test";

import { createCustomerProjectsPageDefinition } from "./page";

test("customer projects loads with customer API and opens details", async () => {
  const navigateToCustomerProjectDetail = mock(async () => undefined);
  const page = attachSetData(createCustomerProjectsPageDefinition({
    getApp: () => ({ customerApi: {} }),
    fetchCustomerProjects: mock(async () => ({
      list: [project()],
      pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
    })),
    navigateToCustomerProjectDetail,
    navigateToPage: mock(async () => undefined),
    showToast: mock(() => undefined),
    stopPullDownRefresh: mock(() => undefined),
  } as never));

  await page.load("refresh");
  page.onProjectSelect({ currentTarget: { dataset: { id: project().id } } });

  expect(page.data.items).toHaveLength(1);
  expect(navigateToCustomerProjectDetail).toHaveBeenCalledWith(project().id);
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
    id: "11111111-1111-4111-8111-111111111111",
    name: "湖畔花园装修",
    status: "constructing",
    status_label: "施工中",
    budget: 320000,
    address: "湖畔花园",
    start_date: "2026-09-01",
    style_tags: ["现代"],
    property: { community: "湖畔花园", layout: "三室两厅", area: 120 },
    recent_logs: [],
  };
}
