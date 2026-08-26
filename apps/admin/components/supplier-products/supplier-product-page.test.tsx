import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";

import { catalogOptionLabel } from "./catalog-search-select";
import { SupplierProductSourceBadge } from "./supplier-product-source-badge";
import {
  createLatestRequestGate,
  isLatestResourceRequest,
} from "./supplier-request-gate";
import {
  buildCatalogOptionCreateCommand,
  buildCatalogOptionListPath,
  buildRelationshipListPath,
  buildSpecDefinitionListPath,
  canCreateCatalogOptionInline,
  normalizeCreatedCatalogOption,
} from "./supplier-product-api";
import {
  buildSuggestedSkuName,
  canReadSupplierProductWorkspace,
  getPriceWriteState,
  getProductWriteState,
  relationshipReadOnlyMessage,
  summarizeUnitConversionChain,
  unitConversionChainError,
} from "./supplier-product-rules";
import type {
  CatalogSpecDefinition,
  SupplierProduct,
  TenantSupplierRelationship,
  UnitOption,
} from "./supplier-product-types";

const activeRelationship = {
  id: "relationship-1",
  relationship_status: "active",
  supplier: {
    onboarding_status: "approved",
    operational_status: "active",
  },
} as TenantSupplierRelationship;

const platformProduct = {
  id: "product-platform",
  name: "地砖",
  ownership_scope: "platform",
  owner_tenant_id: null,
  brand: { name: "东鹏" },
} as SupplierProduct;

const tenantProduct = {
  ...platformProduct,
  id: "product-tenant",
  ownership_scope: "tenant",
  owner_tenant_id: "tenant-1",
} as SupplierProduct;

