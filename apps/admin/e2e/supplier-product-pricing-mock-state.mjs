export const mockPort = Number.parseInt(
  process.env.SUPPLIER_PRODUCT_PRICING_MOCK_BACKEND_PORT || "3996",
  10,
);

export const now = "2026-08-19T00:00:00.000Z";
export const ids = {
  tenant: "21000000-0000-4000-8000-000000000001",
  tenantB: "21000000-0000-4000-8000-000000000101",
  relationship: "21000000-0000-4000-8000-000000000002",
  supplier: "21000000-0000-4000-8000-000000000003",
  category: "21000000-0000-4000-8000-000000000004",
  tenantCategory: "21000000-0000-4000-8000-000000000014",
  foreignCategory: "21000000-0000-4000-8000-000000000024",
  brand: "21000000-0000-4000-8000-000000000005",
  tenantBrand: "21000000-0000-4000-8000-000000000015",
  foreignBrand: "21000000-0000-4000-8000-000000000025",
  box: "21000000-0000-4000-8000-000000000006",
  piece: "21000000-0000-4000-8000-000000000007",
  sqm: "21000000-0000-4000-8000-000000000008",
  platformProduct: "21000000-0000-4000-8000-000000000031",
  tenantProduct: "21000000-0000-4000-8000-000000000032",
  tenantBProduct: "21000000-0000-4000-8000-000000000132",
  platformSku: "21000000-0000-4000-8000-000000000041",
  tenantSku: "21000000-0000-4000-8000-000000000042",
  tenantBSku: "21000000-0000-4000-8000-000000000142",
};

function scopedCatalogRecord(record, scope, ownerTenantId = null) {
  return {
    ...record,
    ownership_scope: scope,
    owner_tenant_id: ownerTenantId,
    version: 1,
    created_at: now,
    updated_at: now,
  };
}

const categoryFillers = Array.from({ length: 100 }, (_, index) =>
  scopedCatalogRecord({
    id: `24000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    code: `FILLER-CATEGORY-${String(index + 1).padStart(3, "0")}`,
    name: `占位分类 ${index + 1}`,
    full_name: `测试目录 / 占位分类 ${index + 1}`,
    status: "active",
    is_leaf: true,
  }, "platform"));

export const categories = [
  ...categoryFillers,
  scopedCatalogRecord({
    id: ids.category,
    code: "TILE",
    name: "瓷砖分类",
    full_name: "主材 / 瓷砖 / 地砖",
    status: "active",
    is_leaf: true,
  }, "platform"),
  scopedCatalogRecord({
    id: ids.tenantCategory,
    code: "TENANT-TILE",
    name: "租户定制砖",
    full_name: "租户主材 / 定制砖",
    status: "active",
    is_leaf: true,
  }, "tenant", ids.tenant),
  scopedCatalogRecord({
    id: ids.foreignCategory,
    code: "FOREIGN-TILE",
    name: "其他租户分类",
    full_name: "其他租户 / 分类",
    status: "active",
    is_leaf: true,
  }, "tenant", "21000000-0000-4000-8000-000000000099"),
];

const brandFillers = Array.from({ length: 100 }, (_, index) =>
  scopedCatalogRecord({
    id: `25000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    code: `FILLER-BRAND-${String(index + 1).padStart(3, "0")}`,
    name: `占位品牌 ${index + 1}`,
    status: "active",
  }, "platform"));

export const brands = [
  ...brandFillers,
  scopedCatalogRecord({
    id: ids.brand,
    code: "E2E-BRAND",
    name: "E2E 品牌",
    status: "active",
  }, "platform"),
  scopedCatalogRecord({
    id: ids.tenantBrand,
    code: "TENANT-BRAND",
    name: "租户自有品牌",
    status: "active",
  }, "tenant", ids.tenant),
  scopedCatalogRecord({
    id: ids.foreignBrand,
    code: "FOREIGN-BRAND",
    name: "其他租户品牌",
    status: "active",
  }, "tenant", "21000000-0000-4000-8000-000000000099"),
];

