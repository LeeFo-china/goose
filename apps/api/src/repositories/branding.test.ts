import { describe, expect, mock, test } from "bun:test";
import type { BrandProfileRecord } from "./branding";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

type QueryResult = {
  data: unknown;
  error: unknown;
};

type Trace = {
  source: string;
  calls: Array<{ method: string; args: unknown[] }>;
};

async function createRepository(results: QueryResult[]) {
  const { BrandingRepository } = await import("./branding");
  const traces: Trace[] = [];
  const client = {
    from: mock((table: string) => createBuilder(table, results, traces)),
    rpc: mock((name: string, params: Record<string, unknown>) =>
      Promise.resolve(
        recordRpc(name, params, results, traces),
      )),
  };
  const fileLookups: Array<{
    fileId: string;
    scope: "platform" | "tenant";
    tenantId?: string;
  }> = [];
  const fileRepository = {
    findPlatformBrandLogoForBinding: mock(async (fileId: string) => {
      fileLookups.push({ fileId, scope: "platform" });
      return { id: fileId, tenant_id: null };
    }),
    findTenantBrandLogoForBinding: mock(
      async (fileId: string, tenantId: string) => {
        fileLookups.push({ fileId, scope: "tenant", tenantId });
        return { id: fileId, tenant_id: tenantId };
      },
    ),
  };

  return {
    repository: new BrandingRepository(
      () => client as never,
      fileRepository as never,
    ),
    traces,
    fileLookups,
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
  for (const method of ["select", "eq", "is"]) {
    builder[method] = mock((...args: unknown[]) => {
      trace.calls.push({ method, args });
      return builder;
    });
  }
  builder.maybeSingle = mock(async () => {
    trace.calls.push({ method: "maybeSingle", args: [] });
    return result;
  });
  return builder;
}

function recordRpc(
  name: string,
  params: Record<string, unknown>,
  results: QueryResult[],
  traces: Trace[],
) {
  traces.push({
    source: `rpc:${name}`,
    calls: [{ method: "rpc", args: [params] }],
  });
  return results.shift() ?? { data: null, error: null };
}

const profile = {
  id: "profile-1",
  scope: "platform",
  tenant_id: null,
  display_name: "平台品牌",
  logo_file_id: "file-1",
  published_display_name: null,
  published_logo_file_id: null,
  status: "draft",
  version: 1,
  published_version: null,
  published_at: null,
  updated_by_employee_id: "employee-1",
  created_at: "2026-07-27T00:00:00.000Z",
  updated_at: "2026-07-27T00:00:00.000Z",
} satisfies BrandProfileRecord;

describe("BrandingRepository", () => {
  test("platform profile lookup uses a bounded projection and null tenant scope", async () => {
    const { repository, traces } = await createRepository([{
      data: profile,
      error: null,
    }]);

    await expect(repository.findPlatformProfile()).resolves.toEqual(profile);

    expect(traces[0]?.source).toBe("brand_profiles");
    expect(traces[0]?.calls).toContainEqual({
      method: "select",
      args: [
        "id,scope,tenant_id,display_name,logo_file_id,published_display_name,published_logo_file_id,status,version,published_version,published_at,updated_by_employee_id,created_at,updated_at",
      ],
    });
    expect(traces[0]?.calls).toContainEqual({
      method: "eq",
      args: ["scope", "platform"],
    });
    expect(traces[0]?.calls).toContainEqual({
      method: "is",
      args: ["tenant_id", null],
    });
  });

  test("tenant profile lookup always binds the requested tenant", async () => {
    const tenantProfile = {
      ...profile,
      scope: "tenant" as const,
      tenant_id: "tenant-1",
    };
    const { repository, traces } = await createRepository([{
      data: tenantProfile,
      error: null,
    }]);

    await expect(repository.findTenantProfile("tenant-1"))
      .resolves.toEqual(tenantProfile);

    expect(traces[0]?.calls).toContainEqual({
      method: "eq",
      args: ["scope", "tenant"],
    });
    expect(traces[0]?.calls).toContainEqual({
      method: "eq",
      args: ["tenant_id", "tenant-1"],
    });
  });

  test("tenant lookup selects only branding-relevant columns", async () => {
    const tenant = { id: "tenant-1", name: "晴天装饰", status: "active" };
    const { repository, traces } = await createRepository([{
      data: tenant,
      error: null,
    }]);

    await expect(repository.findTenant("tenant-1")).resolves.toEqual(tenant);
    expect(traces[0]?.source).toBe("tenants");
    expect(traces[0]?.calls).toContainEqual({
      method: "select",
      args: ["id,name,status"],
    });
    expect(traces[0]?.calls).toContainEqual({
      method: "eq",
      args: ["id", "tenant-1"],
    });
  });

  test("branding file lookups cannot omit their platform or tenant owner scope", async () => {
    const { repository, fileLookups } = await createRepository([]);

    await repository.findPlatformBrandLogoForBinding("file-platform");
    await repository.findTenantBrandLogoForBinding("file-tenant", "tenant-1");

    expect(fileLookups).toEqual([
      { fileId: "file-platform", scope: "platform" },
      { fileId: "file-tenant", scope: "tenant", tenantId: "tenant-1" },
    ]);
    expect(Object.getOwnPropertyNames(Object.getPrototypeOf(repository)))
      .not.toContain("findBrandingFile");
    expect(Object.getOwnPropertyNames(Object.getPrototypeOf(repository)))
      .not.toContain("findBrandingFileForPlatform");
    expect(Object.getOwnPropertyNames(Object.getPrototypeOf(repository)))
      .not.toContain("findBrandingFileForTenant");
  });

  test("save draft calls the exact atomic RPC signature", async () => {
    const saved = { ...profile, version: 2 };
    const { repository, traces } = await createRepository([{
      data: saved,
      error: null,
    }]);

    await expect(repository.saveDraft({
      scope: "tenant",
      tenantId: "tenant-1",
      displayName: "晴天装饰",
      logoFileId: "file-1",
      expectedVersion: 1,
      actorEmployeeId: "employee-1",
    })).resolves.toEqual(saved);

    expect(traces).toEqual([{
      source: "rpc:save_brand_profile_draft",
      calls: [{
        method: "rpc",
        args: [{
          p_scope: "tenant",
          p_tenant_id: "tenant-1",
          p_display_name: "晴天装饰",
          p_logo_file_id: "file-1",
          p_expected_version: 1,
          p_actor_employee_id: "employee-1",
        }],
      }],
    }]);
  });

  test("publish calls the exact atomic RPC signature", async () => {
    const published = {
      ...profile,
      status: "published" as const,
      published_version: 1,
    };
    const { repository, traces } = await createRepository([{
      data: published,
      error: null,
    }]);

    await expect(repository.publish({
      scope: "platform",
      tenantId: null,
      expectedVersion: 1,
      actorEmployeeId: "employee-1",
    })).resolves.toEqual(published);

    expect(traces).toEqual([{
      source: "rpc:publish_brand_profile",
      calls: [{
        method: "rpc",
        args: [{
          p_scope: "platform",
          p_tenant_id: null,
          p_expected_version: 1,
          p_actor_employee_id: "employee-1",
        }],
      }],
    }]);
  });

  test("Supabase failures are wrapped as database errors", async () => {
    const databaseError = { code: "XX000", message: "query failed" };
    const { repository } = await createRepository([{
      data: null,
      error: databaseError,
    }]);

    await expect(repository.findTenantProfile("tenant-1")).rejects.toMatchObject({
      statusCode: 500,
      code: "DB_ERROR",
      details: databaseError,
    });
  });
});
