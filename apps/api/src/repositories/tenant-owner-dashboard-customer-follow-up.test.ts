import { describe, expect, test } from "bun:test";

describe("tenant owner dashboard customer follow up repository", () => {
  test("uses tenant-scoped inner customer joins and bounded ranges", async () => {
    const source = await Bun.file(
      new URL("./tenant-owner-dashboard-customer-follow-up.ts", import.meta.url),
    ).text();

    expect(source).toContain(
      "customer:customers!customer_follow_ups_customer_id_fkey!inner",
    );
    expect(source).toContain(".eq(\"customer.tenant_id\", input.tenantId)");
    expect(source).toContain(".select(\"id\", { count: \"exact\", head: true })");
    expect(source).toContain(".range(0, input.limit - 1)");
    expect(source).not.toContain(".select(\"*\")");
  });
});
