import { afterEach, expect, mock, test } from "bun:test";

import { DEFAULT_LEAD_FILTERS } from
  "@/components/douyin-miniapp/leads-workbench-logic";
import * as pageModule from "./page";

const EMPLOYEE_ID = "55555555-5555-4555-8555-555555555555";
const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("lead page restores the selected filter option during server loading", async () => {
  const loader = (pageModule as unknown as Record<string, unknown>)
    .loadInitialAssigneeFilterOptions;
  expect(typeof loader).toBe("function");
  if (typeof loader !== "function") return;
  const backendFetch = mock(async (_input: RequestInfo | URL,
    _init?: RequestInit) => Response.json({ data: {
    list: [{ id: EMPLOYEE_ID, name: "第 101 位负责人" }],
    pagination: { page: 1, pageSize: 100, total: 0, totalPages: 0 },
  } }));
  globalThis.fetch = backendFetch as unknown as typeof fetch;

  await expect(loader("admin-token", {
    ...DEFAULT_LEAD_FILTERS, assigneeId: EMPLOYEE_ID,
  })).resolves.toEqual({
    options: [{ value: EMPLOYEE_ID, label: "第 101 位负责人" }], hasMore: false,
  });
  expect(String(backendFetch.mock.calls[0]?.[0])).toContain(
    `assignee-filter-options?page=1&pageSize=100&includeEmployeeId=${EMPLOYEE_ID}`,
  );
  expect(backendFetch.mock.calls[0]?.[1]).toMatchObject({
    headers: { authorization: "Bearer admin-token" }, cache: "no-store",
  });
});

test("lead page keeps rendering when initial filter options fail", async () => {
  const loader = (pageModule as unknown as Record<string, unknown>)
    .loadInitialAssigneeFilterOptions;
  expect(typeof loader).toBe("function");
  if (typeof loader !== "function") return;
  const failedFetch = mock(async (_input: RequestInfo | URL,
    _init?: RequestInit): Promise<Response> => { throw new TypeError("offline"); });
  globalThis.fetch = failedFetch as unknown as typeof fetch;

  await expect(loader("admin-token", DEFAULT_LEAD_FILTERS)).resolves.toEqual({
    options: [], hasMore: false,
  });
});
