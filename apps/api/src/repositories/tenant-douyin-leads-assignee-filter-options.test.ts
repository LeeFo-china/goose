import { beforeAll, describe, expect, mock, test } from "bun:test";

import { AppError } from "@/errors/app-error";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

let Repository: typeof import("./tenant-douyin-leads")
  .TenantDouyinLeadsRepository;

beforeAll(async () => {
  ({ TenantDouyinLeadsRepository: Repository } = await import(
    "./tenant-douyin-leads"
  ));
});

const TENANT_ID = "11111111-1111-4111-8111-111111111111";
const INACTIVE_ID = "77777777-7777-4777-8777-777777777777";
const SYSTEM_ADMIN_ID = "88888888-8888-4888-8888-888888888888";
const SELECTED_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
type Result = { data: unknown; error: unknown; count?: number | null };
type Call = { method: string; args: unknown[] };

function clientWith(result: Result,
  included: Result = { data: null, error: null }) {
  const calls: Call[] = [];
  class Query {
    private chain(method: string, args: unknown[]) {
      calls.push({ method, args });
      return this;
    }
    select(...args: unknown[]) { return this.chain("select", args); }
    eq(...args: unknown[]) { return this.chain("eq", args); }
    limit(...args: unknown[]) { return this.chain("limit", args); }
    maybeSingle() {
      calls.push({ method: "maybeSingle", args: [] });
      return Promise.resolve(included);
    }
  }
  return { calls, client: {
    rpc: mock((name: string, args: unknown) => {
      calls.push({ method: "rpc", args: [name, args] });
      return Promise.resolve(result);
    }),
    from: mock((table: string) => {
      calls.push({ method: "from", args: [table] });
      return new Query();
    }),
  } };
}

