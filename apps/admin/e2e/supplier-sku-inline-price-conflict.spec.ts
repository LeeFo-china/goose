import { expect, test } from "@playwright/test";

import { priceInput } from "./supplier-sku-inline-price-layout-helpers";
import {
  compositeMutations,
  mockBackendBaseUrl,
  monitorBrowser,
  openTenantSkuWorkspace,
  readMutations,
  readState,
  relationshipId,
  tenantProductId,
  tenantSkuId,
} from "./supplier-sku-inline-price-test-helpers";

test("版本冲突刷新隐藏版本并以新幂等尝试成功重试", async ({ page, request }) => {
  const assertNoBrowserErrors = monitorBrowser(page, [{
    status: 409,
    path: `/purchasable-skus/${tenantSkuId}`,
  }]);
  await openTenantSkuWorkspace(page, request, {
    priceScenario: "current",
    compositeConflictOnce: true,
  });
  const before = await readState(request);
  const currentBefore = before.priceLists.find(({ lifecycle_status }) =>
    lifecycle_status === "published");
  const skuBefore = before.skus.find(({ id }) => id === tenantSkuId);
  const row = page.getByRole("row").filter({ hasText: "租户私有瓷砖 600×600" });
  await row.getByRole("button", { name: "编辑 SKU" }).click();
  const dialog = page.getByRole("dialog", { name: "编辑供应商 SKU" });
  await dialog.getByLabel("SKU 名称").fill("冲突后保留的 SKU 名称");
  await priceInput(dialog).fill("333.00");
  const conflictResponsePromise = page.waitForResponse((response) =>
    response.request().method() === "PATCH" &&
    response.url().includes(`/purchasable-skus/${tenantSkuId}`));
  await dialog.getByRole("button", { name: "保存并生效" }).click();
  const conflictResponse = await conflictResponsePromise;
  expect(conflictResponse.status()).toBe(409);
  expect(await conflictResponse.json()).toEqual({
    success: false,
    code: "SUPPLIER_SKU_VERSION_CONFLICT",
    message: "SKU 版本已变化",
  });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("SKU 名称"))
    .toHaveValue("冲突后保留的 SKU 名称");
  await expect(priceInput(dialog)).toHaveValue("333.00");
  await expect(dialog.getByText(/已刷新最新版本.*你填写的内容已保留/))
    .toBeVisible();
  const refreshedPrice = await request.get(
    `${mockBackendBaseUrl}/supplier-products/${tenantProductId}` +
    `/purchasable-skus/${tenantSkuId}/price?tenantSupplierId=${relationshipId}`,
  );
  expect(refreshedPrice.ok()).toBe(true);
  expect(await refreshedPrice.json()).toMatchObject({ data: { current_price: {
    supplier_price_list_id: currentBefore?.id,
    supplier_price_list_row_version: (currentBefore?.row_version ?? 0) + 1,
    unit_price: "129.00",
  } } });

  const retryResponsePromise = page.waitForResponse((response) =>
    response.request().method() === "PATCH" &&
    response.url().includes(`/purchasable-skus/${tenantSkuId}`));
  await dialog.getByRole("button", { name: "保存并生效" }).click();
  const retryResponse = await retryResponsePromise;
  expect(retryResponse.status()).toBe(200);
  expect(await retryResponse.json()).toMatchObject({ success: true, data: {
    sku: { name: "冲突后保留的 SKU 名称" },
    current_price: { unit_price: "333.00" },
  } });
  await expect(dialog).toBeHidden();

  const attempts = compositeMutations(await readMutations(request));
  expect(attempts).toHaveLength(2);
  expect(attempts[0].idempotencyKey).not.toBeNull();
  expect(attempts[1].method).toBe(attempts[0].method);
  expect(attempts[1].path).toBe(attempts[0].path);
  expect(attempts[1].idempotencyKey).not.toBe(attempts[0].idempotencyKey);
  expect(attempts[0].payload).toMatchObject({
    sku: { expected_version: skuBefore?.version,
      name: "冲突后保留的 SKU 名称" },
    price: { expected_price_list_version: currentBefore?.row_version,
      unit_price: "333.00" },
  });
  expect(attempts[1].payload).toMatchObject({
    sku: { expected_version: (skuBefore?.version ?? 0) + 1,
      name: "冲突后保留的 SKU 名称" },
    price: {
      expected_price_list_version: (currentBefore?.row_version ?? 0) + 1,
      unit_price: "333.00",
    },
  });
  expect(attempts[0].result).toEqual({
    error_code: "SUPPLIER_SKU_VERSION_CONFLICT",
  });
  expect(attempts[1].result).toMatchObject({
    status: "saved",
    price_version_created: true,
  });
  const after = await readState(request);
  expect(after.priceLists).toHaveLength(before.priceLists.length + 1);
  expect(after.skus.find(({ id }) => id === tenantSkuId)?.name)
    .toBe("冲突后保留的 SKU 名称");
  assertNoBrowserErrors();
});
