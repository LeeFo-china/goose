import { expect, test } from "@playwright/test";
import type { APIRequestContext, Locator, Page, TestInfo } from "@playwright/test";

import {
  compositeMutations,
  expectNoPriceTraffic,
  legacySkuMutations,
  login,
  mockBackendBaseUrl,
  monitorBrowser,
  readMutations,
  readState,
  relationshipId,
  resetMock,
  skuPostMutations,
  tenantProductId,
  tenantSkuId,
} from "./supplier-sku-inline-price-test-helpers";
import type { ResetConfig } from "./supplier-sku-inline-price-test-helpers";

async function selectSupplier(page: Page, platform = false) {
  const name = platform ? "第21家平台供应商" : "第21家合作供应商";
  const search = platform ? "搜索平台供应商" : "搜索合作供应商";
  const select = platform ? "平台供应商" : "合作供应商";
  await page.getByLabel(search).fill(name);
  await page.getByRole("button", { name: search, exact: true }).click();
  await page.getByLabel(select, { exact: true }).click();
  await page.getByRole("option", { name: new RegExp(name) }).click();
}

async function openTenantSkuWorkspace(
  page: Page,
  request: APIRequestContext,
  config: ResetConfig = {},
) {
  await resetMock(request, config);
  await login(page);
  await page.goto("/supplier-products", { waitUntil: "networkidle" });
  await selectSupplier(page);
  const productRow = page.getByRole("row").filter({ hasText: "租户私有瓷砖" });
  await productRow.getByRole("button", { name: "查看 SKU" }).click();
  await expect(page).toHaveURL(new RegExp(`productId=${tenantProductId}`));
  await expect(page.getByRole("row").filter({
    hasText: "租户私有瓷砖 600×600",
  })).toBeVisible();
  await page.waitForLoadState("networkidle");
}

async function choosePurchaseUnit(page: Page, dialog: Locator) {
  await dialog.getByRole("combobox", { name: "采购单位" }).click();
  await page.getByPlaceholder("搜索采购单位名称").fill("箱");
  await page.getByRole("option", { name: /^箱/ }).click();
}

async function fillRequiredSkuFields(
  page: Page,
  dialog: Locator,
  name: string,
) {
  await dialog.getByLabel("SKU 名称").fill(name);
  await dialog.getByLabel("尺寸").fill("800×800×10mm");
  await dialog.getByRole("combobox", { name: "颜色 *" }).click();
  await page.getByRole("option", { name: "灰色", exact: true }).click();
  await dialog.getByLabel("厚度 *").fill("10");
  await dialog.getByRole("switch", { name: "防滑 *" }).click();
  await dialog.getByRole("checkbox", { name: "哑光" }).click();
  await dialog.getByLabel("上市日期 *").fill("2026-09-01");
  await choosePurchaseUnit(page, dialog);
}

function priceInput(dialog: Locator) {
  return dialog.getByLabel(/基础供货价/);
}