const unitFillers = Array.from({ length: 100 }, (_, index) => ({
  id: `26000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
  code: `FILLER-UNIT-${String(index + 1).padStart(3, "0")}`,
  name: `占位单位 ${index + 1}`,
  symbol: `U${index + 1}`,
  unit_dimension: "quantity",
  status: "active",
}));

export const units = [
  ...unitFillers,
  { id: ids.box, code: "BOX", name: "箱", symbol: "箱", unit_dimension: "quantity", status: "active" },
  { id: ids.piece, code: "PIECE", name: "片", symbol: "片", unit_dimension: "quantity", status: "active" },
  { id: ids.sqm, code: "SQM", name: "平方米", symbol: "㎡", unit_dimension: "area", status: "active" },
];

const specFillers = Array.from({ length: 100 }, (_, index) => ({
  id: `27000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
  code: `filler_flag_${index + 1}`,
  name: `占位规格 ${index + 1}`,
  value_type: "boolean",
  enum_options: [],
  unit_dimension: null,
  is_required: false,
  participates_in_sku_name: false,
  is_filterable: false,
  sort_order: index + 1,
  status: "active",
}));

export const specDefinitions = [
  ...specFillers,
  {
    id: "21000000-0000-4000-8000-000000000051",
    code: "size",
    name: "尺寸",
    value_type: "text",
    enum_options: [],
    unit_dimension: null,
    is_required: true,
    participates_in_sku_name: true,
    is_filterable: true,
    sort_order: 10,
    status: "active",
  },
  {
    id: "21000000-0000-4000-8000-000000000052",
    code: "color",
    name: "颜色",
    value_type: "single_enum",
    enum_options: ["灰色", "白色"],
    unit_dimension: null,
    is_required: true,
    participates_in_sku_name: true,
    is_filterable: true,
    sort_order: 20,
    status: "active",
  },
  {
    id: "21000000-0000-4000-8000-000000000053",
    code: "thickness",
    name: "厚度",
    value_type: "number",
    enum_options: [],
    unit_dimension: "length",
    is_required: true,
    participates_in_sku_name: false,
    is_filterable: true,
    sort_order: 30,
    status: "active",
  },
  {
    id: "21000000-0000-4000-8000-000000000054",
    code: "anti_slip",
    name: "防滑",
    value_type: "boolean",
    enum_options: [],
    unit_dimension: null,
    is_required: true,
    participates_in_sku_name: false,
    is_filterable: true,
    sort_order: 40,
    status: "active",
  },
  {
    id: "21000000-0000-4000-8000-000000000055",
    code: "finishes",
    name: "表面工艺",
    value_type: "multi_enum",
    enum_options: ["哑光", "柔光", "亮光"],
    unit_dimension: null,
    is_required: true,
    participates_in_sku_name: false,
    is_filterable: true,
    sort_order: 50,
    status: "active",
  },
  {
    id: "21000000-0000-4000-8000-000000000056",
    code: "available_on",
    name: "上市日期",
    value_type: "date",
    enum_options: [],
    unit_dimension: null,
    is_required: true,
    participates_in_sku_name: false,
    is_filterable: true,
    sort_order: 60,
    status: "active",
  },
];

export const mockStore = {
  config: { sessionMode: "tenant", relationshipStatus: "active" },
  state: { products: [], skus: [], conversions: [], priceLists: [], items: [] },
  catalogSequence: 0,
  createdCatalogIds: [],
  mutations: [],
  requests: [],
};

