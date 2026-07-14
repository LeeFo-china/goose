import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const repository = new URL(
  "../repositories/tenant-service-providers.ts",
  import.meta.url,
);

describe("tenant service-provider repository contract", () => {
  test("paginates platform and visitor RPC reads with exact totals", () => {
    const source = readFileSync(repository, "utf8");
    expect(source).toContain('"list_tenant_service_provider_publications"');
    expect(source).toContain('"list_visitor_local_service_providers"');
    expect(source.match(/\{ count: "exact" \}/g)?.length)
      .toBeGreaterThanOrEqual(2);
    expect(source.match(/\.range\(start, start \+ input\.pageSize - 1\)/g)?.length)
      .toBe(2);
  });

  test("resolves bounded active ancestry instead of using visitor tenant snapshots", () => {
    const source = readFileSync(repository, "utf8");
    expect(source).toContain('"resolve_tenant_onboarding_region_paths"');
    expect(source).toContain("slice(0, 3)");
    expect(source).not.toContain("matched_tenants");
  });
});
