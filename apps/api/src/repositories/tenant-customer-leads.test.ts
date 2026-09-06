import { expect, mock, test } from "bun:test";
import type { TenantDouyinLeadsDatabaseClient } from "./tenant-douyin-leads";
process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

test("generic repository routes lists to bounded generic RPC with exact source/assignment", async () => {
  const { TenantDouyinLeadsRepository } = await import("./tenant-douyin-leads");
  const rpc = mock(async () => ({ data: { data: { list: [], total: 0 } }, error: null }));
  const repository = new TenantDouyinLeadsRepository({ rpc } as unknown as TenantDouyinLeadsDatabaseClient, "customer_lead");
  await repository.listLeads({ tenantId: "11111111-1111-4111-8111-111111111111",
    page: 2, pageSize: 100, source: "douyin_miniapp", assignment: "unassigned", visibleAssigneeIds: null });
  expect(rpc).toHaveBeenCalledWith("list_tenant_customer_leads", {
    p_tenant_id: "11111111-1111-4111-8111-111111111111", p_page: 2, p_page_size: 100,
    p_source: "douyin_miniapp", p_assignment: "unassigned", p_visible_assignee_ids: null,
    p_status: null, p_assignee_id: null, p_date_from: null, p_date_to_exclusive: null, p_keyword: null,
  });
  rpc.mockClear();
  await repository.listLeads({ tenantId: "11111111-1111-4111-8111-111111111111",
    page: 1, pageSize: 20, visibleAssigneeIds: [] });
  expect(rpc).not.toHaveBeenCalled();
});

test("ordinary followup uses generic RPC and enforces coherent nullable response", async () => {
  const { TenantDouyinLeadsRepository } = await import("./tenant-douyin-leads");
  const id = "11111111-1111-4111-8111-111111111111";
  const data = { action: "follow_up", result: "followed_up", lead_id: id, follow_up_id: id,
    lead_version: 2, appointment_id: null, appointment_version: null as number | null,
    appointment_status: null, idempotent: false };
  const rpc = mock(async () => ({ data: { data }, error: null }));
  const repository = new TenantDouyinLeadsRepository({ rpc } as unknown as TenantDouyinLeadsDatabaseClient, "customer_lead");
  const input = { tenantId: id, leadId: id, actorEmployeeId: id, expectedVersion: 1,
    idempotencyKey: id, appointmentId: null, followUpType: "phone", summary: "联系", result: "待沟通",
    nextFollowUpAt: null, appointmentStatus: null, confirmedVisitAt: null };
  await expect(repository.appendFollowUp(input)).resolves.toMatchObject({ ok: true, data: { appointment_id: null } });
  expect(rpc).toHaveBeenCalledWith("append_customer_lead_follow_up", expect.objectContaining({ p_appointment_id: null }));
  data.appointment_version = 1;
  await expect(repository.appendFollowUp(input)).rejects.toMatchObject({ code: "DB_ERROR" });
});

test("generic detail/access/preflight use integrated sources; legacy stays Douyin-only", async () => {
  const { TenantDouyinLeadsRepository } = await import("./tenant-douyin-leads");
  const id = "11111111-1111-4111-8111-111111111111";
  const calls: unknown[][] = [];
  const query = {
    select: (...args: unknown[]) => { calls.push(["select", ...args]); return query; },
    eq: (...args: unknown[]) => { calls.push(["eq", ...args]); return query; },
    in: (...args: unknown[]) => { calls.push(["in", ...args]); return query; },
    maybeSingle: async () => ({ data: null, error: null }),
  };
  const client = { from: () => query } as unknown as TenantDouyinLeadsDatabaseClient;
  for (const mode of ["customer_lead", "douyin_lead"] as const) {
    const repo = new TenantDouyinLeadsRepository(client, mode);
    for (const method of ["getLeadDetail", "findLeadAccess", "findConversionPreflight"] as const) {
      calls.length = 0;
      await repo[method]({ tenantId: id, leadId: id });
      expect(calls).toContainEqual(["eq", "tenant_id", id]);
      expect(calls).toContainEqual(["eq", "id", id]);
      expect(calls).toContainEqual(mode === "customer_lead"
        ? ["in", "source", ["douyin_miniapp", "h5"]] : ["eq", "source", "douyin_miniapp"]);
    }
  }
});

test("H5 list does not load Douyin appointments and rejects mixed-up source or tenant rows", async () => {
  const { TenantDouyinLeadsRepository } = await import("./tenant-douyin-leads");
  const id = "11111111-1111-4111-8111-111111111111";
  const row = { id, tenant_id: id, source: "h5", page_id: null, page_version_id: null,
    douyin_miniapp_installation_id: null, customer_id: null, assigned_employee_id: null,
    name: "活动访客", phone: null, community: null, lead_status: "new", version: 1,
    created_at: "2026-09-06T00:00:00Z", followed_at: null, follow_remark: null };
  const rpc = mock(async () => ({ data: { data: { list: [row], total: 1 } }, error: null }));
  const repo = new TenantDouyinLeadsRepository({ rpc } as unknown as TenantDouyinLeadsDatabaseClient, "customer_lead");
  const input = { tenantId: id, page: 1, pageSize: 20, source: "h5" as const, visibleAssigneeIds: null };
  expect((await repo.listLeads(input)).rows[0]?.lead.source).toBe("h5");
  expect(rpc).toHaveBeenCalledTimes(1);
  row.source = "douyin_miniapp";
  await expect(repo.listLeads(input)).rejects.toMatchObject({ code: "DB_ERROR" });
  row.source = "h5";
  row.tenant_id = "22222222-2222-4222-8222-222222222222";
  await expect(repo.listLeads(input)).rejects.toMatchObject({ code: "DB_ERROR" });
});
