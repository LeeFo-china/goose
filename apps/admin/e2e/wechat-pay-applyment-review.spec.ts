import { expect, test } from "@playwright/test";
import type { APIRequestContext, Page } from "@playwright/test";

const MOCK_BACKEND_URL = "http://127.0.0.1:3998";

async function loginAsTenantAdmin(page: Page) {
  const response = await page.request.post("/api/auth/login", {
    data: { phone: "18800000001", code: "" },
  });
  expect(response.ok()).toBe(true);
}

function stageButton(page: Page, label: string) {
  return page.getByRole("button", { name: new RegExp(`\\d+\\.\\s*${label}`) });
}

type MockSaveEvents = {
  started: Array<Record<string, unknown>>;
  committed: Array<Record<string, unknown>>;
};

async function getMockSaveEvents(
  request: APIRequestContext,
): Promise<MockSaveEvents> {
  const response = await request.get(`${MOCK_BACKEND_URL}/__test/saves`);
  return await response.json() as MockSaveEvents;
}

test.beforeEach(async ({ request }) => {
  const response = await request.post(`${MOCK_BACKEND_URL}/__test/reset`);
  expect(response.ok()).toBe(true);
});

test("复核使用实时值、修改后失效，并只定位首个隐藏无效控件", async ({
  page,
}) => {
  await loginAsTenantAdmin(page);
  await page.goto("/finance/wechat-pay/applyment", {
    waitUntil: "networkidle",
  });

  await expect(stageButton(page, "确认提交")).toHaveAttribute(
    "aria-current",
    "step",
  );

  await stageButton(page, "核对识别").click();
  const categorySelect = page.getByRole("combobox", {
    name: "选择核对资料",
  });
  await categorySelect.click();
  await page.getByRole("option", { name: "结算账户证明" }).click();
  await expect(categorySelect).toContainText("结算账户证明");

  await stageButton(page, "确认提交").click();
  const subjectReview = page.getByRole("heading", {
    name: "主体和营业执照",
  }).locator("../..");
  await subjectReview.getByRole("button", { name: "返回修改" }).click();
  await expect(categorySelect).toContainText("营业执照照片");

  await stageButton(page, "补充信息").click();
  const merchantShortName = page.getByLabel("商户简称");
  await merchantShortName.fill("实时复核简称");
  await stageButton(page, "确认提交").click();
  const settlementReview = page.getByRole("heading", {
    name: "经营及结算",
  }).locator("../..");
  await expect(settlementReview).toContainText("实时复核简称");

  await page.getByRole("checkbox", { name: "确认资料真实有效" }).click();
  const submitButton = page.getByRole("button", { name: "提交平台审核" });
  await expect(submitButton).toBeEnabled();

  await stageButton(page, "补充信息").click();
  await merchantShortName.fill("确认后再次修改");
  await stageButton(page, "确认提交").click();
  await expect(settlementReview).toContainText("确认后再次修改");
  await expect(submitButton).toBeDisabled();

  await page.getByRole("checkbox", { name: "确认资料真实有效" }).click();
  await page.evaluate(() => {
    const first = document.querySelector<HTMLInputElement>(
      '[name="license_name"]',
    );
    const later = document.querySelector<HTMLInputElement>(
      '[name="identity_period_begin"]',
    );
    if (!first || !later) throw new Error("test controls not found");
    first.value = "";
    later.value = "";
  });

  await submitButton.click();
  await page.getByRole("button", { name: "确认提交", exact: true }).click();

  await expect(stageButton(page, "核对识别")).toHaveAttribute(
    "aria-current",
    "step",
  );
  await expect(categorySelect).toContainText("营业执照照片");
  await expect(page.getByLabel("营业执照主体名称")).toBeFocused();
});

test("自动保存隔离陈旧响应并在离开页面时发送最新值", async ({
  page,
  request,
}) => {
  await loginAsTenantAdmin(page);
  await page.goto("/finance/wechat-pay/applyment", {
    waitUntil: "networkidle",
  });

  await stageButton(page, "补充信息").click();
  const merchantShortName = page.getByLabel("商户简称");
  await merchantShortName.fill("状态采集值");
  await expect(
    page.getByRole("status").filter({ hasText: "保存中" }),
  ).toBeVisible();
  await expect(
    page.getByRole("status").filter({ hasText: "已自动保存" }),
  ).toBeVisible();

  const delayResponse = await request.post(
    `${MOCK_BACKEND_URL}/__test/delay-next-save`,
    { data: { milliseconds: 1_200 } },
  );
  expect(delayResponse.ok()).toBe(true);

  await stageButton(page, "上传资料").click();
  const subjectType = page.getByRole("combobox", { name: "主体类型" });
  const staleRequest = page.waitForRequest((pendingRequest) =>
    pendingRequest.method() === "PUT" &&
    pendingRequest.url().includes("/finance/wechat-pay/applyments/") &&
    pendingRequest.postData()?.includes("SUBJECT_TYPE_INDIVIDUAL") === true
  );
  const staleResponse = page.waitForResponse((pendingResponse) =>
    pendingResponse.request().method() === "PUT" &&
    pendingResponse.url().includes("/finance/wechat-pay/applyments/") &&
    pendingResponse.request().postData()?.includes(
        "SUBJECT_TYPE_INDIVIDUAL",
      ) === true
  );
  await subjectType.click();
  await page.getByRole("option", { name: "个体工商户" }).click();
  await staleRequest;

  await stageButton(page, "补充信息").click();
  const accountType = page.getByRole("combobox", { name: "结算账户类型" });
  await accountType.click();
  await page.getByRole("option", { name: "经营者个人银行卡" }).click();
  await staleResponse;
  await expect(accountType).toContainText("经营者个人银行卡");

  await merchantShortName.fill("陈旧响应后的最新值");
  await expect(
    page.getByRole("status").filter({ hasText: "已自动保存" }),
  ).toBeVisible();
  await expect.poll(async () => {
    const events = await getMockSaveEvents(request);
    return events.committed.at(-1);
  }).toMatchObject({
    merchant_short_name: "陈旧响应后的最新值",
    settlement_account_type: "BANK_ACCOUNT_TYPE_PERSONAL",
  });

  await merchantShortName.fill("离开前最新值");
  await expect(
    page.getByRole("status").filter({ hasText: "保存中" }),
  ).toBeVisible();
  await page.goto("about:blank");

  await expect.poll(async () => {
    const events = await getMockSaveEvents(request);
    return events.committed.at(-1)?.merchant_short_name;
  }).toBe("离开前最新值");
});

