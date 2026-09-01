import {
  currentTenantId,
  ids,
  mockStore,
  now,
  platformSuppliers,
} from "./supplier-product-pricing-mock-state.mjs";

const inlineIds = {
  currentList: "28000000-0000-4000-8000-000000000001",
  currentItem: "28100000-0000-4000-8000-000000000001",
  futureList: "28000000-0000-4000-8000-000000000002",
  futureItem: "28100000-0000-4000-8000-000000000002",
  secondarySku: "21000000-0000-4000-8000-000000000043",
  secondaryCurrentItem: "28100000-0000-4000-8000-000000000003",
  secondaryFutureItem: "28100000-0000-4000-8000-000000000004",
};

export const futureStart = "2026-09-01T00:00:00.000Z";

const sequence = { list: 2, item: 4 };

export function resetInlinePriceState(config = {}) {
  sequence.list = 2;
  sequence.item = 4;
  if (config.priceScenario !== "current" && config.priceScenario !== "future") return;
  const supplierId = platformSuppliers().at(-1).id;
  const targetSku = skuById(ids.tenantSku);
  const secondarySku = seedSecondarySku();
  const currentList = priceListRecord({
    id: inlineIds.currentList,
    supplierId,
    version: 1,
    effectiveFrom: "2026-08-01T00:00:00.000Z",
    effectiveUntil: config.priceScenario === "future" ? futureStart : null,
    rowVersion: 4,
  });
  mockStore.state.priceLists.push(currentList);
  mockStore.state.items.push(
    priceItemRecord({
      id: inlineIds.currentItem,
      priceListId: currentList.id,
      sku: targetSku,
      unitPrice: "128.00",
    }),
    priceItemRecord({
      id: inlineIds.secondaryCurrentItem,
      priceListId: currentList.id,
      sku: secondarySku,
      unitPrice: "96.00",
    }),
  );
  if (config.priceScenario !== "future") return;
  const futureList = priceListRecord({
    id: inlineIds.futureList,
    supplierId,
    version: 2,
    effectiveFrom: futureStart,
    effectiveUntil: null,
    rowVersion: 2,
  });
  mockStore.state.priceLists.push(futureList);
  mockStore.state.items.push(
    priceItemRecord({
      id: inlineIds.futureItem,
      priceListId: futureList.id,
      sku: targetSku,
      unitPrice: "188.00",
    }),
    priceItemRecord({
      id: inlineIds.secondaryFutureItem,
      priceListId: futureList.id,
      sku: secondarySku,
      unitPrice: "118.00",
    }),
  );
}

export function resolveCurrentPrice(skuId) {
  const pricedAt = Date.parse(now);
  const candidate = mockStore.state.items
    .filter((item) => !skuId || item.supplier_sku_id === skuId)
    .map((item) => ({
      item,
      list: mockStore.state.priceLists.find(({ id }) =>
        id === item.supplier_price_list_id),
    }))
    .filter(({ list }) => list?.lifecycle_status === "published" &&
      list.currency === "CNY" && Date.parse(list.effective_from) <= pricedAt &&
      (list.effective_until === null || Date.parse(list.effective_until) > pricedAt))
    .sort((left, right) =>
      right.list.version_number - left.list.version_number ||
      Date.parse(right.list.effective_from) - Date.parse(left.list.effective_from))[0];
  if (!candidate) return null;
  const { item, list } = candidate;
  return {
    supplier_price_list_id: list.id,
    supplier_price_list_version: list.version_number,
    supplier_price_list_row_version: list.row_version,
    supplier_price_list_item_id: item.id,
    unit_price: item.unit_price,
    tax_rate: item.tax_rate,
    tax_inclusive: item.tax_inclusive,
    effective_from: list.effective_from,
    effective_until: list.effective_until,
  };
}

export function earliestFutureList() {
  return mockStore.state.priceLists
    .filter((record) => record.lifecycle_status === "published" &&
      Date.parse(record.effective_from) > Date.parse(now))
    .sort((left, right) => Date.parse(left.effective_from) -
      Date.parse(right.effective_from))[0];
}

export function advanceCurrentPriceRowVersion(skuId) {
  const current = resolveCurrentPrice(skuId);
  const list = mockStore.state.priceLists.find(({ id }) =>
    id === current?.supplier_price_list_id);
  if (!list) return false;
  list.row_version += 1;
  list.updated_at = now;
  return true;
}

export function samePrice(current, price) {
  return canonicalDecimal(current.unit_price) === canonicalDecimal(price.unit_price) &&
    canonicalDecimal(current.tax_rate) === canonicalDecimal(price.tax_rate) &&
    current.tax_inclusive === price.tax_inclusive;
}

