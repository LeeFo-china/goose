import { expect, mock, test } from "bun:test";

import { createCustomerProjectsPageDefinition } from "./page";

test("customer projects loads with customer API and opens details", async () => {
  const navigateToCustomerProjectDetail = mock(async () => undefined);
  const page = attachSetData(createCustomerProjectsPageDefinition({
    getApp: () => ({
      customerApi: {},
      customerSession: {
        hasCustomerProfile: () => true,
        clear: mock(() => undefined),
      },
    }),
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

test("customer projects redirects visitor sessions without fetching customer data", async () => {
  const fetchCustomerProjects = mock(async () => ({
    list: [project()],
    pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
  }));
  const navigateToPage = mock(async () => undefined);
  const page = attachSetData(createCustomerProjectsPageDefinition({
    getApp: () => ({
      customerApi: {},
      customerSession: {
        hasCustomerProfile: () => false,
        clear: mock(() => undefined),
      },
    }),
    fetchCustomerProjects,
    navigateToCustomerProjectDetail: mock(async () => undefined),
    navigateToPage,
    showToast: mock(() => undefined),
    stopPullDownRefresh: mock(() => undefined),
  } as never));

  page.onLoad();
  await Promise.resolve();

  expect(fetchCustomerProjects).not.toHaveBeenCalled();
  expect(navigateToPage).toHaveBeenCalledWith("pages/customer-login/index");
});

test("customer projects logout clears the session and returns to login", async () => {
  const clear = mock(() => undefined);
  const navigateToPage = mock(async () => undefined);
  const page = attachSetData(createCustomerProjectsPageDefinition({
    getApp: () => ({
      customerApi: {},
      customerSession: { hasCustomerProfile: () => true, clear },
    }),
    fetchCustomerProjects: mock(async () => ({
      list: [],
      pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
    })),
    navigateToCustomerProjectDetail: mock(async () => undefined),
    navigateToPage,
    showToast: mock(() => undefined),
    stopPullDownRefresh: mock(() => undefined),
  } as never));

  page.onLogout();
  await Promise.resolve();

  expect(clear).toHaveBeenCalledTimes(1);
  expect(navigateToPage).toHaveBeenCalledWith("pages/customer-login/index");
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