describe("供应商品与供货价行为", () => {
  test("合作供应商检索卡片保持稳定的两列工具栏布局", () => {
    const source = readFileSync(
      new URL("./supplier-search-select.tsx", import.meta.url),
      "utf8",
    );

    expect(source).toContain(
      "xl:grid-cols-[minmax(28rem,0.9fr)_minmax(32rem,1.1fr)]",
    );
    expect(source).toContain('className="flex min-w-0 gap-2"');
    expect(source).toContain('className="min-w-0 flex-1"');
    expect(source).toContain('triggerClassName="min-w-0 flex-1"');
    expect(source).toContain('className="shrink-0"');
  });

  test("目录选择项不展示内部编码", () => {
    expect(catalogOptionLabel({
      id: "category-1",
      code: "CAT-1",
      name: "地砖",
      full_name: "主材 / 瓷砖 / 地砖",
      ownership_scope: "tenant",
      owner_tenant_id: "tenant-1",
    })).toBe("主材 / 瓷砖 / 地砖");
  });

  test("异步请求门只接受最后一次请求结果", () => {
    const gate = createLatestRequestGate();
    const first = gate.begin();
    const second = gate.begin();

    expect(gate.isCurrent(first)).toBe(false);
    expect(gate.isCurrent(second)).toBe(true);
    gate.invalidate();
    expect(gate.isCurrent(second)).toBe(false);
  });

  test("资源请求还必须匹配当前选择，旧价格簿不能抢占新选择", () => {
    const gate = createLatestRequestGate();
    const request = gate.begin();

    expect(isLatestResourceRequest(gate, request, "price-a", "price-b"))
      .toBe(false);
    expect(isLatestResourceRequest(gate, request, "price-b", "price-b"))
      .toBe(true);
  });

  test("合作供应商选择器使用有界服务端关键词检索", () => {
    expect(buildRelationshipListPath("第21家", 1)).toBe(
      "/suppliers?page=1&pageSize=20&keyword=%E7%AC%AC21%E5%AE%B6",
    );
    expect(buildRelationshipListPath("", 2)).toBe(
      "/suppliers?page=2&pageSize=20",
    );
  });

  test("目录选择器分页检索并只请求叶子分类", () => {
    expect(buildCatalogOptionListPath(
      "categories",
      { kind: "tenant", tenantSupplierId: "relationship-1" },
      3,
      "瓷砖",
    )).toBe(
      "/catalog/categories?page=3&pageSize=20&status=active&keyword=%E7%93%B7%E7%A0%96&is_leaf=true",
    );
    expect(buildSpecDefinitionListPath(
      "category-1",
      { kind: "platform", supplierId: "supplier-1" },
      2,
    )).toBe(
      "/platform/catalog/categories/category-1/spec-definitions?page=2&pageSize=100&status=active",
    );
  });

  test("租户分类和品牌支持快速新建命令并隐藏系统字段", () => {
    expect(buildCatalogOptionCreateCommand(
      "categories",
      " 防水辅料 ",
      "catalog-key-1",
    )).toEqual({
      path: "/catalog/categories",
      init: {
        method: "POST",
        headers: { "Idempotency-Key": "catalog-key-1" },
        body: JSON.stringify({ name: "防水辅料" }),
      },
    });

    expect(buildCatalogOptionCreateCommand(
      "brands",
      "立邦油漆",
      "catalog-key-2",
      { categoryId: "category-1" },
    )).toEqual({
      path: "/catalog/brands",
      init: {
        method: "POST",
        headers: { "Idempotency-Key": "catalog-key-2" },
        body: JSON.stringify({
          name: "立邦油漆",
          category_id: "category-1",
        }),
      },
    });
  });

  test("目录快速新建命令结果会归一化为可选中的目录选项", () => {
    expect(normalizeCreatedCatalogOption("categories", {
      status: "created",
      resource: {
        id: "category-1",
        code: "TC-001",
        name: "防水辅料",
        full_name: "防水辅料",
        ownership_scope: "tenant",
        owner_tenant_id: "tenant-1",
      },
    })).toEqual({
      id: "category-1",
      code: "TC-001",
      name: "防水辅料",
      full_name: "防水辅料",
      ownership_scope: "tenant",
      owner_tenant_id: "tenant-1",
    });

    expect(normalizeCreatedCatalogOption("brands", {
      status: "created",
      catalog_brand: {
        id: "brand-1",
        code: "TB-001",
        name: "立邦油漆",
        ownership_scope: "tenant",
        owner_tenant_id: "tenant-1",
      },
    })).toEqual({
      id: "brand-1",
      code: "TB-001",
      name: "立邦油漆",
      ownership_scope: "tenant",
      owner_tenant_id: "tenant-1",
    });
  });

  test("目录快速新建只开放给租户侧分类和品牌的空结果搜索", () => {
    const tenantScope = {
      kind: "tenant",
      tenantSupplierId: "relationship-1",
    } as const;
    const platformScope = { kind: "platform", supplierId: "supplier-1" } as const;

    expect(canCreateCatalogOptionInline({
      kind: "categories",
      scope: tenantScope,
      keyword: "辅料",
      loading: false,
      resultCount: 0,
    })).toBe(true);
    expect(canCreateCatalogOptionInline({
      kind: "brands",
      scope: tenantScope,
      keyword: "立邦",
      loading: false,
      resultCount: 0,
    })).toBe(true);
    expect(canCreateCatalogOptionInline({
      kind: "units",
      scope: tenantScope,
      keyword: "箱",
      loading: false,
      resultCount: 0,
    })).toBe(false);
    expect(canCreateCatalogOptionInline({
      kind: "brands",
      scope: platformScope,
      keyword: "立邦",
      loading: false,
      resultCount: 0,
    })).toBe(false);
    expect(canCreateCatalogOptionInline({
      kind: "brands",
      scope: tenantScope,
      keyword: " ",
      loading: false,
      resultCount: 0,
    })).toBe(false);
    expect(canCreateCatalogOptionInline({
      kind: "brands",
      scope: tenantScope,
      keyword: "立邦",
      loading: true,
      resultCount: 0,
    })).toBe(false);
    expect(canCreateCatalogOptionInline({
      kind: "brands",
      scope: tenantScope,
      keyword: "立邦",
      loading: false,
      resultCount: 1,
    })).toBe(false);
  });

  test("来源徽标渲染稳定的共享和私有语义", () => {
    expect(renderToStaticMarkup(
      <SupplierProductSourceBadge source="platform_shared" />,
    )).toContain("平台共享");
    expect(renderToStaticMarkup(
      <SupplierProductSourceBadge source="tenant_private" />,
    )).toContain("私有");
  });

  test("平台商品对租户只读，租户商品仅在 active 合作和权限下可写", () => {
    expect(getProductWriteState({
      canManage: true,
      relationship: activeRelationship,
      product: platformProduct,
    })).toEqual({ writable: false, reason: "平台共享商品只读" });
    expect(getProductWriteState({
      canManage: true,
      relationship: activeRelationship,
      product: tenantProduct,
    })).toEqual({ writable: true, reason: null });
    expect(getProductWriteState({
      canManage: false,
      relationship: activeRelationship,
      product: tenantProduct,
    }).writable).toBe(false);
  });

  test("租户私有供应商商品维护不依赖平台准入状态", () => {
    const privateRelationship = {
      ...activeRelationship,
      tenant_id: "tenant-1",
      supplier: {
        ...activeRelationship.supplier,
        ownership_scope: "tenant",
        owner_tenant_id: "tenant-1",
        onboarding_status: "draft",
        operational_status: "active",
      },
    } as TenantSupplierRelationship;

    expect(getProductWriteState({
      canManage: true,
      relationship: privateRelationship,
      product: tenantProduct,
    })).toEqual({ writable: true, reason: null });
    expect(getPriceWriteState({
      canManage: true,
      relationship: privateRelationship,
    })).toEqual({ writable: true, reason: null });
  });

  test("采购价写权限不依赖商品管理权限", () => {
    expect(getPriceWriteState({
      canManage: true,
      relationship: activeRelationship,
    })).toEqual({ writable: true, reason: null });
    expect(getPriceWriteState({
      canManage: false,
      relationship: activeRelationship,
    }).writable).toBe(false);
  });

  test("采购价查看或管理权限可独立进入商品定价工作区", () => {
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
    })).toBe(true);
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
  });

  test("非 active 合作保留历史读取并返回明确只读说明", () => {
    const suspended = {
      ...activeRelationship,
      relationship_status: "suspended",
    } as TenantSupplierRelationship;

    expect(relationshipReadOnlyMessage(suspended)).toContain("历史只读");
    expect(getProductWriteState({
      canManage: true,
      relationship: suspended,
      product: tenantProduct,
    }).writable).toBe(false);
  });

  test("建议 SKU 名称只由结构化规格值生成", () => {
    const definitions = [
      {
        code: "size",
        name: "尺寸",
        value_type: "text",
        participates_in_sku_name: true,
        sort_order: 10,
      },
      {
        code: "color",
        name: "颜色",
        value_type: "single_enum",
        participates_in_sku_name: true,
        sort_order: 20,
      },
      {
        code: "internal_note",
        name: "内部备注",
        value_type: "text",
        participates_in_sku_name: false,
        sort_order: 30,
      },
    ] as CatalogSpecDefinition[];

    expect(buildSuggestedSkuName(
      tenantProduct,
      definitions,
      { size: "800×800×10mm", color: "灰色", internal_note: "A1" },
    )).toBe("东鹏 地砖 800×800×10mm 灰色");
  });

  test("单位换算摘要按有向边生成累计十进制链", () => {
    const units = [
      { id: "box", name: "箱", symbol: "箱" },
      { id: "piece", name: "片", symbol: "片" },
      { id: "sqm", name: "平方米", symbol: "㎡" },
    ] as UnitOption[];

    expect(summarizeUnitConversionChain(
      [
        { from_unit_id: "box", to_unit_id: "piece", factor: "8" },
        { from_unit_id: "piece", to_unit_id: "sqm", factor: "0.18" },
      ],
      units,
      "box",
    )).toBe("1 箱 = 8 片 = 1.44 平方米");
  });

  test("单位换算只接受从采购单位出发且包含库存基本单位的单链", () => {
    const valid = [
      { from_unit_id: "box", to_unit_id: "piece", factor: "8" },
      { from_unit_id: "piece", to_unit_id: "sqm", factor: "0.18" },
    ];
    expect(unitConversionChainError(valid, "box", "piece")).toBeNull();
    expect(unitConversionChainError([], "piece", "piece")).toBeNull();
    expect(unitConversionChainError(valid, "box", "kg")).toContain("库存基本单位");
    expect(unitConversionChainError([
      ...valid,
      { from_unit_id: "box", to_unit_id: "kg", factor: "2" },
    ], "box", "piece")).toContain("分叉");
    expect(unitConversionChainError([
      { from_unit_id: "piece", to_unit_id: "sqm", factor: "0.18" },
    ], "box", "piece")).toContain("采购单位");
  });
});
