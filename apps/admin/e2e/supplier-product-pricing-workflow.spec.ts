import { expect, test } from "@playwright/test";
import type { APIRequestContext, Page } from "@playwright/test";

const mockBackendBaseUrl = "http://127.0.0.1:3996";

type Mutation = {
  method: string;
  path: string;
  idempotencyKey: string | null;
  payload: Record<string, unknown>;
};

type LoggedRequest = { method: string; path: string; query: string };

async function resetMock(
  request: APIRequestContext,
  config: { sessionMode?: string; relationshipStatus?: string } = {},
) {
  const response = await request.post(`${mockBackendBaseUrl}/__test/reset`, {
    data: config,
  });
  expect(response.ok()).toBe(true);
}

async function login(page: Page) {
  const response = await page.request.post("/api/auth/login", {
    data: { phone: "18637605353", code: "" },
  });
  expect(response.ok()).toBe(true);
}

async function readMutations(request: APIRequestContext) {
  const response = await request.get(`${mockBackendBaseUrl}/__test/mutations`);
  expect(response.ok()).toBe(true);
  return (await response.json() as { mutations: Mutation[] }).mutations;
}

async function readRequests(request: APIRequestContext) {
  const response = await request.get(`${mockBackendBaseUrl}/__test/requests`);
  expect(response.ok()).toBe(true);
  return (await response.json() as { requests: LoggedRequest[] }).requests;
}

async function selectTwentyFirstSupplier(page: Page, platform = false) {
  const searchLabel = platform ? "搜索平台供应商" : "搜索合作供应商";
  const searchButton = platform ? "搜索平台供应商" : "搜索合作供应商";
  const supplierName = platform ? "第21家平台供应商" : "第21家合作供应商";
  await page.getByLabel(searchLabel).fill(supplierName);
  await page.getByRole("button", { name: searchButton, exact: true }).click();
  const selectorLabel = platform ? "平台供应商" : "合作供应商";
  await page.getByLabel(selectorLabel, { exact: true }).click();
  await page.getByRole("option", { name: new RegExp(supplierName) }).click();
  await expect(page.getByText(supplierName, { exact: false }).first()).toBeVisible();
}

async function chooseCatalogOption(
  page: Page,
  dialog: ReturnType<Page["getByRole"]>,
  label: string,
  keyword: string,
  optionName: RegExp,
) {
  await dialog.getByRole("combobox", { name: label, exact: true }).click();
  await page.getByPlaceholder(`搜索${label}名称或编码`).fill(keyword);
  await page.getByRole("option", { name: optionName }).click();
}

async function fillStructuredSku(
  page: Page,
  dialogName: string,
  code: string,
  expectedName: string,
) {
  const dialog = page.getByRole("dialog", { name: dialogName });
  await dialog.getByLabel("SKU 编码").fill(code);
  await dialog.getByLabel("尺寸").fill("800×800×10mm");
  await dialog.getByRole("combobox", { name: "颜色 *" }).click();
  await page.getByRole("option", { name: "灰色", exact: true }).click();
  await dialog.getByLabel("厚度 *").fill("10");
  await dialog.getByRole("switch", { name: "防滑 *" }).click();
  await dialog.getByRole("checkbox", { name: "哑光" }).click();
  await dialog.getByRole("checkbox", { name: "柔光" }).click();
  await dialog.getByLabel("上市日期 *").fill("2026-08-19");
  await dialog.getByRole("button", { name: "使用建议名称" }).click();
  await expect(dialog.getByLabel("SKU 名称")).toHaveValue(expectedName);
  await chooseCatalogOption(page, dialog, "采购单位", "箱", /^箱/);
  await expect(dialog.getByLabel("代录原因")).toHaveCount(0);
  await dialog.getByRole("button", { name: "保存 SKU" }).click();
}

