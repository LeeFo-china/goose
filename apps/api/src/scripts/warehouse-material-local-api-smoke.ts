import "reflect-metadata";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import { z } from "zod";
import type { AuthContext } from "@/services/authorization";

// Run only from verify-warehouse-stage-b-database.ts. No real token or tenant is used.
async function main(): Promise<void> {
  assert.match(process.env.SUPABASE_URL ?? "", /^http:\/\/127\.0\.0\.1:\d+$/);
  const fixture = z.object({
    tenant_id: z.uuid(), actor_user_id: z.uuid(), actor_employee_id: z.uuid(), warehouse_id: z.uuid(),
    project_id: z.uuid(), sku_id: z.uuid(), cost_id: z.uuid(), issue_id: z.uuid(), issue_item_id: z.uuid(),
  }).strict().parse(JSON.parse(process.env.WAREHOUSE_MATERIAL_ISOLATED_FIXTURE ?? "null"));
  const [{ default: issues }, { default: returns }, { default: inventory }, { default: errorHandler }, { authorizationService }] = await Promise.all([
    import("@/controllers/warehouse-issues"), import("@/controllers/warehouse-returns"),
    import("@/controllers/inventory"), import("@/plugins/error-handler"), import("@/services/authorization"),
  ]);
  let actor: AuthContext = {
    authUserId: fixture.actor_user_id, employeeId: fixture.actor_employee_id, tenantId: fixture.tenant_id,
    tenantName: "Isolated", tenantSlug: "isolated", tenantStatus: "active", isPlatformAdmin: false,
    employeeName: "Synthetic", employeeStatus: "active", departmentId: null, tenantDepartmentId: null,
    departmentCode: null, departmentName: null, postId: null, postName: null, avatar: null, roleCodes: [], roles: [],
    permissions: ["inventory.issue.manage", "inventory.issue.approve", "inventory.stock.view", "project.read"]
      .map((code) => ({ code, scope: "all" })),
  };
  // Sole test seam: a trusted synthetic login context. Controller, service, schema,
  // repository, Supabase HTTP, PostgREST and SQL authorization are all real.
  const originalAuthorization = authorizationService.getRequiredAuthContext;
  authorizationService.getRequiredAuthContext = async () => actor;
  const app = Fastify({ logger: false });
  errorHandler(app);
  issues.registerExtraRoutes(app); returns.registerExtraRoutes(app); inventory.registerExtraRoutes(app);
  const address = await app.listen({ host: "127.0.0.1", port: 0 });
  const issueId = randomUUID();
  let requests = 0;

  async function request(path: string, body?: Record<string, unknown>, key?: string, expectedStatus = 200): Promise<unknown> {
    requests++;
    const response = await fetch(`${address}${path}`, { method: body ? "POST" : "GET",
      headers: { "content-type": "application/json", ...(key ? { "Idempotency-Key": key } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const result: unknown = await response.json();
    assert.equal(response.status, expectedStatus, `${path}: ${JSON.stringify(result)}`);
    return result;
  }
  function data(value: unknown): unknown { return z.object({ data: z.unknown() }).parse(value).data; }
  const page = z.object({ list: z.array(z.record(z.string(), z.unknown())),
    pagination: z.object({ total: z.number(), page: z.number(), pageSize: z.number(), totalPages: z.number() }) });

  try {
    assert.deepEqual(data(await request("/warehouse-issues/settings")), { warehouse_materials_enabled: true });
    const options = page.parse(data(await request("/warehouse-issues/project-options")));
    assert.ok(options.list.some((item) => item.id === fixture.project_id && item.name === "未命名项目"));
    const draft = { expected_version: 0, warehouse_id: fixture.warehouse_id, project_id: fixture.project_id,
      reason: "Isolated HTTP issue", items: [{ supplier_sku_id: fixture.sku_id, quantity: "0.3" }] };
    await request(`/warehouse-issues/${issueId}/save-draft`, draft, undefined, 400);
    await request(`/warehouse-issues/${issueId}/save-draft`, { ...draft, amount: "0.01" }, "invalid-cost", 400);
    const saved = await request(`/warehouse-issues/${issueId}/save-draft`, draft, "http-save");
    assert.deepEqual(await request(`/warehouse-issues/${issueId}/save-draft`, draft, "http-save"), saved);
    await request(`/warehouse-issues/${issueId}/save-draft`, { ...draft, reason: "changed" }, "http-save", 409);
    await request(`/warehouse-issues/${issueId}/submit`, { expected_version: 7 }, "http-stale", 409);
    await request(`/warehouse-issues/${issueId}/submit`, { expected_version: 1 }, "http-submit");
    const allPermissions = actor.permissions;
    actor = { ...actor, permissions: allPermissions.filter((item) => item.code !== "inventory.issue.approve") };
    await request(`/warehouse-issues/${issueId}/complete`, { expected_version: 2 }, "http-denied", 403);
    actor = { ...actor, permissions: allPermissions };
    await request(`/warehouse-issues/${issueId}/complete`, { expected_version: 2 }, "http-complete");
    const summary = z.object({ total_amount: z.string(), status: z.literal("completed"), project_name: z.literal("未命名项目") })
      .parse(data(await request(`/warehouse-issues/${issueId}`)));
    assert.equal(summary.total_amount, "0.02");
    const items = page.parse(data(await request(`/warehouse-issues/${issueId}/items`)));
    assert.equal(items.pagination.total, 1);
    const item = z.object({ id: z.uuid(), quantity: z.string(), amount: z.string(), returnable_quantity: z.string() }).parse(items.list[0]);
    assert.equal(item.quantity, "0.3000"); assert.equal(item.amount, "0.02");
    for (const [index, quantity] of ["0.1", "0.2"].entries()) {
      const returnId = randomUUID();
      await request(`/warehouse-returns/${returnId}/save-draft`, { expected_version: 0, original_issue_order_id: issueId,
        reason: "Isolated HTTP return", items: [{ original_issue_item_id: item.id, quantity }] }, `http-return-save-${index}`);
      await request(`/warehouse-returns/${returnId}/complete`, { expected_version: 1 }, `http-return-complete-${index}`);
      const returned = page.parse(data(await request(`/warehouse-returns/${returnId}/items`)));
      assert.equal(returned.list[0]?.amount, "0.01");
    }
    const finalItems = page.parse(data(await request(`/warehouse-issues/${issueId}/items`)));
    assert.equal(finalItems.list[0]?.returnable_quantity, "0.0000");
    assert.equal(finalItems.list[0]?.returned_amount, "0.02");
    const issueList = page.parse(data(await request(`/warehouse-issues?page=999&pageSize=1&projectId=${fixture.project_id}`)));
    assert.equal(issueList.list.length, 0); assert.ok(issueList.pagination.total >= 2);
    const returnList = page.parse(data(await request(`/warehouse-returns?projectId=${fixture.project_id}&status=completed`)));
    assert.ok(returnList.pagination.total >= 5);
    const transactions = page.parse(data(await request(`/inventory/transactions?warehouseId=${fixture.warehouse_id}&pageSize=100`)));
    assert.ok(transactions.list.some((row) => row.transaction_type === "project_issue" &&
      z.object({ issue_order_id: z.uuid() }).safeParse(row.source_document).data?.issue_order_id === issueId));
    assert.ok(transactions.list.some((row) => row.transaction_type === "project_return" &&
      z.object({ return_order_id: z.uuid(), issue_order_id: z.uuid() }).safeParse(row.source_document).data?.issue_order_id === issueId));
    const originalActor = actor;
    actor = { ...actor, authUserId: randomUUID() };
    const forged = z.object({ code: z.string() }).parse(await request(`/warehouse-issues/${issueId}`, undefined, undefined, 403));
    assert.equal(forged.code, "WAREHOUSE_MATERIAL_ACTOR_INVALID");
    actor = originalActor;
    assert.deepEqual(await request(`/warehouse-issues/${issueId}/save-draft`, draft, "http-save"), saved);
    console.log(`EVIDENCE ${requests} real HTTP API requests passed: strict input, pagination, issue/partial returns, exact money, source links, SQL actor checks, version/idempotency/permission errors`);
  } finally {
    authorizationService.getRequiredAuthContext = originalAuthorization;
    await app.close();
  }
}

main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
