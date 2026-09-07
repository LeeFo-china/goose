import { describe, expect, test } from "bun:test";
import type { PublicProjectAudienceScope } from "./public-audience-scope";
import {
  buildPublicProjectListCacheKey,
  getPublicProjectDetailInAudience,
  listPublicProjects,
} from "./public-cache";

describe("scoped public project cache", () => {
  test("normalizes tenant IDs in a scoped cache key", () => {
    expect(buildPublicProjectListCacheKey({
      tenantIds: ["tenant-b", "tenant-a"],
      preferredTenantId: "tenant-a",
      page: 1,
      pageSize: 20,
    })).toBe(buildPublicProjectListCacheKey({
      tenantIds: ["tenant-a", "tenant-b"],
      preferredTenantId: "tenant-a",
      page: 1,
      pageSize: 20,
    }));
  });

  test("does not expose a cached project outside scope", async () => {
    const scope: PublicProjectAudienceScope = {
      kind: "visitor_location",
      tenantIds: ["tenant-a"],
      preferredTenantId: null,
    };

    await expect(getPublicProjectDetailInAudience.call({
      getPublicProjectDetail: async () => ({
        id: "project-1",
        tenant_id: "tenant-b",
      }),
    }, {
      projectId: "project-1",
      scope,
    })).rejects.toThrow("项目不存在");
  });

  test("refreshes workflow labels when the base public page is cached", async () => {
    const input = {
      scope: {
        kind: "visitor_location" as const,
        tenantIds: ["tenant-a"],
        preferredTenantId: null,
      },
      page: 1,
      pageSize: 20,
    };
    const cacheKey = buildPublicProjectListCacheKey({
      tenantIds: input.scope.tenantIds,
      preferredTenantId: input.scope.preferredTenantId,
      page: input.page,
      pageSize: input.pageSize,
    });
    let labelReadCount = 0;
    const publicProjectListCache = new Map([[cacheKey, {
      expiresAt: Date.now() + 60_000,
      value: {
        rows: [{
          id: "project-1",
          tenant_id: "tenant-a",
          status: "constructing",
        }],
        pagination: {
          page: 1,
          pageSize: 20,
          total: 1,
          totalPages: 1,
        },
      },
    }]]);
    const service = {
      publicProjectListCache,
      publicProjectListInFlight: new Map(),
      getCachedValue(cache: typeof publicProjectListCache, key: string) {
        const entry = cache.get(key);
        return entry && entry.expiresAt > Date.now() ? entry.value : null;
      },
      attachPublicProjectWorkflowStatuses: async (rows: Array<Record<string, unknown>>) => {
        labelReadCount += 1;
        return rows.map((row) => ({
          ...row,
          display_status_label: labelReadCount === 1 ? "拆改" : "水电",
        }));
      },
    };

    const first = await listPublicProjects.call(service, input);
    const second = await listPublicProjects.call(service, input);

    expect(first.rows[0]?.display_status_label).toBe("拆改");
    expect(second.rows[0]?.display_status_label).toBe("水电");
    expect(labelReadCount).toBe(2);
  });
});