describe("TenantDouyinLeadsRepository assignee filter options", () => {
  test("paginates tenant historical employees without an active filter", async () => {
    const context = clientWith({ data: { data: { list: [
      { id: INACTIVE_ID, name: "历史顾问" },
    ], total: 121 } }, error: null });
    await expect(new Repository(context.client as never)
      .listAssigneeFilterOptions({ tenantId: TENANT_ID,
        visibleEmployeeIds: null, page: 2, pageSize: 100,
        keyword: "历史" })).resolves.toEqual({
      rows: [{ id: INACTIVE_ID, name: "历史顾问" }], total: 121,
    });
    expect(context.calls).toEqual([{ method: "rpc", args: [
      "list_tenant_douyin_lead_assignee_filter_options", {
        p_tenant_id: TENANT_ID, p_visible_employee_ids: null,
        p_page: 2, p_page_size: 100, p_keyword: "历史",
      },
    ] }]);
  });

  test("posts a large exact visible id set including system admins", async () => {
    const visibleEmployeeIds = Array.from({ length: 1_001 }, (_, index) =>
      `77777777-7777-4777-8777-${String(index).padStart(12, "0")}`);
    visibleEmployeeIds[0] = INACTIVE_ID;
    visibleEmployeeIds[1_000] = SYSTEM_ADMIN_ID;
    const context = clientWith({ data: { data: { list: [
      { id: INACTIVE_ID, name: null },
      { id: SYSTEM_ADMIN_ID, name: "系统管理员" },
    ], total: 2 } }, error: null });
    await new Repository(context.client as never).listAssigneeFilterOptions({
      tenantId: TENANT_ID,
      visibleEmployeeIds,
      page: 1, pageSize: 20,
    });
    expect(context.calls).toEqual([{ method: "rpc", args: [
      "list_tenant_douyin_lead_assignee_filter_options", {
        p_tenant_id: TENANT_ID, p_visible_employee_ids: visibleEmployeeIds,
        p_page: 1, p_page_size: 20, p_keyword: null,
      },
    ] }]);
  });

  test("restores a selected employee beyond the first hundred within the page bound", async () => {
    const pageRows = Array.from({ length: 100 }, (_, index) => ({
      id: `99999999-9999-4999-8999-${String(index).padStart(12, "0")}`,
      name: `员工${index}`,
    }));
    const context = clientWith({ data: { data: {
      list: pageRows, total: 121,
    } }, error: null }, { data: { id: SELECTED_ID, tenant_id: TENANT_ID,
      name: "第101位历史员工" }, error: null });
    const result = await new Repository(context.client as never)
      .listAssigneeFilterOptions({ tenantId: TENANT_ID,
        visibleEmployeeIds: null, page: 1, pageSize: 100,
        includeEmployeeId: SELECTED_ID });
    expect(result).toEqual({ rows: [{ id: SELECTED_ID,
      name: "第101位历史员工" }, ...pageRows.slice(0, 99)], total: 121 });
    expect(result.rows).toHaveLength(100);
    expect(context.calls[0]).toEqual({ method: "rpc", args: [
      "list_tenant_douyin_lead_assignee_filter_options", {
        p_tenant_id: TENANT_ID, p_visible_employee_ids: null,
        p_page: 1, p_page_size: 100, p_keyword: null,
      },
    ] });
    expect(context.calls.slice(1)).toEqual([
      { method: "from", args: ["employees"] },
      { method: "select", args: ["id,tenant_id,name"] },
      { method: "eq", args: ["tenant_id", TENANT_ID] },
      { method: "eq", args: ["id", SELECTED_ID] },
      { method: "limit", args: [1] },
      { method: "maybeSingle", args: [] },
    ]);
  });

  test("restores a selected employee despite keyword mismatch and keeps search total", async () => {
    const match = { id: SYSTEM_ADMIN_ID, name: "匹配员工" };
    const context = clientWith({ data: { data: { list: [match], total: 1 } },
      error: null }, { data: { id: SELECTED_ID, tenant_id: TENANT_ID,
        name: "不匹配员工" }, error: null });
    await expect(new Repository(context.client as never)
      .listAssigneeFilterOptions({ tenantId: TENANT_ID,
        visibleEmployeeIds: null, page: 1, pageSize: 20,
        keyword: "匹配", includeEmployeeId: SELECTED_ID }))
      .resolves.toEqual({ rows: [{ id: SELECTED_ID, name: "不匹配员工" }, match],
        total: 1 });
  });

  test("leaves the page unchanged when the selected employee is missing", async () => {
    const row = { id: INACTIVE_ID, name: "历史顾问" };
    const context = clientWith({ data: { data: { list: [row], total: 1 } },
      error: null });
    await expect(new Repository(context.client as never)
      .listAssigneeFilterOptions({ tenantId: TENANT_ID,
        visibleEmployeeIds: null, page: 1, pageSize: 20,
        includeEmployeeId: SELECTED_ID }))
      .resolves.toEqual({ rows: [row], total: 1 });
    expect(context.calls.filter((call) => call.method === "from")).toHaveLength(1);
  });

  test("accepts a nullable selected name and redacts invalid selected rows", async () => {
    const emptyPage = { data: { data: { list: [], total: 0 } }, error: null };
    await expect(new Repository(clientWith(emptyPage, { data: {
      id: SELECTED_ID, tenant_id: TENANT_ID, name: null,
    }, error: null }).client as never).listAssigneeFilterOptions({
      tenantId: TENANT_ID, visibleEmployeeIds: null,
      page: 1, pageSize: 20, includeEmployeeId: SELECTED_ID,
    })).resolves.toEqual({ rows: [{ id: SELECTED_ID, name: null }], total: 0 });

    for (const included of [
      { data: { id: SELECTED_ID, tenant_id: SYSTEM_ADMIN_ID, name: "跨租户" },
        error: null },
      { data: { id: INACTIVE_ID, tenant_id: TENANT_ID, name: "错误员工" },
        error: null },
      { data: { id: SELECTED_ID, tenant_id: TENANT_ID, name: 1 }, error: null },
      { data: null, error: { message: "selected-secret" } },
    ]) {
      await expect(new Repository(clientWith(emptyPage, included).client as never)
        .listAssigneeFilterOptions({ tenantId: TENANT_ID,
          visibleEmployeeIds: null, page: 1, pageSize: 20,
          includeEmployeeId: SELECTED_ID }))
        .rejects.toMatchObject({ statusCode: 500, code: "DB_ERROR",
          details: undefined });
    }
  });

  test("keeps database errors and malformed rows redacted", async () => {
    for (const result of [
      { data: { data: { list: [], total: null } }, error: null },
      { data: { data: { list: [{ id: "invalid", name: null }], total: 1 } },
        error: null },
      { data: { data: { list: Array.from({ length: 21 }, (_, index) => ({
        id: `99999999-9999-4999-8999-${String(index).padStart(12, "0")}`,
        name: `员工${index}`,
      })), total: 21 } }, error: null },
      { data: null, error: { message: "secret" }, count: null },
    ]) {
      try {
        await new Repository(clientWith(result).client as never)
          .listAssigneeFilterOptions({ tenantId: TENANT_ID,
            visibleEmployeeIds: null, page: 1, pageSize: 20 });
        throw new TypeError("expected rejection");
      } catch (error) {
        expect(error).toBeInstanceOf(AppError);
        expect(error).toMatchObject({ statusCode: 500, code: "DB_ERROR",
          details: undefined });
        expect(String((error as Error).message)).not.toContain("secret");
      }
    }
  });
});
