import { describe, expect, test } from "bun:test";
import { PlatformAddressSuggestionQuerySchema } from "@/schema/platform-location";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

describe("TenantLocationController routes", () => {
  test("registers tenant-safe location helper routes", async () => {
    const controller = (await import(".")).default;
    const routes: Array<{ method: string; path: string }> = [];
    controller.registerExtraRoutes({
      get: (path: string) => routes.push({ method: "GET", path }),
    } as never);

    expect(routes).toEqual([
      { method: "GET", path: "/tenant/location/address-suggestions" },
      { method: "GET", path: "/tenant/location/geocode" },
      { method: "GET", path: "/tenant/location/map-config" },
    ]);
  });

  test("keeps scoped address suggestion query fields", () => {
    const query = PlatformAddressSuggestionQuerySchema.parse({
      keyword: "中心",
      region: "固始县",
      province: "河南省",
      city: "信阳市",
      district: "固始县",
      adcode: "411525",
      pageSize: "8",
    });

    expect(query).toMatchObject({
      keyword: "中心",
      region: "固始县",
      province: "河南省",
      city: "信阳市",
      district: "固始县",
      adcode: "411525",
      pageSize: 8,
    });
  });
});
