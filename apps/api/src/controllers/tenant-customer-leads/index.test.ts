import { expect, mock, test } from "bun:test";
process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

test("registers the ten generic routes alongside the unchanged legacy registry", async () => {
  const { TenantCustomerLeadsController } = await import(".");
  const paths: string[] = [];
  new TenantCustomerLeadsController().registerExtraRoutes({
    get: (path: string) => paths.push(`GET ${path}`),
    post: (path: string) => paths.push(`POST ${path}`),
  } as never);
  expect(paths).toEqual([
    "GET /tenant/customer-leads", "GET /tenant/customer-leads/assignee-candidates",
    "GET /tenant/customer-leads/assignee-filter-options", "GET /tenant/customer-leads/:id",
    "GET /tenant/customer-leads/:id/appointments", "GET /tenant/customer-leads/:id/follow-ups",
    "POST /tenant/customer-leads/:id/assign", "POST /tenant/customer-leads/:id/follow-ups",
    "POST /tenant/customer-leads/:id/convert-customer", "POST /tenant/customer-leads/:id/mark-invalid",
  ]);
  const registry = await Bun.file(new URL("../../routes/index.ts", import.meta.url)).text();
  expect(registry).toContain("TenantCustomerLeadsController.registerExtraRoutes(app)");
  expect(registry).toContain("TenantDouyinLeadsController.registerExtraRoutes(app)");
});

test("validates strict generic filters and accepts appointment-free followup", async () => {
  const { TenantCustomerLeadsController } = await import(".");
  const followUp = mock(async () => ({ action: "follow_up" }));
  const controller = new TenantCustomerLeadsController({ appendFollowUp: followUp } as never);
  const getContext = mock(async () => ({ employeeId: "employee" }));
  Object.defineProperty(controller, "getRequiredTenantContext", { value: getContext });
  for (const query of [{ pageSize: 101 }, { source: "xiaohongshu" },
    { assignment: "unassigned", assigneeId: "11111111-1111-4111-8111-111111111111" },
    { tenant_id: "11111111-1111-4111-8111-111111111111" }]) {
    await expect(controller.listLeads({ query } as never)).rejects.toMatchObject({ statusCode: 400 });
  }
  expect(getContext).not.toHaveBeenCalled();
  const id = "22222222-2222-4222-8222-222222222222";
  const body = { expected_lead_version: 1, idempotency_key: "33333333-3333-4333-8333-333333333333",
    follow_up_type: "phone", summary: "联系", result: "待沟通" };
  await controller.appendFollowUp({ params: { id }, body } as never);
  expect(followUp).toHaveBeenCalledWith({ employeeId: "employee" }, id, {
    ...body, appointment_id: null, appointment_status: null,
    confirmed_visit_at: null, next_follow_up_at: null,
  });
  await expect(controller.appendFollowUp({ params: { id }, body: { ...body,
    appointment_status: "confirmed", confirmed_visit_at: "2026-09-08T08:00:00Z" } } as never))
    .rejects.toMatchObject({ statusCode: 400 });
});
