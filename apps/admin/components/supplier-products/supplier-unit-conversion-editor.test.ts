import { existsSync, readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

function readSource(path: string) {
  const url = new URL(path, import.meta.url);
  expect(existsSync(url), path).toBe(true);
  return existsSync(url) ? readFileSync(url, "utf8") : "";
}

describe("单位换算链编辑器", () => {
  test("支持增删换算边并展示可解释摘要", () => {
    const editor = readSource("./supplier-unit-conversion-editor.tsx");
    const dialog = readSource("./supplier-sku-dialog.tsx");

    expect(editor).toContain("SupplierUnitConversionEditor");
    expect(editor).toContain("buildConversionChainSummary");
    expect(editor).toContain("validateConversionEdges");
    expect(editor).toContain("删除");
    expect(dialog).toContain("SupplierUnitConversionEditor");
  });
});
