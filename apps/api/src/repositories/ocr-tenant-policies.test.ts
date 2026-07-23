import { describe, expect, mock, test } from "bun:test";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

type QueryResult = {
  data: unknown;
  error: unknown;
  count?: number | null;
};

type QueryTrace = {
  table: string;
  calls: Array<{ method: string; args: unknown[] }>;
};

async function createRepository(results: QueryResult[]) {
  const { OcrTenantPolicyRepository } = await import("./ocr-tenant-policies");
  const traces: QueryTrace[] = [];
  const client = {
    from: mock((table: string) => {
      const trace: QueryTrace = { table, calls: [] };
      traces.push(trace);
      const result = results.shift() ?? { data: null, error: null };
      const builder: Record<string, unknown> = {};
      for (const method of [
        "select",
        "eq",
        "or",
        "order",
        "range",
        "upsert",
      ]) {
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
    }),
  };

  return {
    repository: new OcrTenantPolicyRepository(() => client as never),
    traces,
  };
}

describe("OcrTenantPolicyRepository", () => {
  test("lists the safe overview with exact server pagination and filters", async () => {
    const { repository, traces } = await createRepository([{
      data: [{ tenant_id: "tenant-1", enabled: true }],
      error: null,
      count: 21,
    }]);

    const result = await repository.listPlatform({
      page: 2,
      pageSize: 10,
      keyword: "晴天,装饰",
      enabled: true,
    });

    expect(result.pagination).toEqual({
      page: 2,
      pageSize: 10,
      total: 21,
      totalPages: 3,
    });
    expect(traces[0]?.table).toBe("platform_ocr_tenant_policy_overview");
    expect(traces[0]?.calls).toContainEqual({
      method: "select",
      args: [expect.not.stringContaining("contact_phone"), { count: "exact" }],
    });
    expect(traces[0]?.calls).toContainEqual({
      method: "eq",
      args: ["enabled", true],
    });
    expect(traces[0]?.calls).toContainEqual({
      method: "or",
      args: ["tenant_name.ilike.%晴天 装饰%,tenant_slug.ilike.%晴天 装饰%"],
    });
    expect(traces[0]?.calls).toContainEqual({ method: "range", args: [10, 19] });
  });

  test("finds a single tenant policy without reading the overview", async () => {
    const { repository, traces } = await createRepository([{
      data: { tenant_id: "tenant-1", enabled: true },
      error: null,
    }]);

    await repository.findByTenantId("tenant-1");

    expect(traces[0]?.table).toBe("ocr_tenant_policies");
    expect(traces[0]?.calls).toContainEqual({
      method: "eq",
      args: ["tenant_id", "tenant-1"],
    });
  });

  test("verifies the target tenant with a bounded projection", async () => {
    const { repository, traces } = await createRepository([{
      data: { id: "tenant-1", name: "测试租户", status: "active" },
      error: null,
    }]);

    const tenant = await repository.findTenantById("tenant-1");

    expect(tenant).toEqual({ id: "tenant-1", name: "测试租户", status: "active" });
    expect(traces[0]?.table).toBe("tenants");
    expect(traces[0]?.calls).toContainEqual({
      method: "select",
      args: ["id,name,status"],
    });
  });

  test("upserts one tenant policy and returns the saved projection", async () => {
    const saved = {
      tenant_id: "tenant-1",
      enabled: true,
      allowed_document_types: ["business_license" as const],
      daily_limit: 20,
      remark: "首批灰度",
      enabled_at: "2026-07-23T02:00:00.000Z",
      updated_by_employee_id: "employee-1",
      created_at: "2026-07-23T02:00:00.000Z",
      updated_at: "2026-07-23T02:00:00.000Z",
    };
    const { repository, traces } = await createRepository([{
      data: saved,
      error: null,
    }]);

    const result = await repository.upsert({
      tenantId: "tenant-1",
      enabled: true,
      allowedDocumentTypes: ["business_license"],
      dailyLimit: 20,
      remark: "首批灰度",
      enabledAt: "2026-07-23T02:00:00.000Z",
      updatedByEmployeeId: "employee-1",
    });

    expect(result).toEqual(saved);
    expect(traces[0]?.table).toBe("ocr_tenant_policies");
    expect(traces[0]?.calls).toContainEqual({
      method: "upsert",
      args: [expect.objectContaining({
        tenant_id: "tenant-1",
        enabled: true,
        allowed_document_types: ["business_license"],
        updated_by_employee_id: "employee-1",
      }), { onConflict: "tenant_id" }],
    });
  });
});
