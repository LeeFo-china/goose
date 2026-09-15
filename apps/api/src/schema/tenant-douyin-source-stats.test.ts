import { expect, test } from "bun:test";

test("source statistics only accept bounded day windows and paginated groups", async () => {
  const module = await import("./tenant-douyin-source-stats").catch(() => ({
    TenantDouyinSourceStatsQuerySchema: undefined,
  }));
  const schema = module.TenantDouyinSourceStatsQuerySchema;
  expect(schema).toBeDefined();
  if (!schema) return;
  expect(schema.parse({})).toEqual({ days: 7, groupBy: "content",
    page: 1, pageSize: 20 });
  expect(schema.safeParse({ days: "90", groupBy: "account", page: "2",
    pageSize: "100" }).success).toBe(true);
  for (const query of [{ days: 91 }, { days: 8 }, { pageSize: 101 },
    { page: 0 }, { groupBy: "phone" }, { tenantId: "other" }]) {
    expect(schema.safeParse(query).success).toBe(false);
  }
});