export function resetMockStore(config = {}) {
  for (const catalogRecords of [categories, brands]) {
    for (let index = catalogRecords.length - 1; index >= 0; index -= 1) {
      if (mockStore.createdCatalogIds.includes(catalogRecords[index].id)) {
        catalogRecords.splice(index, 1);
      }
    }
  }
  mockStore.config = {
    sessionMode: config.sessionMode || "tenant",
    relationshipStatus: config.relationshipStatus || "active",
  };
  const supplierId = platformSuppliers().at(-1).id;
  const category = categories.find(({ id }) => id === ids.category);
  const brand = brands.find(({ id }) => id === ids.brand);
  mockStore.state = {
    products: [
      productRecord(ids.platformProduct, supplierId, "PLATFORM-TILE", "平台共享瓷砖", "platform", null, category, brand),
      productRecord(ids.tenantProduct, supplierId, "TENANT-TILE", "租户私有瓷砖", "tenant", ids.tenant, category, brand),
      productRecord(ids.tenantBProduct, supplierId, "TENANT-B-TILE", "租户 B 私有瓷砖", "tenant", ids.tenantB, category, brand),
    ],
    skus: [
      skuRecord(ids.platformSku, ids.platformProduct, supplierId, "PLATFORM-SKU", "平台共享瓷砖 600×600", "platform", null),
      skuRecord(ids.tenantSku, ids.tenantProduct, supplierId, "TENANT-SKU", "租户私有瓷砖 600×600", "tenant", ids.tenant),
      skuRecord(ids.tenantBSku, ids.tenantBProduct, supplierId, "TENANT-B-SKU", "租户 B 私有瓷砖 600×600", "tenant", ids.tenantB),
    ],
    conversions: [],
    priceLists: [],
    items: [],
  };
  mockStore.catalogSequence = 0;
  mockStore.createdCatalogIds = [];
  mockStore.mutations = [];
  mockStore.requests = [];
}

function productRecord(id, supplierId, code, name, scope, owner, category, brand) {
  return {
    id,
    supplier_id: supplierId,
    product_code: code,
    name,
    description: null,
    status: "active",
    version: 1,
    ownership_scope: scope,
    owner_tenant_id: owner,
    category,
    brand,
    updated_at: now,
  };
}

function skuRecord(id, productId, supplierId, code, name, scope, owner) {
  return {
    id,
    supplier_id: supplierId,
    supplier_product_id: productId,
    sku_code: code,
    name,
    specification: null,
    model: null,
    spec_values: { size: "600×600", color: "灰色" },
    purchase_unit_id: ids.box,
    base_unit_id: ids.box,
    base_unit_conversion: "1",
    batch_managed: false,
    color_managed: false,
    serial_managed: false,
    status: "active",
    version: 1,
    ownership_scope: scope,
    owner_tenant_id: owner,
    purchase_unit: units.find(({ id }) => id === ids.box),
    base_unit: units.find(({ id }) => id === ids.box),
    updated_at: now,
  };
}

export function platformSuppliers() {
  return Array.from({ length: 21 }, (_, index) => {
    const number = index + 1;
    return {
      id: `22000000-0000-4000-8000-${String(number).padStart(12, "0")}`,
      code: `PLATFORM-${String(number).padStart(3, "0")}`,
      name: number === 21 ? "第21家平台供应商" : `平台供应商 ${number}`,
      legal_name: `平台供应商 ${number} 有限公司`,
      unified_social_credit_code: null,
      supplier_type: "manufacturer",
      ownership_scope: "platform",
      owner_tenant_id: null,
      onboarding_status: "approved",
      operational_status: "active",
      qualification_health: "valid",
      version: 1,
      created_at: now,
      updated_at: now,
    };
  });
}

