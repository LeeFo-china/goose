import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

describe("供应商 SKU 系统管理编码", () => {
  test("编码只读且不进入表单载荷", () => {
    const dialogSource = readFileSync(
      new URL("./supplier-sku-dialog.tsx", import.meta.url),
      "utf8",
    );

    expect(dialogSource).toContain("保存后系统自动生成");
    expect(dialogSource).toContain("disabled readOnly");
    expect(dialogSource).not.toContain("setSkuCode");
    expect(dialogSource).not.toContain("sku_code: skuCode.trim()");
  });

  test("租户列表隐藏编码且平台列表只读展示", () => {
    const tableSource = readFileSync(
      new URL("./supplier-sku-table.tsx", import.meta.url),
      "utf8",
    );

    expect(tableSource).toContain('scope.kind === "platform" ? (');
    expect(tableSource).toContain("row.original.sku_code");
  });
});
