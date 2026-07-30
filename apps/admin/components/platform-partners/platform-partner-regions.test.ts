import { existsSync, readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

function readSource(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

describe("Platform partner district region management", () => {
  test("provides a reusable province-city-district multi-select", () => {
    const pickerUrl = new URL(
      "./platform-partner-region-picker.tsx",
      import.meta.url,
    );

    expect(existsSync(pickerUrl)).toBe(true);
    const source = readFileSync(pickerUrl, "utf8");
    expect(source).toContain("PlatformPartnerRegionPicker");
    expect(source).toContain('level: "province"');
    expect(source).toContain("parent_adcode");
    expect(source).toContain("DistrictMultiSelect");
    expect(source).toContain("待迁移");
    expect(source).toContain("fetchAdministrativeAreas");
  });

  test("uses the picker for partner creation and application approval", () => {
    const createSource = readSource("./platform-partner-actions.tsx");
    const approvalSource = readSource(
      "./platform-partner-application-actions.tsx",
    );

    expect(createSource).toContain("<PlatformPartnerRegionPicker");
    expect(createSource).toContain("selectedRegionCodes");
    expect(approvalSource).toContain("<PlatformPartnerRegionPicker");
    expect(approvalSource).toContain("selectedRegionCodes");
    expect(createSource).not.toContain("多个区域用逗号分隔");
    expect(approvalSource).not.toContain("多个区域用逗号分隔");
  });

  test("exposes audited optimistic region editing from the partner table", () => {
    const actionSource = `${readSource("./platform-partner-actions.tsx")}\n${
      readSource("./platform-partner-region-actions.tsx")
    }`;
    const tableSource = readSource("./platform-partner-tables.tsx");

    expect(actionSource).toContain("EditPartnerRegionsButton");
    expect(actionSource).toContain("/platform/partners/${partner.id}/regions");
    expect(actionSource).toContain("expected_version");
    expect(actionSource).toContain("change_reason");
    expect(tableSource).toContain("<EditPartnerRegionsButton");
    expect(tableSource).toContain("full_name");
  });

  test("loads region names in one bounded administrative-area batch", () => {
    const pageSource = `${
      readSource("../../app/(console)/platform/partners/page.tsx")
    }\n${readSource("./platform-partner-region-data.ts")}`;

    expect(pageSource).toContain("collectPartnerRegionCodes");
    expect(pageSource).toContain("/platform/administrative-areas?");
    expect(pageSource).toContain("adcodes");
    expect(pageSource).toContain("region_areas");
  });
});
