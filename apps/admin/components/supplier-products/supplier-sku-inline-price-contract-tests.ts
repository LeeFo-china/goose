import { expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

import {
  canReadSupplierProductWorkspace,
  shouldLoadPriceLists,
} from "./supplier-product-rules";

function source(fileName: string) {
  const url = new URL(fileName, import.meta.url);
  return existsSync(url) ? readFileSync(url, "utf8") : "";
}

export function registerSupplierSkuInlinePriceContractTests() {
  test("采购价只读权限可独立进入工作区，管理权限本身不授予读取能力", () => {
    expect(canReadSupplierProductWorkspace({
      canViewProducts: false,
      canManageProducts: false,
      canViewCostPrice: true,
      canManageCostPrice: false,
    })).toBe(true);
    expect(canReadSupplierProductWorkspace({
      canViewProducts: false,
      canManageProducts: false,
      canViewCostPrice: false,
      canManageCostPrice: true,
    })).toBe(false);
    expect(canReadSupplierProductWorkspace({
      canViewProducts: false,
      canManageProducts: true,
      canViewCostPrice: false,
      canManageCostPrice: false,
    })).toBe(true);
    expect(canReadSupplierProductWorkspace({
      canViewProducts: false,
      canManageProducts: false,
      canViewCostPrice: false,
      canManageCostPrice: false,
    })).toBe(false);
    expect(shouldLoadPriceLists(false, "relationship-1")).toBe(false);
  });

  test("工作区仅由三项权限共同启用 SKU 即时价格并保持查看权限边界", () => {
    const workspaceSource = source("./supplier-product-workspace.tsx");

    expect(workspaceSource).toContain("const canReadCostPrice = canViewCostPrice;");
    expect(workspaceSource).toContain(
      "const canUseInlineSkuPrice = canManageProducts &&\n    canViewCostPrice && canManageCostPrice;",
    );
    expect(workspaceSource).toContain("inlinePriceEnabled={canUseInlineSkuPrice}");
  });

  test("即时价格 flag 传到 SKU 新增和编辑对话框且平台默认关闭", () => {
    const listSource = source("./supplier-product-list.tsx");
    const tableSource = source("./supplier-sku-table.tsx");
    const dialogSource = source("./supplier-sku-dialog.tsx");
    const platformSource = source(
      "../platform-supplier-products/platform-supplier-product-workspace.tsx",
    );

    expect(listSource).toContain("inlinePriceEnabled = false");
    expect(listSource).toContain("inlinePriceEnabled={inlinePriceEnabled}");
    expect(tableSource).toContain("inlinePriceEnabled = false");
    expect(tableSource).toContain("inlinePriceEnabled={inlinePriceEnabled}");
    expect(dialogSource).toContain("inlinePriceEnabled = false");
    expect(platformSource).not.toContain("inlinePriceEnabled=");
    expect(platformSource).not.toContain("loadSupplierSkuPrice");
  });

  test("采购价格区块使用无 Card 字段结构和可访问控件状态", () => {
    const priceFieldsSource = source("./supplier-sku-price-fields.tsx");

    expect(priceFieldsSource).toContain('<FieldSet className="border-t pt-5">');
    expect(priceFieldsSource).toContain("<FieldLegend>采购价格</FieldLegend>");
    expect(priceFieldsSource).toContain("保存后立即用于新的采购业务。");
    expect(priceFieldsSource).toContain('inputMode="decimal"');
    expect(priceFieldsSource).toContain("pr-28");
    expect(priceFieldsSource).toContain("元 / {purchaseUnitSymbol}");
    expect(priceFieldsSource).toContain("<SelectGroup>");
    expect(priceFieldsSource).toContain("<Switch");
    expect(priceFieldsSource).toContain("启用 SKU 后可调整供货价");
    expect(priceFieldsSource).not.toContain("<Card");
  });

  test("对话框并行加载规格和租户价格且跳过 legacy 与停用 SKU 价格读取", () => {
    const dialogSource = source("./supplier-sku-dialog.tsx");

    expect(dialogSource).toContain("Promise.all([");
    expect(dialogSource).toContain("loadAllSpecDefinitions");
    expect(dialogSource).toContain("loadSupplierSkuPriceDefaults");
    expect(dialogSource).toContain("loadSupplierSkuCurrentPrice");
    expect(dialogSource).toContain('sku.status !== "inactive"');
    expect(dialogSource).toContain('inlinePriceEnabled && scope.kind === "tenant"');
    expect(dialogSource).toContain("if (!active) return;");
  });

  test("对话框按保存模式选择 legacy 与组合路径并仅在成功后关闭", () => {
    const dialogSource = source("./supplier-sku-dialog.tsx");
    const catchBlock = dialogSource.slice(
      dialogSource.indexOf("} catch (error) {"),
      dialogSource.indexOf("} finally {"),
    );

    expect(dialogSource).toContain("buildSkuResourcePath");
    expect(dialogSource).toContain("buildPurchasableSkuPath");
    expect(dialogSource).toContain('saveMode === "inline-price"');
    expect(dialogSource).toContain("buildPurchasableSkuCreatePayload");
    expect(dialogSource).toContain("buildPurchasableSkuUpdatePayload");
    expect(dialogSource).toContain("isSupplierSkuPriceFormValid(priceForm)");
    expect(dialogSource).toContain("if (invalid) return;");
    expect(dialogSource).toContain('disabled={saveMode === "metadata-only"}');
    expect(dialogSource).toContain("SKU 与供货价已生效");
    expect(dialogSource).toContain("保存并生效");
    expect(dialogSource).toContain("保存修改");
    expect(dialogSource).toContain("单位变更请使用专用单位换算流程。");
    expect(catchBlock).not.toContain("setOpen(false)");
    expect(catchBlock).not.toContain("attemptRef.current = null");
  });
}
