import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

const tenantAdminPhone = process.env.GOOES_E2E_TENANT_ADMIN_PHONE || "18800000001";

async function loginAsTenantAdmin(page: Page) {
  const loginResponse = await page.request.post("/api/auth/login", {
    data: {
      phone: tenantAdminPhone,
      code: "",
    },
  });
  expect(loginResponse.ok()).toBe(true);
}

async function expectNoDocumentScroll(page: Page) {
  const state = await page.evaluate(() => ({
    scrollHeight: document.documentElement.scrollHeight,
    clientHeight: document.documentElement.clientHeight,
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(state.scrollHeight).toBeLessThanOrEqual(state.clientHeight + 1);
  expect(state.scrollWidth).toBeLessThanOrEqual(state.clientWidth + 1);
}

async function expectFinanceAdvancedFilterInline(page: Page) {
  const toolbar = page.locator("form[action='/finance']").first();
  const positions = await toolbar.evaluate((form) => {
    const risk = form.querySelector("#finance-risk-level")?.getBoundingClientRect();
    const more = Array.from(form.querySelectorAll("button"))
      .find((item) => item.textContent?.includes("更多筛选"))
      ?.getBoundingClientRect();
    const submit = form.querySelector("button[type='submit']")?.getBoundingClientRect();
    const reset = Array.from(form.querySelectorAll("a"))
      .find((item) => item.textContent?.trim() === "重置")
      ?.getBoundingClientRect();
    return risk && more && submit && reset
      ? {
          riskRight: risk.right,
          moreLeft: more.left,
          moreRight: more.right,
          submitLeft: submit.left,
          submitRight: submit.right,
          resetLeft: reset.left,
          yDelta: Math.max(risk.top, more.top, submit.top, reset.top) -
            Math.min(risk.top, more.top, submit.top, reset.top),
        }
      : null;
  });

  expect(positions).not.toBeNull();
  expect(positions!.moreLeft).toBeGreaterThanOrEqual(positions!.riskRight - 1);
  expect(positions!.submitLeft).toBeGreaterThanOrEqual(positions!.moreRight - 1);
  expect(positions!.resetLeft).toBeGreaterThanOrEqual(positions!.submitRight - 1);
  expect(positions!.yDelta).toBeLessThanOrEqual(4);
}

async function expectFinanceAdvancedFiltersExpandedLayout(page: Page) {
  const toolbar = page.locator("form[action='/finance']").first();
  await toolbar.getByText("更多筛选").click();

  const positions = await toolbar.evaluate((form) => {
    const search = form.querySelector("#finance-keyword")?.getBoundingClientRect();
    const status = form.querySelector("#finance-status")?.getBoundingClientRect();
    const risk = form.querySelector("#finance-risk-level")?.getBoundingClientRect();
    const more = Array.from(form.querySelectorAll("button"))
      .find((item) => item.textContent?.includes("更多筛选"))
      ?.getBoundingClientRect();
    const submit = form.querySelector("button[type='submit']")?.getBoundingClientRect();
    const reset = Array.from(form.querySelectorAll("a"))
      .find((item) => item.textContent?.trim() === "重置")
      ?.getBoundingClientRect();
    const advanced = form.querySelector("#finance-risk-flag")?.getBoundingClientRect();

    return search && status && risk && more && submit && reset && advanced
      ? {
          searchLeft: search.left,
          searchRight: search.right,
          searchBottom: search.bottom,
          statusLeft: status.left,
          riskLeft: risk.left,
          moreLeft: more.left,
          submitLeft: submit.left,
          resetLeft: reset.left,
          advancedTop: advanced.top,
          topRowDelta: Math.max(
            search.top,
            status.top,
            risk.top,
            more.top,
            submit.top,
            reset.top,
          ) -
            Math.min(
              search.top,
              status.top,
              risk.top,
              more.top,
              submit.top,
              reset.top,
            ),
        }
      : null;
  });

  expect(positions).not.toBeNull();
  expect(positions!.statusLeft).toBeGreaterThanOrEqual(positions!.searchRight - 1);
  expect(positions!.riskLeft).toBeGreaterThanOrEqual(positions!.statusLeft);
  expect(positions!.moreLeft).toBeGreaterThanOrEqual(positions!.riskLeft);
  expect(positions!.submitLeft).toBeGreaterThanOrEqual(positions!.moreLeft);
  expect(positions!.resetLeft).toBeGreaterThanOrEqual(positions!.submitLeft);
  expect(positions!.topRowDelta).toBeLessThanOrEqual(4);
  expect(positions!.advancedTop).toBeGreaterThan(positions!.searchBottom + 4);
  await expectNoDocumentScroll(page);
}

async function expectFinanceProjectTablePageSize(page: Page) {
  const footer = page.getByTestId("finance-project-summary-footer");
  await expect(footer.getByText(/第 1 \/ \d+ 页/)).toBeVisible();
  await expect(footer.getByText("每页 3 个")).toBeVisible();
  await expect(page.getByText(/当前显示 3 个项目，共 \d+ 个/)).toBeVisible();
}

async function expectFinanceProjectTableNoHorizontalScroll(page: Page) {
  const overflow = await page
    .getByTestId("finance-project-summary-table-container")
    .evaluate((container) => {
      const elements = [container, ...Array.from(container.querySelectorAll("*"))];
      return elements
        .filter((element) => {
          const style = window.getComputedStyle(element);
          return ["auto", "scroll"].includes(style.overflowX);
        })
        .map((element) => ({
          tagName: element.tagName,
          className: element.getAttribute("class") || "",
          scrollWidth: element.scrollWidth,
          clientWidth: element.clientWidth,
        }))
        .filter((item) => item.scrollWidth > item.clientWidth + 1);
    });

  expect(overflow).toEqual([]);
}

async function expectFinanceProjectTableActionsInline(page: Page) {
  const actionLayout = await page
    .getByTestId("finance-project-summary-table-container")
    .evaluate((container) => {
      const headerCell = container.querySelector("thead th:last-child");
      const headerWidth = headerCell?.getBoundingClientRect().width || 0;
      const wrappedRows = Array.from(container.querySelectorAll("tbody tr"))
        .map((row, rowIndex) => {
          const actionCell = row.querySelector("td:last-child");
          const actions = Array.from(actionCell?.querySelectorAll("a") || [])
            .filter((action) => action.getBoundingClientRect().width > 0);
          if (actions.length <= 1) return null;

          const tops = actions.map((action) =>
            Math.round(action.getBoundingClientRect().top)
          );
          return new Set(tops).size > 1 ? { rowIndex, tops } : null;
        })
        .filter(Boolean);

      return { headerWidth, wrappedRows };
    });

  expect(actionLayout.wrappedRows).toEqual([]);
  expect(actionLayout.headerWidth).toBeLessThanOrEqual(260);
}

async function expectFinanceProjectTableWideLayout(page: Page) {
  await page.setViewportSize({ width: 2048, height: 920 });
  await page.goto("/finance?risk_level=danger", { waitUntil: "load" });
  await expectFinanceProjectTableNoHorizontalScroll(page);
  await expectFinanceProjectTableActionsInline(page);
}

async function expectUnallocatedProjectSummaryPopover(page: Page) {
  await page.goto("/finance?has_unallocated_expense=true", { waitUntil: "load" });
  const unallocatedBadge = page.getByText("有未归集").first();
  await expect(unallocatedBadge).toBeVisible();

  const popover = page.getByTestId("finance-unallocated-summary-hover-card");
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.mouse.move(24, 24);
    await expect(popover).toBeHidden();
    await unallocatedBadge.hover();
    await expect(popover).toBeVisible();
  }

  await expect(popover).toBeVisible();
  await expect(popover.getByText("待归集申请明细")).toBeVisible();
  await expect(popover.getByText("申请标题 / 费用分类")).toHaveCount(0);
  await expect(popover.getByText("未归集费用摘要")).toHaveCount(0);

  const popoverBox = await popover.boundingBox();
  expect(popoverBox).not.toBeNull();
  await page.mouse.move(popoverBox!.x + popoverBox!.width / 2, popoverBox!.y + 8);
  await expect(popover).toBeHidden();

  await unallocatedBadge.hover();
  await expect(popover).toBeVisible();
  await page.mouse.move(24, 24);
  await expect(popover).toBeHidden();
}

async function expectFinancePaginationSpinner(page: Page) {
  const nextLink = page.getByRole("link", { name: "下一页" });
  const nextControl = await nextLink.count()
    ? nextLink
    : page.getByRole("button", { name: "下一页" });

  await nextControl.dispatchEvent("pointerdown");
  await expect(page.getByTestId("finance-pagination-next-spinner")).toBeVisible();
  await nextControl.click({ noWaitAfter: true });
  await expect(page).toHaveURL(/\/finance\?page=2/, { timeout: 15_000 });
}

async function expectFinanceDiagnosticsBottomDataVisible(page: Page) {
  await expect(page.getByRole("heading", { name: "重点项目" })).toBeVisible();

  const initialState = await page.evaluate(() => {
    const heading = Array.from(document.querySelectorAll("h3"))
      .find((item) => item.textContent?.includes("重点项目"));
    const scrollContainer = heading?.closest("[class*='overflow-auto']");
    const list = heading?.parentElement?.querySelector(".mt-2");

    if (!scrollContainer || !list) return null;

    const containerRect = scrollContainer.getBoundingClientRect();
    return {
      containerBottom: containerRect.bottom,
      viewportBottom: window.innerHeight,
      rowCount: list.children.length,
    };
  });

  expect(initialState).not.toBeNull();
  expect(initialState!.rowCount).toBeGreaterThan(0);
  expect(initialState!.containerBottom).toBeLessThanOrEqual(
    initialState!.viewportBottom + 1,
  );

  const scrolledState = await page.evaluate(() => {
    const heading = Array.from(document.querySelectorAll("h3"))
      .find((item) => item.textContent?.includes("重点项目"));
    const scrollContainer = heading?.closest("[class*='overflow-auto']") as HTMLElement | null;
    const list = heading?.parentElement?.querySelector(".mt-2");
    const lastRow = list?.lastElementChild;

    if (!scrollContainer || !lastRow) return null;

    scrollContainer.scrollTop = scrollContainer.scrollHeight;
    const containerRect = scrollContainer.getBoundingClientRect();
    const lastRowRect = lastRow.getBoundingClientRect();
    return {
      containerBottom: containerRect.bottom,
      lastRowBottom: lastRowRect.bottom,
    };
  });

  expect(scrolledState).not.toBeNull();
  expect(scrolledState!.lastRowBottom).toBeLessThanOrEqual(
    scrolledState!.containerBottom + 1,
  );
}

test.describe("finance workspace", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTenantAdmin(page);
  });

  test("财务总览展示图表并可进入财务诊断", async ({ page }) => {
    test.setTimeout(120_000);

    await page.goto("/finance", { waitUntil: "load" });

    const financeNav = page.getByRole("navigation", { name: "财务模块" });
    await expect(financeNav.getByRole("link", { name: "财务总览" }))
      .toHaveAttribute("aria-current", "page");
    await expect(financeNav.getByRole("link", { name: "财务诊断" }))
      .toBeVisible();

    await expect(page.getByRole("heading", { name: "回款结构" })).toBeVisible();
    const profitBreakdown = page
      .getByRole("heading", { name: "利润拆解" })
      .locator("xpath=ancestor::div[contains(@class,'rounded-lg')][1]");
    await expect(profitBreakdown).toBeVisible();
    await expect(profitBreakdown.getByText("合同")).toHaveCount(0);
    await expect(profitBreakdown.getByText("已付成本")).toBeVisible();
    await expect(profitBreakdown.getByText("实际利润")).toBeVisible();
    await expect(page.getByRole("heading", { name: "风险分布" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "30天现金流" })).toBeVisible();
    await expectFinanceAdvancedFilterInline(page);
    await expectFinanceAdvancedFiltersExpandedLayout(page);
    await expectFinanceProjectTablePageSize(page);
    await expectFinanceProjectTableNoHorizontalScroll(page);
    await expectFinanceProjectTableActionsInline(page);
    await expectFinanceProjectTableWideLayout(page);
    await expectUnallocatedProjectSummaryPopover(page);
    await page.goto("/finance", { waitUntil: "load" });
    await expectFinancePaginationSpinner(page);
    await expectNoDocumentScroll(page);

    await financeNav.getByRole("link", { name: "财务诊断" }).click();
    await expect(page).toHaveURL(/\/finance\/diagnostics/);
    await expect(page.getByRole("heading", { level: 1, name: "财务诊断" }))
      .toBeVisible();
    await expect(financeNav.getByRole("link", { name: "财务诊断" }))
      .toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("link", { name: "全部" }))
      .toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("heading", { name: "重点项目" })).toBeVisible();
    await expectFinanceDiagnosticsBottomDataVisible(page);
    await page.getByRole("link", { name: "待补数据" }).click();
    await expect(page).toHaveURL(/\/finance\/diagnostics\?view=data/);
    await expect(page.getByRole("link", { name: "待补数据" }))
      .toHaveAttribute("aria-current", "page");
    await expectNoDocumentScroll(page);
  });
});
