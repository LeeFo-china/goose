import { existsSync, readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

function readSource(path: string) {
  const url = new URL(path, import.meta.url);
  expect(existsSync(url), path).toBe(true);
  return existsSync(url) ? readFileSync(url, "utf8") : "";
}

describe("PlatformTenantAddressPicker", () => {
  test("exposes province city and district selectors in the platform tenant editor", () => {
    const source = readSource("./platform-tenant-address-picker.tsx");

    expect(source).toContain("SearchableLocationSelect");
    expect(source).toContain("/api/backend/platform/administrative-areas");
    expect(source).toContain("地址省份");
    expect(source).toContain("地址城市");
    expect(source).toContain("地址区县");
    expect(source).toContain("updateProvince");
    expect(source).toContain("updateCity");
    expect(source).toContain("updateDistrict");
    expect(source).toContain("active?: boolean");
    expect(source).toContain("if (!active) return");
    expect(source).toContain("address_province");
    expect(source).toContain("address_city");
    expect(source).toContain("address_district");
    expect(source).toContain("address_adcode");
  });
});
