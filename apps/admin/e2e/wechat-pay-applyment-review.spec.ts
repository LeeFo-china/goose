import { expect, test } from "@playwright/test";
import type { APIRequestContext, Page } from "@playwright/test";

const MOCK_BACKEND_URL = "http://127.0.0.1:3998";

async function loginAsTenantAdmin(page: Page) {
  const response = await page.request.post("/api/auth/login", {
    data: { phone: "18800000001", code: "" },
  });
  expect(response.ok()).toBe(true);
}

type MockSaveEvents = {
  started: Array<Record<string, unknown>>;
  committed: Array<Record<string, unknown>>;
};

type MockSubmissionEvents = {
  requests: Array<Record<string, unknown>>;
};

async function getMockSaveEvents(
  request: APIRequestContext,
): Promise<MockSaveEvents> {
  const response = await request.get(`${MOCK_BACKEND_URL}/__test/saves`);
  return await response.json() as MockSaveEvents;
}

async function getMockSubmissionEvents(
  request: APIRequestContext,
): Promise<MockSubmissionEvents> {
  const response = await request.get(
    `${MOCK_BACKEND_URL}/__test/submissions`,
  );
  return await response.json() as MockSubmissionEvents;
}

test.beforeEach(async ({ request }) => {
  const response = await request.post(`${MOCK_BACKEND_URL}/__test/reset`);
  expect(response.ok()).toBe(true);
});

test("单页修改后提交确认失效，并阻止无效资料提交", async ({
  page,
  request,
}) => {
  await loginAsTenantAdmin(page);
  await page.goto("/finance/wechat-pay/applyment", {
    waitUntil: "networkidle",
  });

  const merchantShortName = page.getByLabel("商户简称");
  await merchantShortName.fill("实时复核简称");
  await expect(merchantShortName).toHaveValue("实时复核简称");

  await page.getByRole("checkbox", { name: "确认资料真实有效" }).click();
  const submitButton = page.getByRole("button", { name: "提交平台审核" });
  await expect(submitButton).toBeEnabled();

  await merchantShortName.fill("确认后再次修改");
  await expect(merchantShortName).toHaveValue("确认后再次修改");
  await expect(submitButton).toBeDisabled();
  await expect.poll(async () => {
    const events = await getMockSaveEvents(request);
    return events.committed.at(-1)?.merchant_short_name;
  }).toBe("确认后再次修改");

  const delayResponse = await request.post(
    `${MOCK_BACKEND_URL}/__test/delay-next-save`,
    { data: { milliseconds: 1_000 } },
  );
  expect(delayResponse.ok()).toBe(true);

  const licenseName = page.getByLabel("营业执照主体名称");
  await licenseName.fill("");
  await page.getByLabel("身份证有效期开始").fill("");
  await page.getByRole("checkbox", { name: "确认资料真实有效" }).click();
  await expect(submitButton).toBeEnabled();
  expect(await page.locator("form :invalid").evaluateAll((controls) =>
    controls.map((control) => control.getAttribute("name"))
  )).toEqual(["license_name", "identity_period_begin"]);

  await submitButton.click();
  await page.getByRole("button", { name: "确认提交", exact: true }).click();

  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(submitButton).toBeEnabled();
  await expect.poll(async () => {
    const events = await getMockSaveEvents(request);
    return events.committed.at(-1)?.license_name;
  }).toBeNull();
  expect((await getMockSubmissionEvents(request)).requests).toHaveLength(0);
});

test("有效资料等待草稿 flush 后只提交一次", async ({ page, request }) => {
  await loginAsTenantAdmin(page);
  await page.goto("/finance/wechat-pay/applyment", {
    waitUntil: "networkidle",
  });

  const delayResponse = await request.post(
    `${MOCK_BACKEND_URL}/__test/delay-next-save`,
    { data: { milliseconds: 600 } },
  );
  expect(delayResponse.ok()).toBe(true);

  const merchantShortName = page.getByLabel("商户简称");
  await merchantShortName.fill("提交顺序测试");
  await expect(
    page.getByRole("status").filter({ hasText: "保存中" }),
  ).toBeVisible();
  await page.getByRole("checkbox", { name: "确认资料真实有效" }).click();

  const submitButton = page.getByRole("button", { name: "提交平台审核" });
  await expect(submitButton).toBeEnabled();
  await submitButton.click();
  await page.getByRole("button", { name: "确认提交", exact: true }).click();

  await expect.poll(async () => {
    const events = await getMockSubmissionEvents(request);
    return events.requests.length;
  }).toBe(1);

  const saveEvents = await getMockSaveEvents(request);
  const submissionEvents = await getMockSubmissionEvents(request);
  expect(submissionEvents.requests).toHaveLength(1);
  expect(submissionEvents.requests[0]).toMatchObject({
    idempotency_key: "33333333-3333-4333-8333-333333333333",
    observed_merchant_short_name: "提交顺序测试",
    observed_draft_revision:
      saveEvents.committed.at(-1)?.server_draft_revision,
    committed_save_count: saveEvents.committed.length,
  });
});

