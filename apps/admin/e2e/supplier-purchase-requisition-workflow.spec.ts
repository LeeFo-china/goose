import { expect, test } from "@playwright/test";
import type { APIRequestContext, Page } from "@playwright/test";

const mockBackendBaseUrl = "http://127.0.0.1:3994";

type TestRole = "requester" | "approver" | "budget-manager";

type Mutation = {
  method: string;
  path: string;
  idempotencyKey: string | null;
  payload: Record<string, unknown>;
};

type ListGet = {
  path: string;
  page: string | null;
  pageSize: string | null;
};

const serverFactKeys = new Set([
  "unit_price",
  "tax_rate",
  "amount",
  "subtotal_amount",
  "tax_amount",
  "total_amount",
  "line_subtotal_amount",
  "line_tax_amount",
  "line_total_amount",
]);

function expectNoServerFacts(value: unknown) {
  if (Array.isArray(value)) {
    value.forEach(expectNoServerFacts);
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, nested] of Object.entries(value)) {
    expect(serverFactKeys.has(key)).toBe(false);
    expectNoServerFacts(nested);
  }
}

async function resetMock(request: APIRequestContext) {
  const response = await request.post(`${mockBackendBaseUrl}/__test/reset`);
  expect(response.ok()).toBe(true);
}

async function switchRole(
  page: Page,
  request: APIRequestContext,
  role: TestRole,
) {
  const roleResponse = await request.post(
    `${mockBackendBaseUrl}/__test/role`,
    { data: { role } },
  );
  expect(roleResponse.ok()).toBe(true);
  await page.context().clearCookies();
  const loginResponse = await page.request.post("/api/auth/login", {
    data: { phone: "18637605353", code: "" },
  });
  expect(loginResponse.ok()).toBe(true);
  await page.goto("/supplier-purchase-requisitions", {
    waitUntil: "networkidle",
  });
  await expect(
    page.getByRole("heading", { name: "采购申请", level: 1 }),
  ).toBeVisible();
}

function requisitionRow(page: Page, requestNo: string) {
  return page.getByRole("row").filter({ hasText: requestNo });
}

async function closeSheet(sheet: ReturnType<Page["getByRole"]>) {
  await sheet.getByRole("button", { name: "关闭", exact: true }).last()
    .click();
}

async function openRowAction(
  page: Page,
  requestNo: string,
  action: string,
) {
  await requisitionRow(page, requestNo)
    .getByRole("button", { name: `更多操作 ${requestNo}` })
    .click();
  await page.getByRole("menuitem", { name: action }).click();
}

async function createDraft(
  page: Page,
  reason: string,
  quantity: string,
  expectedAmount: string,
  exercisePagination = false,
) {
  await page.getByRole("button", { name: "发起采购申请" }).click();
  const sheet = page.getByRole("dialog", { name: "发起采购申请" });
  if (exercisePagination) {
    await sheet.getByRole("button", { name: "加载更多项目" }).click();
    await sheet.getByRole("button", { name: "加载更多成本分类" }).click();
  }
  await sheet.getByLabel("项目").click();
  await page.getByRole("option", { name: "E2E 海棠湾项目" }).click();
  await sheet.getByLabel("合作供应商").click();
  await page.getByRole("option", { name: /E2E 建材供应商/ }).click();
  await sheet.getByLabel("临时采购原因").fill(reason);
  if (exercisePagination) {
    await sheet.getByRole("button", { name: "下一页" }).click();
    await expect(sheet.getByText("第 2 / 2 页", { exact: true }))
      .toBeVisible();
    await sheet.getByRole("button", { name: "上一页" }).click();
  }
  const catalogRow = sheet.getByRole("row").filter({
    hasText: "E2E 临采瓷砖",
  });
  await catalogRow.getByRole("button", { name: "添加" }).click();
  const selectedRow = sheet.getByRole("table").filter({
    has: page.getByRole("columnheader", { name: "成本分类" }),
  }).getByRole("row").filter({ hasText: "E2E 临采瓷砖" });
  await selectedRow.getByRole("combobox").click();
  await page.getByRole("option", { name: /主材/ }).click();
  await selectedRow.getByLabel("采购数量 E2E 临采瓷砖 800x800")
    .fill(quantity);
  await sheet.getByRole("button", { name: "保存草稿" }).click();
  const savedSheet = page.getByRole("dialog", {
    name: "编辑采购申请草稿",
  });
  await expect(savedSheet.getByText(expectedAmount, { exact: true }))
    .toBeVisible();
  await closeSheet(savedSheet);
}

