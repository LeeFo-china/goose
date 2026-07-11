import { describe, expect, test } from "bun:test";
import type { PublicProjectAudienceScope } from "./public-audience-scope";
import {
  buildPublicProjectListCacheKey,
  getPublicProjectDetailInAudience,
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
});
