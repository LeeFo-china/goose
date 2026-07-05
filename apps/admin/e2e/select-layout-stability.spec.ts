import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

const platformAdminPhone = process.env.GOOES_E2E_PLATFORM_ADMIN_PHONE || "18637605353";

async function loginAsPlatformAdmin(page: Page) {
  const loginResponse = await page.request.post("/api/auth/login", {
    data: {
      phone: platformAdminPhone,
      code: "",
    },
  });
  expect(loginResponse.ok()).toBe(true);
}

async function readLayoutState(page: Page) {
  return page.evaluate(() => {
    const main = document.querySelector("main");
    const mainRect = main?.getBoundingClientRect();
    const tableViewport = document.querySelector(
      '[data-testid="platform-partner-list-table-viewport"]',
    );
    const tableViewportRect = tableViewport?.getBoundingClientRect();

    return {
      href: window.location.href,
      bodyOverflow: window.getComputedStyle(document.body).overflow,
      htmlOverflow: window.getComputedStyle(document.documentElement).overflow,
      bodyInlineOverflow: document.body.style.overflow,
      htmlInlineOverflow: document.documentElement.style.overflow,
      isRadixScrollLocked: document.body.dataset.scrollLocked === "1",
      bodyPointerEvents: window.getComputedStyle(document.body).pointerEvents,
      removedBodyScrollBarSize: window.getComputedStyle(document.body)
        .getPropertyValue("--removed-body-scroll-bar-size")
        .trim(),
      bodyMarginRight: window.getComputedStyle(document.body).marginRight,
      bodyPaddingRight: window.getComputedStyle(document.body).paddingRight,
      mainWidth: mainRect?.width ?? 0,
      tableViewportHeight: tableViewportRect?.height ?? 0,
      pageText: document.body.innerText.match(/当前显示[^\n]+/)?.[0] ?? "",
      rootWidth: document.documentElement.getBoundingClientRect().width,
    };
  });
}

test("城市合伙人筛选 select 打开关闭时不污染页面滚动锁且不使用缩放动画", async ({ page }) => {
  await page.setViewportSize({ width: 1769, height: 1048 });
  await loginAsPlatformAdmin(page);
  await page.goto("/platform/partners?tab=commissions&commissionPageSize=7", { waitUntil: "load" });

  await expect(page.getByRole("heading", { name: "城市合伙人" })).toBeVisible();
  await expect(page.getByTestId("platform-partner-list-table-viewport")).toBeVisible();

  const before = await readLayoutState(page);
  expect(before.bodyOverflow).toBe("hidden");
  expect(before.htmlOverflow).toBe("hidden");
  expect(before.bodyInlineOverflow).toBe("");
  expect(before.htmlInlineOverflow).toBe("");
  expect(new URL(before.href).searchParams.get("commissionPageSize")).toBe("7");

  await page.getByRole("combobox", { name: "收入类型" }).click();
  await expect(page.getByRole("option", { name: "租户充值" })).toBeVisible();
  await page.waitForTimeout(300);
  const after = await readLayoutState(page);
  const contentClassName = await page.getByRole("listbox").evaluate((element) => (
    element.getAttribute("class") || ""
  ));

  expect(after.isRadixScrollLocked).toBe(true);
  expect(after.bodyPointerEvents).toBe("auto");
  expect(after.removedBodyScrollBarSize).toBe("0px");
  expect(contentClassName).not.toContain("zoom-in");
  expect(contentClassName).not.toContain("zoom-out");
  expect(after.bodyMarginRight).toBe(before.bodyMarginRight);
  expect(after.bodyPaddingRight).toBe(before.bodyPaddingRight);
  expect(Math.abs(after.mainWidth - before.mainWidth)).toBeLessThanOrEqual(0.5);
  expect(Math.abs(after.rootWidth - before.rootWidth)).toBeLessThanOrEqual(0.5);
  expect(Math.abs(after.tableViewportHeight - before.tableViewportHeight)).toBeLessThanOrEqual(0.5);
  expect(after.pageText).toBe(before.pageText);
  expect(after.href).toBe(before.href);

  await page.keyboard.press("Escape");
  await expect(page.getByRole("option", { name: "租户充值" })).toHaveCount(0);
  const closed = await readLayoutState(page);

  expect(closed.bodyOverflow).toBe(before.bodyOverflow);
  expect(closed.htmlOverflow).toBe(before.htmlOverflow);
  expect(closed.bodyInlineOverflow).toBe("");
  expect(closed.htmlInlineOverflow).toBe("");
  expect(closed.isRadixScrollLocked).toBe(false);
  expect(closed.href).toBe(before.href);
});