async function saveConversionChain(page: Page, skuName: string) {
  const skuRow = page.getByRole("row").filter({ hasText: skuName });
  await skuRow.getByRole("button", { name: "单位换算" }).click();
  const dialog = page.getByRole("dialog", { name: `维护 ${skuName} 的单位换算` });
  await dialog.getByRole("combobox", { name: "库存基本单位" }).click();
  await page.getByRole("option", { name: /^片/ }).click();
  await dialog.getByRole("button", { name: "添加换算边" }).click();
  await dialog.getByLabel("源单位 1").click();
  await page.getByRole("option", { name: /^箱/ }).click();
  await dialog.getByLabel("目标单位 1").click();
  await page.getByRole("option", { name: /^片/ }).click();
  await dialog.getByLabel("换算系数 1").fill("8");
  await dialog.getByRole("button", { name: "添加换算边" }).click();
  await dialog.getByLabel("源单位 2").click();
  await page.getByRole("option", { name: /^片/ }).click();
  await dialog.getByLabel("目标单位 2").click();
  await page.getByRole("option", { name: /^平方米/ }).click();
  await dialog.getByLabel("换算系数 2").fill("0.18");
  await expect(dialog.getByText("1 箱 = 8 片 = 1.44 平方米")).toBeVisible();
  await dialog.getByRole("button", { name: "保存单位换算" }).click();
  await expect(dialog).toBeHidden();
}