async function submitRequisition(page: Page, requestNo: string) {
  await openRowAction(page, requestNo, "提交审批");
  const confirm = page.getByRole("dialog", { name: "提交采购申请？" });
  await confirm.getByRole("button", { name: "确认提交" }).click();
  const detail = page.getByRole("dialog", { name: "采购申请详情" });
  await expect(detail.getByText("待审批", { exact: true })).toBeVisible();
  await closeSheet(detail);
}

async function approveRequisition(page: Page, requestNo: string) {
  await openRowAction(page, requestNo, "批准申请");
  const confirm = page.getByRole("dialog", { name: "批准采购申请？" });
  await confirm.getByLabel("审核备注").fill("E2E 审批通过");
  await confirm.getByRole("button", { name: "确认批准" }).click();
  const detail = page.getByRole("dialog", { name: "采购申请详情" });
  await expect(detail.getByText("已批准", { exact: true })).toBeVisible();
  await closeSheet(detail);
}

test("采购申请完成预算承诺、分权审批、转换与释放闭环", async ({
  page,
  request,
}) => {
  await resetMock(request);
  await switchRole(page, request, "requester");

  await createDraft(page, "预算内临时补货", "2", "¥200.00", true);
  const withinBudgetNo = "REQ-E2E-0002";
  await openRowAction(page, withinBudgetNo, "编辑草稿");
  let sheet = page.getByRole("dialog", { name: "编辑采购申请草稿" });
  await sheet.getByLabel("临时采购原因").fill("预算内临时补货（已复核）");
  await sheet.getByRole("button", { name: "保存草稿" }).click();
  await expect(sheet.getByText("¥200.00", { exact: true })).toBeVisible();
  await closeSheet(sheet);
  await submitRequisition(page, withinBudgetNo);

  await requisitionRow(page, withinBudgetNo)
    .getByRole("button", { name: "查看" }).click();
  sheet = page.getByRole("dialog", { name: "采购申请详情" });
  await expect(sheet.getByText("预算内", { exact: true }).last()).toBeVisible();
  const budgetSection = sheet.getByRole("heading", { name: "预算影响" })
    .locator("xpath=ancestor::section");
  const commitmentFact = budgetSection.getByText("本申请承诺").locator("..");
  await expect(commitmentFact.getByText("¥200.00", { exact: true }))
    .toBeVisible();
  await closeSheet(sheet);

  await switchRole(page, request, "approver");
  await approveRequisition(page, withinBudgetNo);
  await openRowAction(page, withinBudgetNo, "生成采购单");
  const convert = page.getByRole("dialog", { name: "生成采购单草稿？" });
  await convert.getByRole("button", { name: "生成采购单" }).click();
  sheet = page.getByRole("dialog", { name: "采购申请详情" });
  await expect(sheet.getByText("已生成采购单", { exact: true })).toBeVisible();
  await sheet.getByRole("link", { name: "查看对应采购单" }).click();
  await expect(page).toHaveURL(
    /\/supplier-purchase-orders\?purchase_order_id=/,
  );
  const purchaseOrderDetail = page.getByRole("dialog", {
    name: "采购单详情",
  });
  await expect(
    purchaseOrderDetail.getByText("PO-E2E-REQ-0002", { exact: true }),
  ).toBeVisible();

  await switchRole(page, request, "requester");
  await createDraft(page, "超预算应急采购", "200", "¥20,000.00");
  const overBudgetNo = "REQ-E2E-0003";
  await submitRequisition(page, overBudgetNo);
  await expect(
    requisitionRow(page, overBudgetNo).getByText("超预算", { exact: true }),
  ).toBeVisible();

  await switchRole(page, request, "approver");
  const overBudgetRow = requisitionRow(page, overBudgetNo);
  await overBudgetRow
    .getByRole("button", { name: `更多操作 ${overBudgetNo}` })
    .click();
  await expect(
    page.getByRole("menuitem", { name: "批准申请" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("menuitem", { name: "驳回申请" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");

  await switchRole(page, request, "budget-manager");
  await approveRequisition(page, overBudgetNo);
  const cancellableNo = "REQ-E2E-0001";
  await openRowAction(page, cancellableNo, "取消申请");
  const cancel = page.getByRole("dialog", { name: "取消采购申请？" });
  await cancel.getByLabel("取消原因").fill("E2E 取消并释放预算");
  await cancel.getByRole("button", { name: "确认取消" }).click();
  sheet = page.getByRole("dialog", { name: "采购申请详情" });
  await expect(sheet.getByText("已取消", { exact: true })).toBeVisible();
  await expect(
    sheet.getByText("预算承诺已释放", { exact: true }),
  ).toBeVisible();
  await closeSheet(sheet);

  const stateResponse = await request.get(
    `${mockBackendBaseUrl}/__test/state`,
  );
  expect(stateResponse.ok()).toBe(true);
  const state = await stateResponse.json() as {
    commitments: { source_id: string; status: string }[];
    requisitions: { id: string; request_no: string }[];
  };
  const cancelled = state.requisitions.find(
    ({ request_no }) => request_no === cancellableNo,
  );
  expect(cancelled).toBeTruthy();
  expect(state.commitments.filter(
    ({ source_id }) => source_id === cancelled?.id,
  ).every(({ status }) => status === "released")).toBe(true);

  const listGetResponse = await request.get(
    `${mockBackendBaseUrl}/__test/list-gets`,
  );
  expect(listGetResponse.ok()).toBe(true);
  const listGets = (await listGetResponse.json() as {
    requests: ListGet[];
  }).requests;
  const requiredListPaths = [
    /^\/supplier-purchase-requisitions$/,
    /^\/supplier-purchase-requisitions\/[^/]+\/items$/,
    /^\/supplier-purchase-requisition-project-options$/,
    /^\/supplier-purchase-requisition-supplier-options$/,
    /^\/supplier-purchase-requisition-cost-categories$/,
    /^\/supplier-purchase-requisition-catalog$/,
  ];
  for (const pattern of requiredListPaths) {
    expect(listGets.some(({ path }) => pattern.test(path))).toBe(true);
  }
  for (const requestEntry of listGets) {
    const pageNumber = Number(requestEntry.page);
    const pageSize = Number(requestEntry.pageSize);
    expect(requestEntry.page).not.toBeNull();
    expect(requestEntry.pageSize).not.toBeNull();
    expect(Number.isSafeInteger(pageNumber) && pageNumber >= 1).toBe(true);
    expect(
      Number.isSafeInteger(pageSize) && pageSize >= 1 && pageSize <= 100,
    ).toBe(true);
    if (requestEntry.path === "/supplier-purchase-requisition-catalog") {
      expect(pageSize).toBeLessThanOrEqual(20);
    }
  }

  const mutationResponse = await request.get(
    `${mockBackendBaseUrl}/__test/mutations`,
  );
  expect(mutationResponse.ok()).toBe(true);
  const mutations = (await mutationResponse.json() as {
    mutations: Mutation[];
  }).mutations;
  expect(mutations).toHaveLength(9);
  expect(mutations.every(({ method, idempotencyKey, payload }) =>
    method === "POST" &&
    typeof idempotencyKey === "string" &&
    idempotencyKey.length > 0 &&
    idempotencyKey.length <= 120 &&
    Number.isSafeInteger(payload.expected_version)
  )).toBe(true);
  const draftMutations = mutations.filter(({ path }) =>
    path.endsWith("/save-draft")
  );
  expect(draftMutations).toHaveLength(3);
  for (const { payload } of draftMutations) {
    expectNoServerFacts(payload);
    expect((payload.items as Record<string, unknown>[]).every((item) =>
      Object.keys(item).sort().join(",") ===
        "cost_category_id,quantity,supplier_sku_id"
    )).toBe(true);
  }

  const replaySource = draftMutations[0];
  if (!replaySource?.idempotencyKey) {
    throw new TypeError("采购申请草稿 mutation 缺少幂等键");
  }
  const replay = await request.post(
    `${mockBackendBaseUrl}${replaySource.path}`,
    {
      headers: { "Idempotency-Key": replaySource.idempotencyKey },
      data: replaySource.payload,
    },
  );
  expect(replay.ok()).toBe(true);
  expect((await replay.json() as { data: { idempotent: boolean } })
    .data.idempotent).toBe(true);
  const conflict = await request.post(
    `${mockBackendBaseUrl}${replaySource.path}`,
    {
      headers: { "Idempotency-Key": replaySource.idempotencyKey },
      data: { ...replaySource.payload, reason: "冲突指纹" },
    },
  );
  expect(conflict.status()).toBe(409);
  expect(await conflict.json()).toEqual({
    success: false,
    code: "SUPPLIER_IDEMPOTENCY_CONFLICT",
    message: "幂等键已用于其他供应商操作",
    requestId: "supplier-purchase-requisition-mock-request",
  });
  const invalidCatalogPage = await request.get(
    `${mockBackendBaseUrl}/supplier-purchase-requisition-catalog?` +
      `tenantSupplierId=34000000-0000-4000-8000-000000000009&` +
      "page=1&pageSize=21",
  );
  expect(invalidCatalogPage.status()).toBe(400);
  expect(await invalidCatalogPage.json()).toMatchObject({
    success: false,
    code: "VALIDATION_ERROR",
    requestId: "supplier-purchase-requisition-mock-request",
  });
});
