import { expect } from "@playwright/test";
import type { Locator, Page, TestInfo } from "@playwright/test";

export function priceInput(dialog: Locator) {
  return dialog.getByLabel(/基础供货价/);
}

export async function assertCreateDialogLayout(
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