export function createImmediatePriceVersion(sku, price, current) {
  const source = current
    ? mockStore.state.priceLists.find(({ id }) => id === current.supplier_price_list_id)
    : null;
  const sourceItems = source
    ? mockStore.state.items.filter(({ supplier_price_list_id }) =>
        supplier_price_list_id === source.id)
    : [];
  const future = earliestFutureList();
  if (source) retirePriceList(source);
  sequence.list += 1;
  const list = priceListRecord({
    id: nextId("28000000", sequence.list),
    supplierId: sku.supplier_id,
    version: Math.max(0, ...mockStore.state.priceLists.map(({ version_number }) =>
      version_number)) + 1,
    effectiveFrom: now,
    effectiveUntil: future?.effective_from ?? null,
    rowVersion: 1,
  });
  list.supersedes_price_list_id = source?.id ?? null;
  mockStore.state.priceLists.push(list);
  if (sourceItems.length === 0) {
    mockStore.state.items.push(targetPriceItem(list.id, sku, price));
    return;
  }
  mockStore.state.items.push(...sourceItems.map((item) => {
    const cloned = {
      ...structuredClone(item),
      id: nextItemId(),
      supplier_price_list_id: list.id,
      updated_at: now,
    };
    if (item.supplier_sku_id !== sku.id) return cloned;
    return {
      ...cloned,
      unit_price: price.unit_price,
      tax_rate: price.tax_rate,
      tax_inclusive: price.tax_inclusive,
      sku: skuSnapshot(sku),
      purchase_unit: sku.purchase_unit,
      base_unit: sku.base_unit,
    };
  }));
}

function seedSecondarySku() {
  const source = skuById(ids.tenantSku);
  const secondary = {
    ...structuredClone(source),
    id: inlineIds.secondarySku,
    sku_code: "TENANT-SKU-SECONDARY",
    name: "租户私有瓷砖 300×600",
    spec_values: { ...source.spec_values, size: "300×600" },
  };
  mockStore.state.skus.push(secondary);
  return secondary;
}

function skuById(skuId) {
  return mockStore.state.skus.find(({ id }) => id === skuId);
}

function canonicalDecimal(value) {
  const [integer, fraction = ""] = value.split(".");
  const trimmed = fraction.replace(/0+$/, "");
  return trimmed ? `${integer}.${trimmed}` : integer;
}

function retirePriceList(list) {
  list.lifecycle_status = "retired";
  list.effective_until = now;
  list.row_version += 1;
  list.updated_at = now;
}

function targetPriceItem(priceListId, sku, price) {
  const item = priceItemRecord({
    id: nextItemId(),
    priceListId,
    sku,
    unitPrice: price.unit_price,
    taxRate: price.tax_rate,
  });
  item.tax_inclusive = price.tax_inclusive;
  return item;
}

function nextItemId() {
  sequence.item += 1;
  return nextId("28100000", sequence.item);
}

function nextId(prefix, value) {
  return `${prefix}-0000-4000-8000-${String(value).padStart(12, "0")}`;
}

function priceListRecord({
  id,
  supplierId,
  version,
  effectiveFrom,
  effectiveUntil,
  rowVersion,
}) {
  return {
    id,
    tenant_id: currentTenantId(),
    supplier_id: supplierId,
    price_list_code: "DEFAULT",
    version_number: version,
    scope_type: "default",
    name: "默认基础供货价",
    currency: "CNY",
    lifecycle_status: "published",
    effective_from: effectiveFrom,
    effective_until: effectiveUntil,
    supersedes_price_list_id: null,
    published_at: now,
    row_version: rowVersion,
    updated_at: now,
  };
}

function priceItemRecord({ id, priceListId, sku, unitPrice, taxRate = "0.13" }) {
  return {
    id,
    tenant_id: currentTenantId(),
    supplier_id: sku.supplier_id,
    supplier_price_list_id: priceListId,
    supplier_sku_id: sku.id,
    minimum_quantity: "1",
    maximum_quantity: null,
    purchase_unit_id: sku.purchase_unit_id,
    base_unit_id: sku.base_unit_id,
    base_unit_conversion: sku.base_unit_conversion,
    unit_price: unitPrice,
    tax_rate: taxRate,
    tax_inclusive: false,
    sku: skuSnapshot(sku),
    purchase_unit: sku.purchase_unit,
    base_unit: sku.base_unit,
    updated_at: now,
  };
}

function skuSnapshot(sku) {
  return { id: sku.id, sku_code: sku.sku_code, name: sku.name, status: sku.status };
}
