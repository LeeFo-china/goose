import { describe, expect, test } from "bun:test";
import {
  buildPublicProjectPageSegments,
  listPublicProjects,
} from "./public";

describe("public project page segments", () => {
  test("keeps a page fully inside preferred company rows", () => {
    expect(buildPublicProjectPageSegments({
      page: 1,
      pageSize: 2,
      preferredCount: 4,
      preferredTenantId: "tenant-a",
      otherTenantIds: ["tenant-b"],
    })).toEqual([{ tenantIds: ["tenant-a"], from: 0, to: 1 }]);
  });

  test("fills a page with preferred company rows then other matched companies", () => {
    expect(buildPublicProjectPageSegments({
      page: 2,
      pageSize: 3,
      preferredCount: 4,
      preferredTenantId: "tenant-a",
      otherTenantIds: ["tenant-b"],
    })).toEqual([
      { tenantIds: ["tenant-a"], from: 3, to: 3 },
      { tenantIds: ["tenant-b"], from: 0, to: 1 },
    ]);
  });

  test("skips preferred company rows after they are exhausted", () => {
    expect(buildPublicProjectPageSegments({
      page: 3,
      pageSize: 2,
      preferredCount: 3,
      preferredTenantId: "tenant-a",
      otherTenantIds: ["tenant-b", "tenant-c"],
    })).toEqual([{ tenantIds: ["tenant-b", "tenant-c"], from: 1, to: 2 }]);
  });

  test("omits an empty other-company segment", () => {
    expect(buildPublicProjectPageSegments({
      page: 2,
      pageSize: 3,
      preferredCount: 4,
      preferredTenantId: "tenant-a",
      otherTenantIds: [],
    })).toEqual([{ tenantIds: ["tenant-a"], from: 3, to: 3 }]);
  });

  test("falls through to other companies when preferred count is zero", () => {
    expect(buildPublicProjectPageSegments({
      page: 1,
      pageSize: 2,
      preferredCount: 0,
      preferredTenantId: "tenant-a",
      otherTenantIds: ["tenant-b"],
    })).toEqual([{ tenantIds: ["tenant-b"], from: 0, to: 1 }]);
  });

  test("queries all matched tenants when nothing is selected", () => {
    expect(buildPublicProjectPageSegments({
      page: 1,
      pageSize: 20,
      preferredCount: 0,
      preferredTenantId: null,
      otherTenantIds: ["tenant-a", "tenant-b"],
    })).toEqual([{ tenantIds: ["tenant-a", "tenant-b"], from: 0, to: 19 }]);
  });

  test("returns no segment when no tenant can be queried", () => {
    expect(buildPublicProjectPageSegments({
      page: 1,
      pageSize: 20,
      preferredCount: 0,
      preferredTenantId: null,
      otherTenantIds: [],
    })).toEqual([]);
  });
});

describe("public project scoped list query", () => {
  test("returns empty pagination without querying when tenant IDs are empty", async () => {
    let visibilityCalls = 0;

    const result = await listPublicProjects.call({
      applyPublicProjectVisibilityQuery: (query: unknown) => {
        visibilityCalls += 1;
        return query;
      },
    }, {
      tenantIds: [],
      preferredTenantId: null,
      page: 2,
      pageSize: 20,
    });

    expect(result).toEqual({
      rows: [],
      pagination: {
        page: 2,
        pageSize: 20,
        total: 0,
        totalPages: 0,
      },
    });
    expect(visibilityCalls).toBe(0);
  });
});