test("在途保存离页后仍提交到服务端", async ({ page, request }) => {
  await loginAsTenantAdmin(page);
  await page.goto("/finance/wechat-pay/applyment", {
    waitUntil: "networkidle",
  });
  await stageButton(page, "补充信息").click();

  const delayResponse = await request.post(
    `${MOCK_BACKEND_URL}/__test/delay-next-save`,
    { data: { milliseconds: 1_200 } },
  );
  expect(delayResponse.ok()).toBe(true);

  await page.getByLabel("商户简称").fill("在途离页提交值");
  await expect.poll(async () => {
    const events = await getMockSaveEvents(request);
    return events.started.at(-1)?.merchant_short_name;
  }).toBe("在途离页提交值");

  await page.goto("about:blank");

  await expect.poll(async () => {
    const events = await getMockSaveEvents(request);
    return events.committed.at(-1)?.merchant_short_name;
  }).toBe("在途离页提交值");
});

test("乱序提交仅允许最高 revision 改写服务端草稿", async ({
  request,
}) => {
  const delayResponse = await request.post(
    `${MOCK_BACKEND_URL}/__test/delay-next-save`,
    { data: { milliseconds: 1_200 } },
  );
  expect(delayResponse.ok()).toBe(true);

  const oldSave = request.put(
    `${MOCK_BACKEND_URL}/finance/wechat-pay/applyments/33333333-3333-4333-8333-333333333333`,
    {
      data: {
        merchant_short_name: "旧 revision 后提交",
        draft_update_source: "autosave",
        draft_revision: 11,
      },
    },
  );
  await expect.poll(async () => {
    const events = await getMockSaveEvents(request);
    return events.started.some((event) => event.draft_revision === 11);
  }).toBe(true);

  const newSave = await request.put(
    `${MOCK_BACKEND_URL}/finance/wechat-pay/applyments/33333333-3333-4333-8333-333333333333`,
    {
      data: {
        merchant_short_name: "最新 revision 先提交",
        draft_update_source: "manual_save",
        draft_revision: 12,
      },
    },
  );
  expect(newSave.ok()).toBe(true);
  expect((await oldSave).ok()).toBe(true);

  const events = await getMockSaveEvents(request);
  expect(events.started.map((event) => event.draft_revision)).toEqual([
    11,
    12,
  ]);
  expect(events.committed.map((event) => ({
    revision: event.draft_revision,
    outcome: event.outcome,
  }))).toEqual([
    { revision: 12, outcome: "applied" },
    { revision: 11, outcome: "stale" },
  ]);

  const currentResponse = await request.get(
    `${MOCK_BACKEND_URL}/finance/wechat-pay/applyment/current`,
  );
  const current = await currentResponse.json() as {
    data: {
      applyment: {
        draft_revision: number;
        merchant_short_name: string;
      };
    };
  };
  expect(current.data.applyment).toMatchObject({
    draft_revision: 12,
    merchant_short_name: "最新 revision 先提交",
  });
});

test("BFCache pagehide 恢复后仍可继续自动保存", async ({ page, request }) => {
  await loginAsTenantAdmin(page);
  await page.goto("/finance/wechat-pay/applyment", {
    waitUntil: "networkidle",
  });
  await stageButton(page, "补充信息").click();
  const merchantShortName = page.getByLabel("商户简称");

  await merchantShortName.fill("BFCache 前最新值");
  await page.evaluate(() => {
    window.dispatchEvent(
      new PageTransitionEvent("pagehide", { persisted: true }),
    );
  });
  await expect.poll(async () => {
    const events = await getMockSaveEvents(request);
    return events.committed.at(-1)?.merchant_short_name;
  }).toBe("BFCache 前最新值");

  await page.evaluate(() => {
    window.dispatchEvent(
      new PageTransitionEvent("pageshow", { persisted: true }),
    );
  });
  await merchantShortName.fill("BFCache 恢复后最新值");
  await page.evaluate(() => {
    window.dispatchEvent(
      new PageTransitionEvent("pagehide", { persisted: true }),
    );
  });
  await expect.poll(async () => {
    const events = await getMockSaveEvents(request);
    return events.committed.at(-1)?.merchant_short_name;
  }).toBe("BFCache 恢复后最新值");

  await page.evaluate(() => {
    window.dispatchEvent(
      new PageTransitionEvent("pageshow", { persisted: true }),
    );
  });
  await merchantShortName.fill("BFCache 二次恢复值");
  await expect(
    page.getByRole("status").filter({ hasText: "已自动保存" }),
  ).toBeVisible();
  await expect.poll(async () => {
    const events = await getMockSaveEvents(request);
    return events.committed.at(-1)?.merchant_short_name;
  }).toBe("BFCache 二次恢复值");
});
