import { expect } from "@playwright/test";

import type { MockState } from "./supplier-sku-inline-price-test-helpers";

const pricedAt = Date.parse("2026-08-19T00:00:00.000Z");

export function assertCreateSourceSeed(state: MockState) {
  const source = state.priceLists.find((list) =>
    list.lifecycle_status === "published" &&
    Date.parse(list.effective_from) <= pricedAt &&
    (list.effective_until === null || Date.parse(list.effective_until) > pricedAt));
  const otherProduct = state.products.find(({ name }) => name === "租户私有辅材");
  const otherSku = state.skus.find(({ name }) => name === "租户私有辅材 标准装");
  const sourceItem = state.items.find((item) =>
    item.supplier_price_list_id === source?.id && item.supplier_sku_id === otherSku?.id);
  const future = state.priceLists.find(({ effective_from }) =>
    Date.parse(effective_from) > pricedAt);
  const futureItems = state.items.filter(({ supplier_price_list_id }) =>
    supplier_price_list_id === future?.id);

  expect(source).toMatchObject({ version_number: 1, lifecycle_status: "published" });
  expect(otherProduct).toBeDefined();
  expect(otherSku).toMatchObject({ supplier_product_id: otherProduct?.id, status: "active" });
  expect(sourceItem).toMatchObject({ unit_price: "76.00" });
  expect(future).toMatchObject({ version_number: 3, lifecycle_status: "published" });

  return { source, sourceItem, otherSku, future, futureItems };
}

export function assertCreateSeriesVersion(
  state: MockState,
  seed: ReturnType<typeof assertCreateSourceSeed>,
  createdSkuId: string | undefined,
) {
  const current = state.priceLists.filter((list) =>
    list.price_list_code === "DEFAULT" && list.scope_type === "default" &&
    list.currency === "CNY" && list.lifecycle_status === "published" &&
    Date.parse(list.effective_from) <= pricedAt &&
    (list.effective_until === null || Date.parse(list.effective_until) > pricedAt));
  expect(current).toHaveLength(1);
  expect(state.priceLists.find(({ id }) => id === seed.source?.id)).toMatchObject({
    lifecycle_status: "retired",
    effective_until: "2026-08-19T00:00:00.000Z",
  });
  expect(current[0]).toMatchObject({
    version_number: 2,
    supersedes_price_list_id: seed.source?.id,
  });
  const copiedOtherItem = state.items.find((item) =>
    item.supplier_price_list_id === current[0].id &&
    item.supplier_sku_id === seed.otherSku?.id);
  expect(copiedOtherItem).toMatchObject({ unit_price: "76.00" });
  expect(copiedOtherItem?.id).not.toBe(seed.sourceItem?.id);
  expect(state.items.find((item) =>
    item.supplier_price_list_id === current[0].id &&
    item.supplier_sku_id === createdSkuId)).toMatchObject({ unit_price: "328.00" });
  expect(state.priceLists.find(({ id }) => id === seed.future?.id)).toEqual(seed.future);
  expect(state.items.filter(({ supplier_price_list_id }) =>
    supplier_price_list_id === seed.future?.id)).toEqual(seed.futureItems);

  return { current: current[0], copiedOtherItem };
}