async function assertCreateDialogLayout(
  page: Page,
  dialog: Locator,
  testInfo: TestInfo,
  screenshotName: string,
) {
  await page.screenshot({ path: testInfo.outputPath(screenshotName) });
  const viewport = page.viewportSize();
  const dialogBox = await dialog.boundingBox();
  expect(viewport).not.toBeNull();
  expect(dialogBox).not.toBeNull();
  if (!viewport || !dialogBox) throw new TypeError("无法读取弹窗 viewport 边界");
  expect(dialogBox.x).toBeGreaterThanOrEqual(0);
  expect(dialogBox.y).toBeGreaterThanOrEqual(0);
  expect(dialogBox.x + dialogBox.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(dialogBox.y + dialogBox.height).toBeLessThanOrEqual(viewport.height + 1);
  const scrollState = await dialog.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      overflowY: style.overflowY,
      hasScrollableContent: element.scrollHeight > element.clientHeight,
    };
  });
  expect(["auto", "scroll"]).toContain(scrollState.overflowY);
  expect(scrollState.hasScrollableContent).toBe(true);

  const amount = priceInput(dialog);
  await amount.fill("328.00");
  const suffix = dialog.getByText("元 / 箱", { exact: true });
  const [amountBox, suffixBox, valueRight] = await Promise.all([
    amount.boundingBox(),
    suffix.boundingBox(),
    amount.evaluate((element) => {
      const input = element as HTMLInputElement;
      const style = getComputedStyle(input);
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      if (!context) return 0;
      context.font = style.font;
      return input.getBoundingClientRect().x + Number.parseFloat(style.paddingLeft) +
        context.measureText(input.value).width;
    }),
  ]);
  expect(amountBox).not.toBeNull();
  expect(suffixBox).not.toBeNull();
  if (!amountBox || !suffixBox) throw new TypeError("无法读取价格输入布局");
  expect(suffixBox.x + suffixBox.width).toBeLessThanOrEqual(
    amountBox.x + amountBox.width,
  );
  expect(valueRight + 8).toBeLessThanOrEqual(suffixBox.x);

  for (const control of [
    dialog.getByRole("combobox", { name: /税率/ }),
    dialog.getByRole("switch", { name: "含税价格" }),
    dialog.getByRole("button", { name: "保存并生效" }),
  ]) {
    await control.scrollIntoViewIfNeeded();
    await expect(control).toBeVisible();
  }
  expect(await page.evaluate(() =>
    document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await expect(dialog.locator('[data-slot="card"]')).toHaveCount(0);
}

test("全权限租户一次创建可采购 SKU 与即时未税价", async ({ page, request }, testInfo) => {
  const assertNoBrowserErrors = monitorBrowser(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openTenantSkuWorkspace(page, request, { tenantProductStatus: "draft" });
  const mutationStart = (await readMutations(request)).length;
  await page.getByRole("button", { name: "新增 SKU" }).click();
  const dialog = page.getByRole("dialog", { name: "新增供应商 SKU" });
  await expect(priceInput(dialog)).toHaveValue("");
  await expect(dialog.getByRole("combobox", { name: /税率/ })).toHaveText("13%");
  await expect(dialog.getByRole("switch", { name: "含税价格" })).not.toBeChecked();
  await fillRequiredSkuFields(page, dialog, "E2E 即时价格瓷砖");
  await expect(dialog.getByText("元 / 箱", { exact: true })).toBeVisible();
  await assertCreateDialogLayout(
    page,
    dialog,
    testInfo,
    "supplier-sku-inline-price-create-desktop.png",
  );
  await dialog.getByRole("button", { name: "保存并生效" }).click();
  await expect(dialog).toBeHidden();

  const interactionMutations = (await readMutations(request)).slice(mutationStart);
  const composites = compositeMutations(interactionMutations);
  expect(skuPostMutations(interactionMutations)).toHaveLength(1);
  expect(composites).toHaveLength(1);
  expect(legacySkuMutations(interactionMutations)).toHaveLength(0);
  expect(composites[0]).toMatchObject({
    method: "POST",
    path: expect.stringMatching(
      new RegExp(`^/supplier-products/${tenantProductId}/purchasable-skus/[^/]+$`),
    ),
    payload: {
      sku: expect.objectContaining({
        name: "E2E 即时价格瓷砖",
        purchase_unit_id: expect.any(String),
      }),
      price: {
        unit_price: "328.00",
        tax_rate: "0.13",
        tax_inclusive: false,
      },
    },
    result: { price_version_created: true },
  });
  const state = await readState(request);
  expect(state.products.find(({ id }) => id === tenantProductId)?.status).toBe("active");
  const createdSku = state.skus.find(({ name }) => name === "E2E 即时价格瓷砖");
  expect(createdSku?.status).toBe("active");

  const resolver = await request.get(
    `${mockBackendBaseUrl}/supplier-purchase-order-catalog` +
    `?tenantSupplierId=${relationshipId}&page=1&pageSize=20&keyword=E2E`,
  );
  expect(resolver.ok()).toBe(true);
  expect(await resolver.json()).toMatchObject({
    data: {
      list: [expect.objectContaining({
        supplier_sku_id: createdSku?.id,
        unit_price: "328.00",
        tax_rate: "0.13",
        tax_inclusive: false,
      })],
    },
  });
  assertNoBrowserErrors();
});

test("编辑预填当前价并区分元数据更新与新价格版本", async ({ page, request }) => {
  const assertNoBrowserErrors = monitorBrowser(page);
  await openTenantSkuWorkspace(page, request, { priceScenario: "current" });
  let row = page.getByRole("row").filter({ hasText: "租户私有瓷砖 600×600" });
  await row.getByRole("button", { name: "编辑 SKU" }).click();
  let dialog = page.getByRole("dialog", { name: "编辑供应商 SKU" });
  await expect(priceInput(dialog)).toHaveValue("128.00");
  await dialog.getByLabel("SKU 名称").fill("租户私有瓷砖 600×600 新包装");
  await dialog.getByRole("button", { name: "保存并生效" }).click();
  await expect(dialog).toBeHidden();
  let composite = compositeMutations(await readMutations(request));
  expect(composite).toHaveLength(1);
  expect(composite[0].result?.price_version_created).toBe(false);
  expect((await readState(request)).priceLists).toHaveLength(1);

  row = page.getByRole("row").filter({ hasText: "租户私有瓷砖 600×600 新包装" });
  await row.getByRole("button", { name: "编辑 SKU" }).click();
  dialog = page.getByRole("dialog", { name: "编辑供应商 SKU" });
  await expect(priceInput(dialog)).toHaveValue("128.00");
  await priceInput(dialog).fill("138.00");
  await dialog.getByRole("button", { name: "保存并生效" }).click();
  await expect(dialog).toBeHidden();
  composite = compositeMutations(await readMutations(request));
  expect(composite).toHaveLength(2);
  expect(composite[1].result?.price_version_created).toBe(true);
  const state = await readState(request);
  expect(state.priceLists).toHaveLength(2);
  const currentList = state.priceLists.find(({ lifecycle_status }) =>
    lifecycle_status === "published");
  expect(currentList?.version_number).toBe(2);
  expect(state.items.find(({ supplier_price_list_id }) =>
    supplier_price_list_id === currentList?.id)?.unit_price).toBe("138.00");
  assertNoBrowserErrors();
});

test("即时调价止于未来计划且不改写未来版本", async ({ page, request }) => {
  const assertNoBrowserErrors = monitorBrowser(page);
  await openTenantSkuWorkspace(page, request, { priceScenario: "future" });
  const before = await readState(request);
  const futureBefore = before.priceLists.find(({ version_number }) => version_number === 2);
  const futureItemBefore = before.items.find(({ supplier_price_list_id }) =>
    supplier_price_list_id === futureBefore?.id);
  const row = page.getByRole("row").filter({ hasText: "租户私有瓷砖 600×600" });
  await row.getByRole("button", { name: "编辑 SKU" }).click();
  const dialog = page.getByRole("dialog", { name: "编辑供应商 SKU" });
  await expect(dialog.getByText(/本次价格有效至.*2026.*9.*1.*08:00/)).toBeVisible();
  await priceInput(dialog).fill("148.00");
  await dialog.getByRole("button", { name: "保存并生效" }).click();
  await expect(dialog).toBeHidden();

  const after = await readState(request);
  expect(after.priceLists.find(({ id }) => id === futureBefore?.id)).toEqual(futureBefore);
  expect(after.items.find(({ id }) => id === futureItemBefore?.id)).toEqual(futureItemBefore);
  const immediate = after.priceLists.find(({ version_number }) => version_number === 3);
  expect(immediate).toMatchObject({
    lifecycle_status: "published",
    effective_until: futureBefore?.effective_from,
  });
  assertNoBrowserErrors();
});

test("停用 SKU 仅允许 legacy 元数据更新且不读取价格", async ({ page, request }) => {
  const assertNoBrowserErrors = monitorBrowser(page);
  await openTenantSkuWorkspace(page, request, { tenantSkuStatus: "inactive" });
  const row = page.getByRole("row").filter({ hasText: "租户私有瓷砖 600×600" });
  await row.getByRole("button", { name: "编辑 SKU" }).click();
  const dialog = page.getByRole("dialog", { name: "编辑供应商 SKU" });
  await expect(priceInput(dialog)).toBeDisabled();
  await expect(dialog.getByRole("combobox", { name: /税率/ })).toBeDisabled();
  await expect(dialog.getByRole("switch", { name: "含税价格" })).toBeDisabled();
  await expect(dialog.getByText("启用 SKU 后可调整供货价")).toBeVisible();
  await dialog.getByLabel("SKU 名称").fill("停用 SKU 元数据更新");
  await dialog.getByRole("button", { name: "保存修改" }).click();
  await expect(dialog).toBeHidden();
  const mutations = await readMutations(request);
  expect(mutations).toContainEqual(expect.objectContaining({
    method: "PATCH",
    path: `/supplier-products/${tenantProductId}/skus/${tenantSkuId}`,
  }));
  expect(compositeMutations(mutations)).toHaveLength(0);
  await page.waitForLoadState("networkidle");
  await expectNoPriceTraffic(request);
  assertNoBrowserErrors();
});

test("仅商品权限沿用 legacy 草稿创建且不读取价格", async ({ page, request }) => {
  const assertNoBrowserErrors = monitorBrowser(page);
  await openTenantSkuWorkspace(page, request, { sessionMode: "tenant-product-only" });
  await page.getByRole("button", { name: "新增 SKU" }).click();
  const dialog = page.getByRole("dialog", { name: "新增供应商 SKU" });
  await expect(dialog.getByText("采购价格", { exact: true })).toHaveCount(0);
  await fillRequiredSkuFields(page, dialog, "仅商品权限草稿 SKU");
  await dialog.getByRole("button", { name: "保存 SKU" }).click();
  await expect(dialog).toBeHidden();
  const mutations = await readMutations(request);
  expect(mutations).toContainEqual(expect.objectContaining({
    method: "POST",
    path: expect.stringMatching(
      new RegExp(`^/supplier-products/${tenantProductId}/skus/[^/]+$`),
    ),
  }));
  expect((await readState(request)).skus.find(({ name }) =>
    name === "仅商品权限草稿 SKU")?.status).toBe("draft");
  await page.waitForLoadState("networkidle");
  await expectNoPriceTraffic(request);
  assertNoBrowserErrors();
});

test("价格冲突保留输入并以同一幂等尝试重试", async ({ page, request }) => {
  const assertNoBrowserErrors = monitorBrowser(page, [{
    status: 409,
    path: `/purchasable-skus/${tenantSkuId}`,
  }]);
  await openTenantSkuWorkspace(page, request, {
    priceScenario: "current",
    compositeConflictOnce: true,
  });
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
    code: "SUPPLIER_PRICE_LIST_VERSION_CONFLICT",
    message: "价格版本已变化，请重试",
  });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("SKU 名称")).toHaveValue("冲突后保留的 SKU 名称");
  await expect(priceInput(dialog)).toHaveValue("333.00");
  const retryResponsePromise = page.waitForResponse((response) =>
    response.request().method() === "PATCH" &&
    response.url().includes(`/purchasable-skus/${tenantSkuId}`));
  await dialog.getByRole("button", { name: "保存并生效" }).click();
  expect((await retryResponsePromise).ok()).toBe(true);
  await expect(dialog).toBeHidden();

  const attempts = compositeMutations(await readMutations(request));
  expect(attempts).toHaveLength(2);
  expect(attempts[0].idempotencyKey).not.toBeNull();
  expect(attempts[1].method).toBe(attempts[0].method);
  expect(attempts[1].path).toBe(attempts[0].path);
  expect(attempts[1].idempotencyKey).toBe(attempts[0].idempotencyKey);
  expect(attempts[1].payload).toEqual(attempts[0].payload);
  expect(attempts[1].result).toMatchObject({ price_version_created: true });
  assertNoBrowserErrors();
});

