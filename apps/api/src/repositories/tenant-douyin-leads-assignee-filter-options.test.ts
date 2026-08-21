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
type Result = { data: unknown; error: unknown; count?: number | null };
type Call = { method: string; args: unknown[] };

function clientWith(result: Result) {
  const calls: Call[] = [];
  return { calls, client: { rpc: mock((name: string, args: unknown) => {
    calls.push({ method: "rpc", args: [name, args] });
    return Promise.resolve(result);
  }) } };
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
