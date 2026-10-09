import { describe, expect, mock, test } from "bun:test";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const id = (i: number) => `10000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
const row = (tenant_id: string) => ({
  tenant_id, status: "collecting" as const, collection_started_at: "2026-10-09T08:00:00+00:00",
  window_start: "2026-10-02T16:00:00+00:00", window_end: "2026-10-09T09:00:00+00:00",
  observed_days: 1, last_active_at: null, active_employee_count: 0,
  admin_active_employee_count: 0, mini_active_employee_count: 0, active_days: 0,
  admin_login_count: 0, mini_login_count: 0,
  business_actions: { customer_created: 0, follow_up_created: 0, project_created: 0,
    construction_log_created: 0, acceptance_handled: 0 },
});

describe("tenant activity RPC boundary", () => {
  test.each([20, 100])("maps %i summaries with one batch and strips tenant_id", async (count) => {
    const { TenantActivityRepository } = await import("./tenant-activity");
    const ids = Array.from({ length: count }, (_, i) => id(i));
    const rpc = mock(async () => ({ data: ids.map(row), error: null }));
    const repository = new TenantActivityRepository(() => ({ rpc }));
    const summaries = await repository.listSummaries(ids);
    expect(summaries.size).toBe(count);
    const { tenant_id, ...expected } = row(id(0));
    expect(summaries.get(id(0))).toEqual(expected);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("get_tenant_activity_summaries", { p_tenant_ids: ids });
  });

  test("bounds input and skips empty requests", async () => {
    const { TenantActivityRepository } = await import("./tenant-activity");
    const rpc = mock(async () => ({ data: [row(id(1))], error: null }));
    const repository = new TenantActivityRepository(() => ({ rpc }));
    expect((await repository.listSummaries([])).size).toBe(0);
    await expect(repository.listSummaries(Array.from({ length: 101 }, (_, i) => id(i))))
      .rejects.toMatchObject({ statusCode: 400 });
    expect(rpc).not.toHaveBeenCalled();
    expect((await repository.listSummaries([id(1), id(1)])).size).toBe(1);
    expect(rpc).toHaveBeenCalledWith("get_tenant_activity_summaries", { p_tenant_ids: [id(1)] });
  });

  test.each([
    { data: null, error: null }, { data: [], error: null },
    { data: [row(id(2))], error: null }, { data: [row(id(1)), row(id(1))], error: null },
    { data: [{ ...row(id(1)), active_days: -1 }], error: null },
    { data: [{ ...row(id(1)), status: "ready", observed_days: 0 }], error: null },
    { data: [{ ...row(id(1)), collection_started_at: null }], error: null },
    { data: [row(id(1))], error: { message: "private database details" } },
  ])("rejects invalid/missing/foreign summaries without inventing zero", async (response) => {
    const { TenantActivityRepository } = await import("./tenant-activity");
    const repository = new TenantActivityRepository(() => ({ rpc: async () => response }));
    await expect(repository.listSummaries([id(1)])).rejects.toMatchObject({ code: "DB_ERROR" });
  });

  test("accepts a not-yet-started collecting summary with null metrics", async () => {
    const { TenantActivityRepository } = await import("./tenant-activity");
    const empty = { ...row(id(1)), collection_started_at: null, observed_days: 0,
      window_start: null, window_end: null, active_employee_count: null,
      admin_active_employee_count: null, mini_active_employee_count: null, active_days: null,
      admin_login_count: null, mini_login_count: null, business_actions: null };
    const repository = new TenantActivityRepository(() => ({ rpc: async () => ({ data: [empty], error: null }) }));
    expect((await repository.listSummaries([id(1)])).get(id(1))?.collection_started_at).toBeNull();
  });

  test("forwards stable event identifiers and preserves false duplicate result", async () => {
    const { TenantActivityRepository } = await import("./tenant-activity");
    const rpc = mock(async () => ({ data: false, error: null }));
    const repository = new TenantActivityRepository(() => ({ rpc }));
    expect(await repository.record({ tenantId: id(1), employeeId: id(2), channel: "admin_web",
      kind: "view", eventKey: "view:customers:window-1" })).toBe(false);
    expect(rpc).toHaveBeenCalledWith("record_tenant_activity", {
      p_tenant_id: id(1), p_employee_id: id(2), p_channel: "admin_web",
      p_kind: "view", p_event_key: "view:customers:window-1",
    });
  });

  test.each([null, "true", 1])("rejects invalid record result", async (data) => {
    const { TenantActivityRepository } = await import("./tenant-activity");
    const repository = new TenantActivityRepository(() => ({ rpc: async () => ({ data, error: null }) }));
    await expect(repository.record({ tenantId: id(1), employeeId: id(2), channel: "wechat_mini",
      kind: "login", eventKey: "session-id" })).rejects.toMatchObject({ code: "DB_ERROR" });
  });

  test("wraps rejected transport errors without retaining their details", async () => {
    const { TenantActivityRepository } = await import("./tenant-activity");
    const repository = new TenantActivityRepository(() => ({ rpc: async () => { throw "private transport error"; } }));
    await expect(repository.listSummaries([id(1)])).rejects.toMatchObject({ code: "DB_ERROR" });
    await expect(repository.record({ tenantId: id(1), employeeId: id(2), channel: "admin_web",
      kind: "login", eventKey: "session-id" })).rejects.toMatchObject({ code: "DB_ERROR" });
  });
});
