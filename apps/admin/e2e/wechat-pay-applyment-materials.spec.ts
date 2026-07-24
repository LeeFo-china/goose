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

function attachmentInput(page: Page, category: string) {
  return page.locator(`#wechat-pay-applyment-attachment-${category}`);
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

async function selectReviewCategory(page: Page, label: string) {
  const categorySelect = page.getByRole("combobox", {
    name: "选择核对资料",
  });
  await categorySelect.click();
  await page.getByRole("option", { name: label }).click();
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

test("上传后自动识别，替换附件不覆盖人工值且刷新后恢复待核对结果", async ({
  page,
  request,
}) => {
  await loginAsTenantAdmin(page);
  await page.goto("/finance/wechat-pay/applyment", {
    waitUntil: "networkidle",
  });

  await stageButton(page, "上传资料").click();
  await page.getByRole("checkbox", {
    name: "同意使用已上传证照进行信息识别和申请资料回填",
  }).click();
  const firstLicenseInput = attachmentInput(page, "license_copy");
  await expect(firstLicenseInput).toBeEnabled();
  await firstLicenseInput.setInputFiles(pngUpload("license-first.png"));
  await expect(attachmentSlot(page, "license_copy")).toContainText("待核对");
  await expect(firstLicenseInput).toBeEnabled();

  await stageButton(page, "核对识别").click();
  await selectReviewCategory(page, "营业执照照片");
  await expect(ocrReviewRow(page, "营业执照主体名称")).toContainText(
    "OCR 识别主体 1",
  );
  const licenseName = page.getByRole("textbox", {
    name: /^营业执照主体名称/,
  });
  await expect(licenseName).toHaveValue("复核测试商户有限公司");
  await licenseName.fill("人工保留主体");

  await stageButton(page, "上传资料").click();
  const replacementLicenseInput = attachmentInput(page, "license_copy");
  await expect(replacementLicenseInput).toBeEnabled();
  await replacementLicenseInput.setInputFiles(
    pngUpload("license-replacement.png"),
  );
  await expect(attachmentSlot(page, "license_copy")).toContainText("待核对");
  await expect(replacementLicenseInput).toBeEnabled();

  await stageButton(page, "核对识别").click();
  await selectReviewCategory(page, "营业执照照片");
  await expect(ocrReviewRow(page, "营业执照主体名称")).toContainText(
    "OCR 识别主体 2",
  );
  await expect(licenseName).toHaveValue("人工保留主体");
  await expect.poll(async () => {
    const events = await getMockSaveEvents(request);
    return events.committed.at(-1)?.license_name;
  }).toBe("人工保留主体");

  await page.reload({ waitUntil: "networkidle" });
  await stageButton(page, "核对识别").click();
  await selectReviewCategory(page, "营业执照照片");
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
  await stageButton(page, "上传资料").click();
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

  await stageButton(page, "核对识别").click();
  await selectReviewCategory(page, "营业执照照片");
  await expect(ocrReviewRow(page, "营业执照主体名称")).toContainText(
    "OCR 识别主体 2",
  );
});