test("自动保存隔离陈旧响应并在离开页面时发送最新值", async ({
  page,
  request,
}) => {
  await loginAsTenantAdmin(page);
  await page.goto("/finance/wechat-pay/applyment", {
    waitUntil: "networkidle",
  });

  const merchantShortName = page.getByLabel("商户简称");
  await merchantShortName.fill("状态采集值");
  await expect(
    page.getByRole("status").filter({ hasText: "保存中" }),
  ).toBeVisible();
  await expect.poll(async () => {
    const events = await getMockSaveEvents(request);
    return events.committed.at(-1)?.merchant_short_name;
  }).toBe("状态采集值");

  const delayResponse = await request.post(
    `${MOCK_BACKEND_URL}/__test/delay-next-save`,
    { data: { milliseconds: 1_200 } },
  );
  expect(delayResponse.ok()).toBe(true);

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

  const accountType = page.getByRole("combobox", { name: "结算账户类型" });
  await accountType.click();
  await page.getByRole("option", { name: "经营者个人银行卡" }).click();
  await staleResponse;
  await expect(accountType).toContainText("经营者个人银行卡");

  await merchantShortName.fill("陈旧响应后的最新值");
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
  const merchantShortName = page.getByLabel("商户简称");
  await expect(merchantShortName).toBeVisible();

  const delayResponse = await request.post(
    `${MOCK_BACKEND_URL}/__test/delay-next-save`,
    { data: { milliseconds: 1_200 } },
  );
  expect(delayResponse.ok()).toBe(true);

  await merchantShortName.fill("在途离页提交值");
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
        draft_epoch: 1,
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
        draft_epoch: 1,
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
    { revision: 11, outcome: "same_or_older_revision" },
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
    draft_epoch: 1,
    draft_revision: 12,
    merchant_short_name: "最新 revision 先提交",
  });
});

test("旧页面高 revision 晚到不能覆盖新页面 epoch", async ({
  page,
  request,
}) => {
  await loginAsTenantAdmin(page);
  await page.goto("/finance/wechat-pay/applyment", {
    waitUntil: "networkidle",
  });
  const newPage = await page.context().newPage();
  await newPage.goto("/finance/wechat-pay/applyment", {
    waitUntil: "networkidle",
  });

  await page.route("**/finance/wechat-pay/applyments/*", async (route) => {
    const pending = route.request();
    if (
      pending.method() !== "PUT" ||
      pending.url().endsWith("/draft-session")
    ) {
      await route.continue();
      return;
    }
    const payload = pending.postDataJSON() as Record<string, unknown>;
    await route.continue({
      postData: JSON.stringify({ ...payload, draft_revision: 99 }),
      headers: {
        ...pending.headers(),
        "content-type": "application/json",
      },
    });
  });
  const delayResponse = await request.post(
    `${MOCK_BACKEND_URL}/__test/delay-next-save`,
    { data: { milliseconds: 2_500 } },
  );
  expect(delayResponse.ok()).toBe(true);

  await page.getByLabel("商户简称").fill("旧页面高 revision");
  await expect.poll(async () => {
    const events = await getMockSaveEvents(request);
    return events.started.at(-1);
  }).toMatchObject({
    merchant_short_name: "旧页面高 revision",
    draft_epoch: 2,
    draft_revision: 99,
  });

  await newPage.getByLabel("商户简称").fill("新页面 epoch 值");
  await expect.poll(async () => {
    const events = await getMockSaveEvents(request);
    return events.committed.find((event) =>
      event.merchant_short_name === "新页面 epoch 值"
    );
  }).toMatchObject({
    merchant_short_name: "新页面 epoch 值",
    outcome: "applied",
  });

  await expect.poll(async () => {
    const events = await getMockSaveEvents(request);
    return events.committed.find((event) =>
      event.merchant_short_name === "旧页面高 revision"
    );
  }).toMatchObject({
    draft_epoch: 2,
    draft_revision: 99,
    outcome: "stale_epoch",
    server_draft_epoch: 3,
  });
  await expect(page.getByText("保存失败", { exact: true })).toBeVisible();
  await expect(page.getByText("其他页面已接管当前草稿")).toBeVisible();
  await expect(
    page.getByRole("status").filter({ hasText: "已自动保存" }),
  ).toHaveCount(0);
  await expect(page.getByLabel("商户简称")).toHaveValue("旧页面高 revision");

  await page.getByRole("checkbox", { name: "确认资料真实有效" }).click();
  await expect(
    page.getByRole("button", { name: "提交平台审核" }),
  ).toBeDisabled();

  const currentResponse = await request.get(
    `${MOCK_BACKEND_URL}/finance/wechat-pay/applyment/current`,
  );
  const current = await currentResponse.json() as {
    data: {
      applyment: {
        draft_epoch: number;
        draft_revision: number;
        merchant_short_name: string;
      };
    };
  };
  expect(current.data.applyment).toMatchObject({
    draft_epoch: 3,
    merchant_short_name: "新页面 epoch 值",
  });
  expect(current.data.applyment.draft_revision).toBeGreaterThan(0);
});

test("BFCache pagehide 恢复后仍可继续自动保存", async ({ page, request }) => {
  await loginAsTenantAdmin(page);
  await page.goto("/finance/wechat-pay/applyment", {
    waitUntil: "networkidle",
  });
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
  await expect.poll(async () => {
    const events = await getMockSaveEvents(request);
    return events.committed.at(-1)?.merchant_short_name;
  }).toBe("BFCache 二次恢复值");
});