export function tenantRelationships() {
  const tenantId = currentTenantId();
  return platformSuppliers().map((supplier, index) => ({
    id: `23000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    tenant_id: tenantId,
    supplier_id: supplier.id,
    relationship_status: index === 20
      ? mockStore.config.relationshipStatus
      : "active",
    internal_supplier_code: `SUP-${String(index + 1).padStart(6, "0")}`,
    settlement_term_days: 30,
    credit_limit_minor: 0,
    invoice_required_before_payment: true,
    default_currency: "CNY",
    default_tax_inclusive: true,
    tenant_owner_employee_id: null,
    started_at: now,
    ended_at: null,
    remark: null,
    version: 1,
    created_at: now,
    updated_at: now,
    contract_health: "valid",
    supplier: index === 20
      ? { ...supplier, name: "第21家合作供应商" }
      : supplier,
  }));
}

export function currentSession() {
  const platform = mockStore.config.sessionMode.startsWith("platform");
  const denied = mockStore.config.sessionMode === "platform-denied";
  const platformStaff = mockStore.config.sessionMode === "platform-staff" || denied;
  const priceOnly = mockStore.config.sessionMode === "tenant-price-only";
  const tenantId = currentTenantId();
  return {
    user_id: "21000000-0000-4000-8000-000000000010",
    login_channel: "admin_web",
    employee: {
      id: "21000000-0000-4000-8000-000000000011",
      name: platform ? "平台商品管理员" : "采购管理员",
      phone: "18637605353",
      status: "active",
      tenant_department_id: null,
      department_name: platform ? "平台运营部" : "采购部",
      post_id: null,
      post_name: "管理员",
      avatar: null,
    },
    tenant: platform ? null : {
      id: tenantId,
      name: tenantId === ids.tenantB ? "E2E 租户 B" : "E2E 装修公司",
      slug: tenantId === ids.tenantB ? "supplier-product-e2e-b" : "supplier-product-e2e",
      status: "active",
    },
    roles: [platform ? platformStaff ? "platform_staff" : "platform_admin" : "tenant_admin"],
    is_platform_staff: platformStaff,
    permissions: platform
      ? [
          { code: "platform.supplier.view", scope: "all" },
          { code: "platform.catalog.manage", scope: "all" },
          ...(!denied ? [{ code: "platform.supplier-product.manage", scope: "all" }] : []),
        ]
      : [
          { code: "supplier.view", scope: "all" },
          ...(!priceOnly ? [{ code: "supplier.product.view", scope: "all" }] : []),
          ...(!priceOnly ? [{ code: "supplier.product.manage", scope: "all" }] : []),
          { code: "supplier.cost-price.view", scope: "all" },
          { code: "supplier.cost-price.manage", scope: "all" },
        ],
    token: "supplier-product-pricing-token",
    expires_at: "2099-12-31T23:59:59+08:00",
  };
}

export function currentTenantId() {
  return mockStore.config.sessionMode === "tenant-b" ? ids.tenantB : ids.tenant;
}

export function currentServiceAccessSummary() {
  return {
    accessStatus: "workspace_available",
    accessMode: "paid",
    accessLevel: "read_write",
    canEnterWorkspace: true,
    readonly: false,
    trialId: null,
    trialStatus: null,
    startsAt: null,
    endsAt: null,
    evaluatedAt: now,
    title: "平台技术服务可用",
    message: "当前企业可正常使用工作台。",
    primaryAction: { key: "enter_workspace", label: "进入工作台" },
    secondaryAction: null,
  };
}

export function paginate(list, url) {
  const pageNumber = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get("pageSize")) || 20));
  const keyword = (url.searchParams.get("keyword") || "").toLowerCase();
  const filtered = keyword
    ? list.filter((record) => [
        record.name,
        record.product_code,
        record.sku_code,
        record.price_list_code,
        record.code,
        record.supplier?.name,
        record.supplier?.code,
      ].filter(Boolean).some((value) => value.toLowerCase().includes(keyword)))
    : list;
  const start = (pageNumber - 1) * pageSize;
  return {
    list: filtered.slice(start, start + pageSize),
    pagination: {
      page: pageNumber,
      pageSize,
      total: filtered.length,
      totalPages: filtered.length ? Math.ceil(filtered.length / pageSize) : 0,
    },
  };
}

resetMockStore();
