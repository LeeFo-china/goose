import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

async function loginAsTenantAdmin(page: Page) {
  const response = await page.request.post("/api/auth/login", {
    data: { phone: "18800000001", code: "" },
  });
  expect(response.ok()).toBe(true);
}

function stageButton(page: Page, label: string) {
  return page.getByRole("button", { name: new RegExp(`\\d+\\.\\s*${label}`) });
}

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