test("平台 SKU 表单不展示租户价格也不发起价格请求", async ({ page, request }) => {
  const assertNoBrowserErrors = monitorBrowser(page);
  await resetMock(request, { sessionMode: "platform-staff" });
  await login(page);
  await page.goto("/platform/supplier-products", { waitUntil: "networkidle" });
  await selectSupplier(page, true);
  const productRow = page.getByRole("row").filter({ hasText: "平台共享瓷砖" });
  await productRow.getByRole("button", { name: "查看 SKU" }).click();
  const skuRow = page.getByRole("row").filter({ hasText: "平台共享瓷砖 600×600" });
  await skuRow.getByRole("button", { name: "编辑 SKU" }).click();
  const dialog = page.getByRole("dialog", { name: "编辑供应商 SKU" });
  await expect(dialog.getByText("采购价格", { exact: true })).toHaveCount(0);
  await page.waitForLoadState("networkidle");
  await expectNoPriceTraffic(request);
  assertNoBrowserErrors();
});

test("移动端创建弹窗保持可滚动且关键价格控件可达", async ({ page, request }, testInfo) => {
  const assertNoBrowserErrors = monitorBrowser(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await openTenantSkuWorkspace(page, request, { tenantProductStatus: "draft" });
  await page.getByRole("button", { name: "新增 SKU" }).click();
  const dialog = page.getByRole("dialog", { name: "新增供应商 SKU" });
  await fillRequiredSkuFields(page, dialog, "移动端即时价格 SKU");
  await assertCreateDialogLayout(
    page,
    dialog,
    testInfo,
    "supplier-sku-inline-price-create-mobile.png",
  );
  assertNoBrowserErrors();
});