test("租户可检索第21个合作供应商并维护私有商品、规格、换算和价格", async ({
  page,
  request,
}) => {
  await resetMock(request);
  await login(page);
  await page.goto("/supplier-products", { waitUntil: "networkidle" });
  await selectTwentyFirstSupplier(page);

  await expect(page.getByText("平台共享", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("租户私有", { exact: true }).first()).toBeVisible();

  const sharedRow = page.getByRole("row").filter({ hasText: "平台共享瓷砖" });
  await expect(sharedRow.getByRole("button", { name: "编辑商品" })).toHaveCount(0);
  await sharedRow.getByRole("button", { name: "查看 SKU" }).click();
  const sharedSkuRow = page.getByRole("row").filter({ hasText: "PLATFORM-SKU" });
  await expect(sharedSkuRow.getByRole("button", { name: "编辑 SKU" })).toHaveCount(0);
  await expect(sharedSkuRow.getByRole("button", { name: "查看换算" })).toBeVisible();

  await page.getByRole("button", { name: "新增商品" }).click();
  let dialog = page.getByRole("dialog", { name: "新增租户私有商品" });
  await expect(dialog.getByLabel("商品编码")).toBeDisabled();
  await expect(dialog.getByLabel("商品编码")).toHaveValue("保存后系统自动生成");
  await dialog.getByLabel("商品名称").fill("E2E 瓷砖");
  await dialog.getByRole("combobox", { name: "分类", exact: true }).click();
  await page.getByPlaceholder("搜索分类名称或编码").fill("砖");
  await expect(
    page.getByRole("option", { name: /主材 \/ 瓷砖 \/ 地砖/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("option", { name: /租户主材 \/ 定制砖/ }),
  ).toBeVisible();
  await expect(page.getByRole("option", { name: /其他租户分类/ })).toHaveCount(0);
  await page.getByRole("option", { name: /租户主材 \/ 定制砖/ }).click();
  await chooseCatalogOption(page, dialog, "品牌", "租户自有品牌", /租户自有品牌/);
  await expect(page.getByRole("option", { name: /其他租户品牌/ })).toHaveCount(0);
  await expect(dialog.getByLabel("代录原因")).toHaveCount(0);
  await dialog.getByRole("button", { name: "保存商品" }).click();
  await expect(page.getByText("E2E 瓷砖", { exact: true })).toBeVisible();

  const productRow = page.getByRole("row").filter({ hasText: "E2E 瓷砖" });
  await productRow.getByRole("button", { name: "查看 SKU" }).click();
  await page.getByRole("button", { name: "新增 SKU" }).click();
  await fillStructuredSku(
    page,
    "新增供应商 SKU",
    "E2E-SKU",
    "租户自有品牌 E2E 瓷砖 800×800×10mm 灰色",
  );
  await expect(page.getByText("E2E-SKU", { exact: true })).toBeVisible();
  await saveConversionChain(page, "租户自有品牌 E2E 瓷砖 800×800×10mm 灰色");

  let skuRow = page.getByRole("row").filter({ hasText: "E2E-SKU" });
  await skuRow.getByRole("button", { name: "启用 SKU" }).click();
  dialog = page.getByRole("dialog", { name: /启用.*800×800×10mm/ });
  await expect(dialog.getByLabel("代录原因")).toHaveCount(0);
  await dialog.getByRole("button", { name: "确认启用" }).click();

  await productRow.getByRole("button", { name: "启用商品" }).click();
  dialog = page.getByRole("dialog", { name: /启用 E2E 瓷砖/ });
  await expect(dialog.getByLabel("代录原因")).toHaveCount(0);
  await dialog.getByRole("button", { name: "确认启用" }).click();

  await page.getByRole("tab", { name: "基础供货价" }).click();
  await page.getByRole("button", { name: "新建价格草稿" }).click();
  dialog = page.getByRole("dialog", { name: "新建默认基础供货价" });
  await dialog.getByLabel("价格簿编码").fill("E2E-BASE");
  await dialog.getByLabel("价格簿名称").fill("E2E 默认基础价");
  await dialog.getByLabel("生效时间").fill("2026-08-20T00:00");
  await expect(dialog.getByLabel("代录原因")).toHaveCount(0);
  await dialog.getByRole("button", { name: "保存价格草稿" }).click();

  const priceRow = page.getByRole("row").filter({ hasText: "E2E 默认基础价" });
  await priceRow.getByRole("button", { name: "查看条目" }).click();
  await page.getByRole("button", { name: "添加价格条目" }).click();
  dialog = page.getByRole("dialog", { name: "添加基础供货价条目" });
  await dialog.getByLabel("SKU").click();
  await page.getByRole("option", { name: /800×800×10mm/ }).click();
  await dialog.getByLabel("基础单价").fill("88.00");
  await dialog.getByLabel("税率（0–1）").fill("0.13");
  await dialog.getByRole("button", { name: "保存价格条目" }).click();
  await expect(page.getByText("CNY 88.00", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "添加价格条目" }).click();
  dialog = page.getByRole("dialog", { name: "添加基础供货价条目" });
  await expect(dialog.getByLabel("基础单价")).toHaveValue("");
  await expect(dialog.getByLabel("税率（0–1）")).toHaveValue("0.13");
  await dialog.getByLabel("基础单价").fill("99.00");
  await dialog.getByLabel("税率（0–1）").fill("0.09");
  await dialog.getByRole("button", { name: "取消" }).click();
  await page.getByRole("button", { name: "添加价格条目" }).click();
  dialog = page.getByRole("dialog", { name: "添加基础供货价条目" });
  await expect(dialog.getByLabel("基础单价")).toHaveValue("");
  await expect(dialog.getByLabel("税率（0–1）")).toHaveValue("0.13");
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "发布价格" }).click();
  dialog = page.getByRole("dialog", { name: "发布基础供货价" });
  await dialog.getByRole("button", { name: "确认发布" }).click();
  await expect(priceRow.getByText("已发布", { exact: true })).toBeVisible();

  const mutations = await readMutations(request);
  expect(mutations).toHaveLength(8);
  expect(mutations.every(({ payload }) => !("proxy_reason" in payload))).toBe(true);
  expect("product_code" in mutations[0].payload).toBe(false);
  expect(mutations[1].payload).toMatchObject({
    spec_values: {
      size: "800×800×10mm",
      color: "灰色",
      thickness: 10,
      anti_slip: true,
      finishes: ["哑光", "柔光"],
      available_on: "2026-08-19",
    },
  });
  expect(mutations[2]).toMatchObject({
    method: "PUT",
    path: expect.stringMatching(/\/unit-conversions$/),
    payload: {
      expected_version: 1,
      purchase_unit_id: expect.any(String),
      base_unit_id: expect.any(String),
      conversions: [
        { from_unit_id: expect.any(String), to_unit_id: expect.any(String), factor: "8" },
        { from_unit_id: expect.any(String), to_unit_id: expect.any(String), factor: "0.18" },
      ],
    },
  });
});

test("暂停合作仍可检索和查看历史商品，但所有写入口关闭", async ({
  page,
  request,
}) => {
  await resetMock(request, { relationshipStatus: "suspended" });
  await login(page);
  await page.goto("/supplier-products", { waitUntil: "networkidle" });
  await selectTwentyFirstSupplier(page);

  await expect(page.getByText(/历史只读/)).toBeVisible();
  await expect(page.getByText("平台共享瓷砖", { exact: true })).toBeVisible();
  await expect(page.getByText("租户私有瓷砖", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "新增商品" })).toHaveCount(0);
  await page.getByRole("tab", { name: "基础供货价" }).click();
  await expect(page.getByRole("button", { name: "新建价格草稿" })).toHaveCount(0);
  expect(await readMutations(request)).toHaveLength(0);
});

