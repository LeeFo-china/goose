import { beforeAll, beforeEach, expect, mock, test } from "bun:test";
const limit = mock(async (_size: number): Promise<{ data: Array<{ id: string; name: string }> | null; error: unknown }> => ({ data: [{ id: "operator", name: "风清扬" }], error: null }));
const query = { select: mock((_fields: string) => query), eq: mock((_field: string, _value: string) => query), in: mock((_field: string, _value: string[]) => query), limit };
const from = mock((_table: string) => query);
mock.module("@/utils/supabase/index", () => ({ SupabaseDB: { getAdminClient: () => ({ from }) } }));
let repository: typeof import("./tenant-owner-dashboard-workflow").tenantOwnerDashboardWorkflowRepository;
beforeAll(async () => {
  repository = (await import("./tenant-owner-dashboard-workflow")).tenantOwnerDashboardWorkflowRepository;
});
beforeEach(() => { from.mockClear(); limit.mockClear(); query.in.mockClear(); });
test("names use tenant isolation, necessary fields and bounded deduplicated batches", async () => {
  const ids = Array.from({ length: 101 }, (_, i) => `employee-${i}`);
  await repository.listCompletionEmployees({ tenantId: "tenant-a", employeeIds: [...ids, ids[0]!] });
  expect(from).toHaveBeenCalledTimes(2);
  expect(from).toHaveBeenCalledWith("employees");
  expect(query.select).toHaveBeenCalledWith("id, name");
  expect(query.eq).toHaveBeenCalledWith("tenant_id", "tenant-a");
  expect(limit.mock.calls.map(([size]) => size)).toEqual([100, 1]);
  expect(query.in.mock.calls.map(([, batch]) => batch).flat()).toEqual(ids);
});
test("no employees means no query", async () => {
  expect(await repository.listCompletionEmployees({ tenantId: "tenant-a", employeeIds: [] })).toEqual([]);
  expect(from).not.toHaveBeenCalled();
});
test("database error is not treated as missing historical evidence", async () => {
  limit.mockResolvedValueOnce({ data: null, error: { message: "unavailable" } });
  await expect(repository.listCompletionEmployees({ tenantId: "tenant-a", employeeIds: ["operator"] })).rejects.toThrow("批量查询甘特图节点完成人失败");
});
