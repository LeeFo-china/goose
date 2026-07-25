import { expect, test } from "@playwright/test";
import type { APIRequestContext, Page } from "@playwright/test";

const MOCK_BACKEND_URL = "http://127.0.0.1:3998";

async function loginAsTenantAdmin(page: Page) {
  const response = await page.request.post("/api/auth/login", {
    data: { phone: "18800000001", code: "" },
  });
  expect(response.ok()).toBe(true);
}

function attachmentInput(page: Page, category: string) {
  return page.locator(`#wechat-pay-applyment-attachment-${category}`);
}

function documentSection(page: Page, title: string) {
  return page.getByRole("heading", { name: title, level: 2 }).locator(
    "xpath=ancestor::section[1]",
  );
}

function attachmentSlot(page: Page, category: string) {
  return attachmentInput(page, category).locator(
    "xpath=ancestor::div[contains(@class,'flex-col')][1]",
  );
}

function pngUpload(name: string) {
  return {
    name,
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z4+QAAAAASUVORK5CYII=",
      "base64",
    ),
  };
}

function ocrReviewRow(page: Page, fieldLabel: string) {
  return page.getByRole("checkbox", { name: fieldLabel }).locator(
    "xpath=ancestor::div[contains(@class,'grid')][1]",
  );
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

test("单页资料区紧邻核对字段、身份证同区且移动端无水平溢出", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAsTenantAdmin(page);
  await page.goto("/finance/wechat-pay/applyment", {
    waitUntil: "networkidle",
  });

  await expect(page.getByText("处理记录", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", {
    name: /\d+\.\s*(上传资料|核对识别|补充信息|确认提交)/,
  })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "下一步" })).toHaveCount(0);

  const licenseSection = documentSection(page, "营业执照");
  await expect(
    licenseSection.getByRole("heading", {
      name: "营业执照照片",
      level: 3,
    }),
  ).toBeVisible();
  await expect(
    licenseSection.getByRole("textbox", {
      name: /^营业执照主体名称/,
    }),
  ).toBeVisible();
  await expect(
    licenseSection.locator(
      "#wechat-pay-applyment-attachment-license_copy",
    ),
  ).toHaveCount(1);

  const legalIdSection = documentSection(page, "法人身份证");
  await expect(
    legalIdSection.locator(
      "#wechat-pay-applyment-attachment-legal_representative_id_card_front",
    ),
  ).toHaveCount(1);
  await expect(
    legalIdSection.locator(
      "#wechat-pay-applyment-attachment-legal_representative_id_card_back",
    ),
  ).toHaveCount(1);
  await expect(
    legalIdSection.getByRole("heading", {
      name: "法人身份证人像面",
      level: 3,
    }),
  ).toBeVisible();
  await expect(
    legalIdSection.getByRole("heading", {
      name: "法人身份证国徽面",
      level: 3,
    }),
  ).toBeVisible();

  expect(await page.evaluate(() => {
    const root = document.documentElement;
    return root.scrollWidth <= root.clientWidth;
  })).toBe(true);
});

test("上传后自动识别，替换附件不覆盖人工值且刷新后恢复待核对结果", async ({
  page,
  request,
}) => {
  await loginAsTenantAdmin(page);
  await page.goto("/finance/wechat-pay/applyment", {
    waitUntil: "networkidle",
  });

  await page.getByRole("checkbox", {
    name: "同意使用已上传证照进行信息识别和申请资料回填",
  }).click();
  const firstLicenseInput = attachmentInput(page, "license_copy");
  await expect(firstLicenseInput).toBeEnabled();
  await firstLicenseInput.setInputFiles(pngUpload("license-first.png"));
  await expect(attachmentSlot(page, "license_copy")).toContainText("待核对");
  await expect(firstLicenseInput).toBeEnabled();

  await expect(ocrReviewRow(page, "营业执照主体名称")).toContainText(
    "OCR 识别主体 1",
  );
  const licenseName = page.getByRole("textbox", {
    name: /^营业执照主体名称/,
  });
  await expect(licenseName).toHaveValue("复核测试商户有限公司");
  await licenseName.fill("人工保留主体");

  const replacementLicenseInput = attachmentInput(page, "license_copy");
  await expect(replacementLicenseInput).toBeEnabled();
  await replacementLicenseInput.setInputFiles(
    pngUpload("license-replacement.png"),
  );
  await expect(attachmentSlot(page, "license_copy")).toContainText("待核对");
  await expect(replacementLicenseInput).toBeEnabled();

  await expect(ocrReviewRow(page, "营业执照主体名称")).toContainText(
    "OCR 识别主体 2",
  );
  await expect(licenseName).toHaveValue("人工保留主体");
  await expect.poll(async () => {
    const events = await getMockSaveEvents(request);
    return events.committed.at(-1)?.license_name;
  }).toBe("人工保留主体");

  await page.reload({ waitUntil: "networkidle" });
  await expect(ocrReviewRow(page, "营业执照主体名称")).toContainText(
    "OCR 识别主体 2",
  );
  await expect(page.getByRole("textbox", {
    name: /^营业执照主体名称/,
  })).toHaveValue("人工保留主体");
});

test("识别失败后重试同一附件并恢复为待核对", async ({
  page,
  request,
}) => {
  const failureResponse = await request.post(
    `${MOCK_BACKEND_URL}/__test/fail-next-recognition`,
  );
  expect(failureResponse.ok()).toBe(true);

  await loginAsTenantAdmin(page);
  await page.goto("/finance/wechat-pay/applyment", {
    waitUntil: "networkidle",
  });
  await page.getByRole("checkbox", {
    name: "同意使用已上传证照进行信息识别和申请资料回填",
  }).click();
  const licenseInput = attachmentInput(page, "license_copy");
  await expect(licenseInput).toBeEnabled();
  await licenseInput.setInputFiles(pngUpload("license-retry.png"));

  const licenseSlot = attachmentSlot(page, "license_copy");
  await expect(licenseSlot).toContainText("识别失败");
  await licenseSlot.getByRole("button", { name: "重试识别" }).click();
  await expect(licenseSlot).toContainText("待核对");

  await expect(ocrReviewRow(page, "营业执照主体名称")).toContainText(
    "OCR 识别主体 2",
  );
});
