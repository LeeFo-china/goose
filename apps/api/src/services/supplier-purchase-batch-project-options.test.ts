import { expect, mock, test } from "bun:test";

import type { AuthContext } from "@/services/authorization";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const TENANT_ID = "68000000-0000-4000-8000-000000000001";
const PROJECT_ID = "68000000-0000-4000-8000-000000000003";
const NOW = new Date("2026-08-27T03:04:05.000Z");

async function createService(events: string[] = []) {
  const { SupplierPurchaseBatchesService } = await import(
    "@/services/supplier-purchase-batches"
  );
  const nowFactory = mock(() => {
    events.push("nowFactory");
    return NOW;
  });
  const listProjectOptions = mock(async (input: unknown) => {
    events.push("repository");
    return { input };
  });
  const service = new SupplierPurchaseBatchesService({
    access: {
      requireView: mock(async () => {
        events.push("requireView");
        return { tenantId: TENANT_ID };
      }),
      getVisibleProjectIds: mock(async () => {
        events.push("getVisibleProjectIds");
        return [PROJECT_ID];
      }),
    } as never,
    repository: { listProjectOptions } as never,
    nowFactory,
  });
  return { listProjectOptions, nowFactory, service };
}

const context = {} as AuthContext;

test("passes the exact last seven days boundary from the injected clock", async () => {
  const { listProjectOptions, nowFactory, service } = await createService();

  await service.listProjectOptions(context, {
    page: 1,
    pageSize: 20,
    updatedWindow: "last_7_days",
    timezone: "Asia/Shanghai",
  });

  expect(nowFactory).toHaveBeenCalledTimes(1);
  expect(listProjectOptions).toHaveBeenCalledWith({
    tenant_id: TENANT_ID,
    visible_project_ids: [PROJECT_ID],
    page: 1,
    pageSize: 20,
    updated_at_from: "2026-08-20T03:04:05.000Z",
    updated_at_to: "2026-08-27T03:04:05.000Z",
  });
});

test("does not use the clock for an unfiltered project option query", async () => {
  const { listProjectOptions, nowFactory, service } = await createService();

  await service.listProjectOptions(context, {
    page: 2,
    pageSize: 10,
    keyword: "一期",
  });

  expect(nowFactory).toHaveBeenCalledTimes(0);
  expect(listProjectOptions).toHaveBeenCalledWith({
    tenant_id: TENANT_ID,
    visible_project_ids: [PROJECT_ID],
    page: 2,
    pageSize: 10,
    keyword: "一期",
  });
});

test("orders authorization, clock, and repository access for a filtered query", async () => {
  const events: string[] = [];
  const { service } = await createService(events);

  await service.listProjectOptions(context, {
    page: 1,
    pageSize: 20,
    updatedWindow: "last_7_days",
    timezone: "Asia/Shanghai",
  });

  expect(events).toEqual([
    "requireView",
    "getVisibleProjectIds",
    "nowFactory",
    "repository",
  ]);
});
