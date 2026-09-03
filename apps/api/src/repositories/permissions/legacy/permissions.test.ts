import { describe, expect, test } from "bun:test";

import { listPermissions } from "./permissions";

type QueryResult = {
  data: unknown[];
  error: null;
  count: number;
};

class PermissionQuery {
  readonly calls: Array<[string, ...unknown[]]> = [];

  select(...args: unknown[]) {
    this.calls.push(["select", ...args]);
    return this;
  }

  order(...args: unknown[]) {
    this.calls.push(["order", ...args]);
    return this;
  }

  eq(...args: unknown[]) {
    this.calls.push(["eq", ...args]);
    return this;
  }

  not(...args: unknown[]) {
    this.calls.push(["not", ...args]);
    return this;
  }

  or(...args: unknown[]) {
    this.calls.push(["or", ...args]);
    return this;
  }

  async range(...args: unknown[]): Promise<QueryResult> {
    this.calls.push(["range", ...args]);
    return { data: [], error: null, count: 0 };
  }
}

describe("permission catalog visibility", () => {
  test("tenant-facing permission catalog excludes platform-only permissions at query boundary", async () => {
    const query = new PermissionQuery();

    await listPermissions.call({
      adminClient: { from: () => query },
    }, {
      page: 1,
      pageSize: 20,
      status: "active",
      includePlatformPermissions: false,
      includeTenantRestrictedPermissions: false,
    });

    expect(query.calls).toContainEqual([
      "not",
      "code",
      "ilike",
      "platform.%",
    ]);
    expect(query.calls).toContainEqual([
      "not",
      "code",
      "ilike",
      "system.%",
    ]);
    expect(query.calls).toContainEqual([
      "not",
      "code",
      "ilike",
      "service_provider.%",
    ]);
  });

  test("platform-facing permission catalog keeps platform-only permissions", async () => {
    const query = new PermissionQuery();

    await listPermissions.call({
      adminClient: { from: () => query },
    }, {
      page: 1,
      pageSize: 20,
      status: "active",
      includePlatformPermissions: true,
      includeTenantRestrictedPermissions: true,
    });

    expect(query.calls.some(([name]) => name === "not")).toBe(false);
  });
});
