import { describe, expect, mock, test } from "bun:test";

import { BrandingEntitlementListQuerySchema } from "@/schema/branding";
import type { TenantEntitlementRecord } from "./tenant-entitlements";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

type QueryResult = {
  data: unknown;
  error: unknown;
  count?: number | null;
};

type Trace = {
  source: string;
  calls: Array<{ method: string; args: unknown[] }>;
};

async function createRepository(results: QueryResult[]) {
  const { TenantEntitlementsRepository } = await import(
    "./tenant-entitlements"
  );
  const traces: Trace[] = [];
  const client = {
    from: mock((table: string) => createBuilder(table, results, traces)),
    rpc: mock((name: string, params: Record<string, unknown>) => {
      traces.push({
        source: `rpc:${name}`,
        calls: [{ method: "rpc", args: [params] }],
      });
      return Promise.resolve(
        results.shift() ?? { data: null, error: null },
      );
    }),
  };

  return {
    repository: new TenantEntitlementsRepository(() => client as never),
    traces,
  };
}

function createBuilder(
  source: string,
  results: QueryResult[],
  traces: Trace[],
) {
  const trace: Trace = { source, calls: [] };
  traces.push(trace);
  const result = results.shift() ?? { data: null, error: null };
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq", "order", "range"]) {
    builder[method] = mock((...args: unknown[]) => {
      trace.calls.push({ method, args });
      return builder;
    });
  }
  builder.maybeSingle = mock(async () => {
    trace.calls.push({ method: "maybeSingle", args: [] });
    return result;
  });
  builder.then = (
    resolve: (value: QueryResult) => unknown,
    reject: (reason: unknown) => unknown,
  ) => Promise.resolve(result).then(resolve, reject);
  return builder;
}

const entitlement = {
  id: "entitlement-1",
  tenant_id: "tenant-1",
  entitlement_code: "custom_support_branding",
  status: "active",
  starts_at: "2026-07-27T00:00:00.000Z",
  expires_at: "2027-07-27T00:00:00.000Z",
  source_type: "manual_grant",
  source_id: null,
  suspended_at: null,
  suspend_reason: null,
  version: 1,
  updated_by_employee_id: "employee-1",
  created_at: "2026-07-27T00:00:00.000Z",
  updated_at: "2026-07-27T00:00:00.000Z",
} satisfies TenantEntitlementRecord;

describe("TenantEntitlementsRepository", () => {
  test("lists one tenant with exact count, stable order, and bounded range", async () => {
    const { repository, traces } = await createRepository([{
      data: [entitlement],
      error: null,
      count: 21,
    }]);

    await expect(repository.listByTenant("tenant-1", {
      page: 2,
      pageSize: 10,
    })).resolves.toEqual({ rows: [entitlement], total: 21 });

    expect(traces[0]?.source).toBe("tenant_entitlements");
    expect(traces[0]?.calls).toContainEqual({
      method: "select",
      args: [
        "id,tenant_id,entitlement_code,status,starts_at,expires_at,source_type,source_id,suspended_at,suspend_reason,version,updated_by_employee_id,created_at,updated_at",
        { count: "exact" },
      ],
    });
    expect(traces[0]?.calls).toContainEqual({
      method: "eq",
      args: ["tenant_id", "tenant-1"],
    });
    expect(traces[0]?.calls).toContainEqual({
      method: "order",
      args: ["updated_at", { ascending: false }],
    });
    expect(traces[0]?.calls).toContainEqual({
      method: "order",
      args: ["id", { ascending: false }],
    });
    expect(traces[0]?.calls).toContainEqual({
      method: "range",
      args: [10, 19],
    });
  });

  test("page size upper bound is owned by the strict request schema", () => {
    expect(BrandingEntitlementListQuerySchema.safeParse({
      page: 1,
      pageSize: 100,
    }).success).toBe(true);
    expect(BrandingEntitlementListQuerySchema.safeParse({
      page: 1,
      pageSize: 101,
    }).success).toBe(false);
  });

  test("finds the fixed entitlement code inside an explicit tenant scope", async () => {
    const { repository, traces } = await createRepository([{
      data: entitlement,
      error: null,
    }]);

    await expect(repository.findByCode(
      "tenant-1",
      "custom_support_branding",
    )).resolves.toEqual(entitlement);

    expect(traces[0]?.calls).toContainEqual({
      method: "eq",
      args: ["tenant_id", "tenant-1"],
    });
    expect(traces[0]?.calls).toContainEqual({
      method: "eq",
      args: ["entitlement_code", "custom_support_branding"],
    });
  });

  test("action calls the exact atomic RPC signature", async () => {
    const { repository, traces } = await createRepository([{
      data: entitlement,
      error: null,
    }]);

    await expect(repository.applyAction({
      tenantId: "tenant-1",
      entitlementCode: "custom_support_branding",
      action: "grant",
      termYears: 1,
      reason: "平台赠送一年品牌权益",
      expectedVersion: 0,
      actorEmployeeId: "employee-1",
      actorUserId: "user-1",
    })).resolves.toEqual(entitlement);

    expect(traces).toEqual([{
      source: "rpc:apply_tenant_entitlement_action",
      calls: [{
        method: "rpc",
        args: [{
          p_tenant_id: "tenant-1",
          p_entitlement_code: "custom_support_branding",
          p_action: "grant",
          p_term_years: 1,
          p_reason: "平台赠送一年品牌权益",
          p_expected_version: 0,
          p_actor_employee_id: "employee-1",
          p_actor_user_id: "user-1",
        }],
      }],
    }]);
  });

  test("expiry reconciliation supplies the service clock to the exact RPC", async () => {
    const { repository, traces } = await createRepository([{
      data: entitlement,
      error: null,
    }]);
    const now = new Date("2027-07-27T00:00:00.000Z");

    await expect(repository.expireIfDue(
      "tenant-1",
      "custom_support_branding",
      now,
    )).resolves.toEqual(entitlement);

    expect(traces).toEqual([{
      source: "rpc:expire_tenant_entitlement_if_due",
      calls: [{
        method: "rpc",
        args: [{
          p_tenant_id: "tenant-1",
          p_entitlement_code: "custom_support_branding",
          p_now: "2027-07-27T00:00:00.000Z",
        }],
      }],
    }]);
  });

  test("RPC failures are wrapped as database errors", async () => {
    const databaseError = { code: "P0001", details: "STATE_CONFLICT" };
    const { repository } = await createRepository([{
      data: null,
      error: databaseError,
    }]);

    await expect(repository.applyAction({
      tenantId: "tenant-1",
      entitlementCode: "custom_support_branding",
      action: "suspend",
      termYears: null,
      reason: "内容待核验",
      expectedVersion: 1,
      actorEmployeeId: "employee-1",
      actorUserId: "user-1",
    })).rejects.toMatchObject({
      statusCode: 500,
      code: "DB_ERROR",
      details: databaseError,
    });
  });
});