test("平台员工持专用权限时检索第21个平台供应商并仅维护共享商品", async ({
  page,
  request,
}) => {
  await resetMock(request, { sessionMode: "platform-staff" });
  await login(page);
  await page.goto("/platform/supplier-products", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "平台共享商品", level: 1 })).toBeVisible();
  await selectTwentyFirstSupplier(page, true);
  await expect(page.getByText("平台共享", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("租户私有瓷砖", { exact: true })).toHaveCount(0);
  await expect(page.getByText("租户 B 私有瓷砖", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("tab", { name: "基础供货价" })).toHaveCount(0);

  await page.getByRole("button", { name: "新增平台商品" }).click();
  let dialog = page.getByRole("dialog", { name: "新增平台共享商品" });
  await dialog.getByLabel("商品编码").fill("PLATFORM-E2E");
  await dialog.getByLabel("商品名称").fill("平台 E2E 瓷砖");
  await chooseCatalogOption(page, dialog, "分类", "瓷砖分类", /主材 \/ 瓷砖 \/ 地砖/);
  await chooseCatalogOption(page, dialog, "品牌", "E2E 品牌", /E2E 品牌/);
  await dialog.getByRole("button", { name: "保存商品" }).click();

  const productRow = page.getByRole("row").filter({ hasText: "平台 E2E 瓷砖" });
  await productRow.getByRole("button", { name: "查看 SKU" }).click();
  await page.getByRole("button", { name: "新增 SKU" }).click();
  await fillStructuredSku(
    page,
    "新增供应商 SKU",
    "PLATFORM-E2E-SKU",
    "E2E 品牌 平台 E2E 瓷砖 800×800×10mm 灰色",
  );
  await saveConversionChain(page, "E2E 品牌 平台 E2E 瓷砖 800×800×10mm 灰色");

  const mutations = await readMutations(request);
  expect(mutations.map(({ path }) => path)).toEqual([
    expect.stringMatching(/^\/platform\/supplier-products\/[^/]+$/),
    expect.stringMatching(/^\/platform\/supplier-products\/[^/]+\/skus\/[^/]+$/),
    expect.stringMatching(/^\/platform\/supplier-products\/[^/]+\/skus\/[^/]+\/unit-conversions$/),
  ]);
  const requests = await readRequests(request);
  expect(requests.some(({ path }) => path.startsWith("/supplier-price-lists"))).toBe(false);

  const crossTenantWrite = await request.patch(
    `${mockBackendBaseUrl}/platform/supplier-products/21000000-0000-4000-8000-000000000032?supplierId=22000000-0000-4000-8000-000000000021`,
    {
      headers: { "Idempotency-Key": "platform-cross-tenant-deny" },
      data: { expected_version: 1, name: "越权修改" },
    },
  );
  expect(crossTenantWrite.status()).toBe(404);
});

