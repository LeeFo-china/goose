import { existsSync, readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

function readSource(path: string) {
  const url = new URL(path, import.meta.url);
  expect(existsSync(url), path).toBe(true);
  return existsSync(url) ? readFileSync(url, "utf8") : "";
}

describe("平台规格模板管理", () => {
  test("平台目录页挂载规格模板并支持新增", () => {
    const page = readSource(
      "../../app/(console)/platform/catalog/page.tsx",
    );
    const component = readSource("./platform-spec-definitions.tsx");
    const api = readSource("./platform-catalog-api.ts");

    expect(page).toContain("PlatformSpecDefinitions");
    expect(component).toContain("createPlatformSpecDefinition");
    expect(component).toContain("value_type");
    expect(component).toContain("unit_dimension");
    expect(api).toContain("/spec-definitions");
  });
});
