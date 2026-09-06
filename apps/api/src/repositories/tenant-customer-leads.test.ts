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