test("租户 A、租户 B 与平台共享商品保持单向可见和写隔离", async ({
  page,
  request,
}) => {
  await resetMock(request);
  await login(page);
  await page.goto("/supplier-products", { waitUntil: "networkidle" });
  await selectTwentyFirstSupplier(page);
  await expect(page.getByText("平台共享瓷砖", { exact: true })).toBeVisible();
  await expect(page.getByText("租户私有瓷砖", { exact: true })).toBeVisible();
  await expect(page.getByText("租户 B 私有瓷砖", { exact: true })).toHaveCount(0);

  await resetMock(request, { sessionMode: "tenant-b" });
  await login(page);
  await page.goto("/supplier-products", { waitUntil: "networkidle" });
  await selectTwentyFirstSupplier(page);
  await expect(page.getByText("平台共享瓷砖", { exact: true })).toBeVisible();
  await expect(page.getByText("租户 B 私有瓷砖", { exact: true })).toBeVisible();
  await expect(page.getByText("租户私有瓷砖", { exact: true })).toHaveCount(0);

  const crossTenantWrite = await request.patch(
    `${mockBackendBaseUrl}/supplier-products/21000000-0000-4000-8000-000000000032?tenantSupplierId=23000000-0000-4000-8000-000000000021`,
    {
      headers: { "Idempotency-Key": "tenant-b-cross-tenant-deny" },
      data: { expected_version: 1, name: "越权修改" },
    },
  );
  expect(crossTenantWrite.status()).toBe(404);
});

test("只有采购价管理权限时仍可维护价格但不能维护商品", async ({
  page,
  request,
}) => {
  await resetMock(request, { sessionMode: "tenant-price-only" });
  await login(page);
  await page.goto("/supplier-products", { waitUntil: "networkidle" });
  await selectTwentyFirstSupplier(page);
  await expect(page.getByRole("button", { name: "新增商品" })).toHaveCount(0);
  await page.getByRole("tab", { name: "基础供货价" }).click();
  await page.getByRole("button", { name: "新建价格草稿" }).click();
  const dialog = page.getByRole("dialog", { name: "新建默认基础供货价" });
  await dialog.getByLabel("价格簿编码").fill("PRICE-ONLY");
  await dialog.getByLabel("价格簿名称").fill("仅价格权限草稿");
  await dialog.getByLabel("生效时间").fill("2026-08-21T00:00");
  await dialog.getByRole("button", { name: "保存价格草稿" }).click();
  await expect(
    page.getByRole("row").filter({ hasText: "仅价格权限草稿" }),
  ).toBeVisible();

  const mutations = await readMutations(request);
  expect(mutations).toHaveLength(1);
  expect(mutations[0]).toMatchObject({
    method: "POST",
    path: expect.stringMatching(/^\/supplier-price-lists\/[0-9a-f-]+$/),
    payload: {
      price_list_code: "PRICE-ONLY",
      name: "仅价格权限草稿",
    },
  });

  await page.getByRole("button", { name: "新建价格草稿" }).click();
  const resetDialog = page.getByRole("dialog", { name: "新建默认基础供货价" });
  await expect(resetDialog.getByLabel("价格簿编码")).toHaveValue("");
  await expect(resetDialog.getByLabel("价格簿名称")).toHaveValue("");
  await expect(resetDialog.getByLabel("生效时间")).toHaveValue("");
  await resetDialog.getByLabel("价格簿编码").fill("CANCELLED");
  await resetDialog.getByLabel("价格簿名称").fill("取消草稿");
  await resetDialog.getByRole("button", { name: "取消" }).click();
  await page.getByRole("button", { name: "新建价格草稿" }).click();
  await expect(resetDialog.getByLabel("价格簿编码")).toHaveValue("");
  await expect(resetDialog.getByLabel("价格簿名称")).toHaveValue("");
});

test("缺少平台商品权限时拒绝页面数据加载", async ({ page, request }) => {
  await resetMock(request, { sessionMode: "platform-denied" });
  await login(page);
  await page.goto("/platform/supplier-products", { waitUntil: "networkidle" });
  await expect(page.getByText(/缺少平台共享商品管理权限/)).toBeVisible();
  await expect(page.getByRole("button", { name: "新增平台商品" })).toHaveCount(0);
  const requests = await readRequests(request);
  expect(requests.some(({ path }) => path === "/platform/supplier-products")).toBe(false);
});
