import { expect, test } from "@playwright/test";

import {
  batchBackend as backend,
  openBatchPage as open,
  startBatchDraft as newDraft,
} from "./supplier-purchase-batch-workflow-helpers";
import { ids } from "./supplier-purchase-batch-fixture.mjs";

// Browser UI contract acceptance, not real backend integration.
test("异步项目选择不产生 React Portal 或控制台错误", async ({ page, request }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await open(page, request);
  const editor = await newDraft(page);
  await expect(editor.getByLabel("采购项目", { exact: true })).toContainText(
    "采购项目01",
  );
  expect(errors).toEqual([]);
});
test("项目多供应商保存冻结金额与拆单预览，提交、撤回、再提交", async ({ page, request }) => {
  await open(page, request);
  const editor = await newDraft(page);
  await editor.getByRole("row").filter({ hasText: "采购商品03" }).getByRole(
    "button",
    { name: "加入采购商品03", exact: true },
  ).click();
  await editor.getByRole("button", { name: "保存草稿", exact: true }).click();
  const detail = page.getByRole("dialog", { name: /采购批次 ·/ });
  await expect(detail.getByText("本次保存的供应商拆单预览")).toBeVisible();
  await expect(detail.getByText("2 个 SKU · 2 家供应商")).toBeVisible();
  await detail.getByRole("button", { name: "提交审批", exact: true }).click();
  await page.getByRole("button", { name: "确认提交审批", exact: true }).click();
  await expect(detail.getByText("审批中", { exact: true })).toBeVisible();
  await detail.getByRole("button", { name: "撤回", exact: true }).click();
  await page.getByRole("button", { name: "确认撤回", exact: true }).click();
  await expect(detail.getByRole("button", { name: "编辑草稿", exact: true }))
    .toBeVisible();
  await detail.getByRole("button", { name: "提交审批", exact: true }).click();
  await page.getByRole("button", { name: "确认提交审批", exact: true }).click();
  await expect(detail.getByText("审批中", { exact: true })).toBeVisible();
  const state = await (await request.get(`${backend}/__test/state`)).json();
  expect(
    state.commands.map((row: { path: string }) => row.path.split("/").at(-1)),
  ).toEqual(["save-draft", "submit", "withdraw", "submit"]);
  expect(state.commands[0].payload.items).toHaveLength(2);
  expect(state.commands[0].payload.items[0]).not.toHaveProperty("unit_price");
});
test("仓库补货自动查后页默认仓库，目录分页与无默认类目选择", async ({ page, request }) => {
  await open(page, request);
  const editor = await newDraft(page, "warehouse");
  await editor.getByRole("row").filter({ hasText: "采购商品01" }).getByRole(
    "button",
    { name: "加入采购商品01", exact: true },
  ).click();
  await editor.getByRole("button", { name: "保存草稿", exact: true }).click();
  await expect(editor.getByText("请为每个商品选择成本类目")).toBeVisible();
  await editor.getByRole("button", {
    name: /采购商品01.*成本类目：选择成本类目/,
  })
    .click();
  const category = page.getByRole("dialog", {
    name: /采购商品01.*成本类目选择/,
  });
  await category.getByRole("button", { name: "下一页", exact: true }).click();
  await category.getByLabel("成本类目", { exact: true }).click();
  await page.getByRole("option", { name: "材料类目23", exact: true }).click();
  const catalog = editor.getByRole("region", { name: "可采购商品" });
  await catalog.getByRole("button", { name: "下一页", exact: true }).click();
  await expect(catalog.getByText("采购商品23 · 标准规格")).toBeVisible();
  await editor.getByRole("button", { name: "保存草稿", exact: true }).click();
  await expect(page.getByText("仓库补货 · 补货仓22")).toBeVisible();
  const state = await (await request.get(`${backend}/__test/state`)).json();
  expect(state.commands[0].payload.project_id).toBeNull();
  expect(state.commands[0].payload.destination_type).toBe("warehouse");
  expect(
    state.requests.some((path: string) =>
      path.includes("/warehouses?page=2") && path.includes("status=active")
    ),
  ).toBe(true);
});
test("无 supplier.view 不请求设置但项目采购可用", async ({ page, request }) => {
  await open(page, request, "empty", "no-settings");
  const editor = await newDraft(page);
  await expect(editor.getByRole("tab", { name: "仓库补货" })).toBeDisabled();
  await expect(editor.getByText(/缺少供应商查看权限/)).toBeVisible();
  expect(
    (await (await request.get(`${backend}/__test/state`)).json()).requests.some(
      (path: string) => path === "/supplier-settings",
    ),
  ).toBe(false);
});
test("reviewer 无采购管理仍按实际动作审批，价格变化按 HTTP 409 退草稿恢复", async ({ page, request }) => {
  await open(page, request, "revision", "reviewer", true);
  const detail = page.getByRole("dialog", { name: /采购批次 ·/ });
  await expect(page.getByRole("button", { name: "新建批次" })).toHaveCount(0);
  await detail.getByRole("button", { name: "批准", exact: true }).click();
  await page.getByRole("button", { name: "确认批准", exact: true }).click();
  await expect(detail.getByText("审批校验发生变化", { exact: true }))
    .toBeVisible();
  await expect(
    detail.getByRole("alert").filter({ hasText: "审批校验发生变化" }),
  ).toContainText("采购商品01");
  await expect(
    detail.getByRole("alert").filter({ hasText: "审批校验发生变化" }),
  ).toContainText("11.00");
  await expect(detail.getByText("草稿", { exact: true })).toBeVisible();
  await expect(
    detail.getByText(
      "本次修订已保存为版本 2；这是本次审批的修订回执，不代表当前最新版本。",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(detail.getByText("已生成采购单", { exact: true })).toHaveCount(
    0,
  );
});
test("审批可进入后续节点而非误显示已完成", async ({ page, request }) => {
  await open(page, request, "warehouse-pending-next", "reviewer", true);
  const detail = page.getByRole("dialog", { name: /采购批次 ·/ });
  await detail.getByRole("button", { name: "批准", exact: true }).click();
  await page.getByRole("button", { name: "确认批准", exact: true }).click();
  await expect(detail.getByText("操作已成功处理", { exact: false }))
    .toBeVisible();
  await expect(detail.getByText("审批中", { exact: true })).toBeVisible();
});
test("保存成功后详情失败只重试读取，不重发保存", async ({ page, request }) => {
  await open(page, request, "save-refresh-failed");
  const editor = await newDraft(page);
  await editor.getByRole("button", { name: "保存草稿", exact: true }).click();
  const detail = page.getByRole("dialog", { name: "采购批次详情" });
  await expect(detail.getByText(/最新详情刷新失败/)).toBeVisible();
  await request.post(`${backend}/__test/allow-detail`);
  await detail.getByRole("button", { name: "重试", exact: true }).click();
  await expect(page.getByText("本次保存的供应商拆单预览")).toBeVisible();
  expect((await (await request.get(`${backend}/__test/state`)).json()).commands)
    .toHaveLength(1);
});
test("375px 空结果清除筛选同步输入且错误可重试", async ({ page, request }) => {
  await open(page, request, "paging");
  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByLabel("搜索批次").fill("不存在");
  await page.getByRole("button", { name: "搜索", exact: true }).click();
  await expect(page.getByText("暂无匹配记录")).toBeVisible();
  await page.getByRole("button", { name: "清除筛选", exact: true }).last()
    .click();
  await expect(page.getByLabel("搜索批次")).toHaveValue("");
  await page.getByLabel("搜索批次").fill("读取错误");
  await page.getByRole("button", { name: "搜索", exact: true }).click();
  await expect(page.getByRole("button", { name: "重试", exact: true }))
    .toBeInViewport();
  expect(
    await page.evaluate(() =>
      document.documentElement.scrollWidth <= innerWidth
    ),
  ).toBe(true);
});
for (const scenario of ["save-uncertain", "save-truncated"]) {
  test(`${scenario} 保存重载后沿用原 UUID、payload、version 与 key`, async ({ page, request }) => {
    await open(page, request, scenario);
    const editor = await newDraft(page);
    const responsePromise = page.waitForResponse((response) =>
      response.url().endsWith("/save-draft")
    );
    await editor.getByRole("button", { name: "保存草稿", exact: true }).click();
    const response = await responsePromise;
    if (scenario === "save-truncated") {
      expect(response.status()).toBe(200);
      expect(await response.text()).toBe('{"success":true,"data":');
    }
    await expect(
      editor.getByRole("button", { name: "使用原请求重试", exact: true }),
    ).toBeEnabled();
    expect(
      (await (await request.get(`${backend}/__test/state`)).json()).records,
    ).toHaveLength(1);
    await page.reload();
    await page.getByRole("button", { name: "新建批次" }).click();
    await page.getByRole("dialog", { name: "新建采购批次" }).getByRole(
      "button",
      {
        name: "使用原请求重试",
        exact: true,
      },
    ).click();
    await expect(page.getByText("本次保存的供应商拆单预览")).toBeVisible();
    const state = await (await request.get(`${backend}/__test/state`)).json();
    expect(state.records).toHaveLength(1);
    expect(state.commands).toHaveLength(2);
    expect(state.commands[0]).toEqual(state.commands[1]);
  });
}
test("批次及子单据均可翻到第 23 条；375px 页脚可见且页面不横溢", async ({ page, request }) => {
  await open(page, request, "paging");
  await page.getByRole("button", { name: "下一页", exact: true }).click();
  await expect(page.getByRole("button", { name: "PB-20260907-00000023" }))
    .toBeVisible();
  await page.getByRole("button", { name: "上一页", exact: true }).click();
  await page.getByRole("button", { name: "PB-20260907-00000001" }).click();
  const detail = page.getByRole("dialog", { name: /采购批次 ·/ });
  await detail.getByRole("button", { name: "下一页", exact: true }).click();
  await expect(detail.getByText("采购商品23 · 标准规格")).toBeVisible();
  await detail.getByRole("tab", { name: "子申请", exact: true }).click();
  await detail.getByRole("button", { name: "下一页", exact: true }).click();
  await expect(detail.getByText("PR-20260907-00000023")).toBeVisible();
  await expect(detail.getByText("已转采购单", { exact: true }).first())
    .toBeVisible();
  await detail.getByRole("tab", { name: "子采购单", exact: true }).click();
  await detail.getByRole("button", { name: "下一页", exact: true }).click();
  await expect(detail.getByRole("link", { name: "PO-20260907-00000023" }))
    .toHaveAttribute("href", /supplier-purchase-orders\?purchase_order_id=/);
  await page.setViewportSize({ width: 375, height: 812 });
  expect(
    await detail.getByRole("table").evaluate((table) => ({
      width: table.getBoundingClientRect().width,
      scrolls: Boolean(
        table.parentElement &&
          table.parentElement.scrollWidth > table.parentElement.clientWidth,
      ),
    })),
  ).toEqual({ width: 640, scrolls: true });
  await detail.getByRole("button", { name: "关闭详情" }).click();
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(page.getByRole("button", { name: "下一页", exact: true }))
    .toBeInViewport();
  expect(
    await page.evaluate(() =>
      document.documentElement.scrollWidth <= innerWidth
    ),
  ).toBe(true);
});

test("仓库审批成功生成子采购单链接，驳回必须有意见", async ({ page, request }) => {
  await open(page, request, "warehouse-pending", "reviewer", true);
  const detail = page.getByRole("dialog", { name: /采购批次 ·/ });
  await detail.getByRole("button", { name: "驳回", exact: true }).click();
  const action = page.getByRole("dialog", { name: "驳回采购批次" });
  await action.getByRole("button", { name: "确认驳回", exact: true }).click();
  await expect(action.getByText("请填写操作原因或审批意见")).toBeVisible();
  await action.getByRole("button", { name: "返回", exact: true }).click();
  await detail.getByRole("button", { name: "批准", exact: true }).click();
  await page.getByRole("button", { name: "确认批准", exact: true }).click();
  await expect(detail.getByText("已生成采购单", { exact: true })).toBeVisible();
  await detail.getByRole("tab", { name: "子采购单", exact: true }).click();
  await expect(detail.getByRole("link", { name: "PO-20260907-00000001" }))
    .toHaveAttribute("href", /supplier-purchase-orders\?purchase_order_id=/);
});

test("项目被驳回后申请人可编辑再保存，并按必填原因取消", async ({ page, request }) => {
  await open(page, request, "project-pending", "reviewer", true);
  const detail = page.getByRole("dialog", { name: /采购批次 ·/ });
  await detail.getByRole("button", { name: "驳回", exact: true }).click();
  await page.getByLabel("审批意见（必填）").fill("请调整商品数量");
  await page.getByRole("button", { name: "确认驳回", exact: true }).click();
  await expect(detail.getByText("已驳回", { exact: true })).toBeVisible();
  await page.request.post("/api/auth/login", {
    data: { phone: "manager", code: "" },
  });
  await page.reload();
  await detail.getByRole("button", { name: "编辑草稿", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "编辑采购批次" });
  await editor.getByLabel("采购商品01 · 标准规格采购数量").fill("2.5000");
  await editor.getByRole("button", { name: "保存草稿", exact: true }).click();
  await expect(detail.getByText("冻结总金额").locator("..")).toContainText(
    "35.00",
  );
  await detail.getByRole("button", { name: "取消批次", exact: true }).click();
  await page.getByLabel("操作原因（必填）").fill("采购计划已调整");
  await page.getByRole("button", { name: "确认取消批次", exact: true }).click();
  await expect(detail.getByText("已取消", { exact: true })).toBeVisible();
});

test("键盘切换目的地清空旧商品，唯一仓库自动选择且零仓库不可保存", async ({ page, request }) => {
  await open(page, request, "single-warehouse");
  const editor = await newDraft(page);
  await editor.getByRole("tab", { name: "项目采购" }).focus();
  await page.keyboard.press("ArrowRight");
  await page.getByRole("alertdialog", { name: "更换采购范围？" }).getByRole(
    "button",
    { name: "清空并更换", exact: true },
  ).click();
  await expect(editor.getByRole("tab", { name: "仓库补货" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(editor.getByLabel("启用仓库", { exact: true })).toContainText(
    "补货仓01",
  );
  await expect(editor.getByRole("heading", { name: "已选商品" }))
    .toBeVisible();
  await editor.getByRole("button", { name: "关闭", exact: true }).last()
    .click();
  await page.getByRole("alertdialog", { name: "放弃未保存的更改？" })
    .getByRole("button", { name: "放弃更改", exact: true }).click();
  await request.post(`${backend}/__test/reset?scenario=no-warehouses`);
  await page.reload();
  await page.getByRole("button", { name: "新建批次" }).click();
  await editor.getByRole("tab", { name: "仓库补货" }).click();
  await expect(editor.getByText("暂无可选启用仓库")).toBeVisible();
  await expect(editor.getByRole("button", { name: "保存草稿", exact: true }))
    .toBeDisabled();
});

test("开关或工作流关闭仅禁止新仓库补货，不隐藏历史；只读角色不显示命令", async ({ page, request }) => {
  for (const scenario of ["warehouse-gate-off", "warehouse-workflow-off"]) {
    await open(page, request, scenario, "manager", true);
    const detail = page.getByRole("dialog", { name: /采购批次 ·/ });
    await expect(detail.getByText("仓库补货 · 补货仓22")).toBeVisible();
    await detail.getByRole("button", { name: "关闭详情" }).click();
    await page.getByRole("button", { name: "新建批次" }).click();
    await expect(
      page.getByRole("dialog", { name: "新建采购批次" }).getByRole("tab", {
        name: "仓库补货",
      }),
    ).toBeDisabled();
  }
  await open(page, request, "warehouse-gate-off", "reader", true);
  const detail = page.getByRole("dialog", { name: /采购批次 ·/ });
  await expect(detail.getByText("仓库补货 · 补货仓22")).toBeVisible();
  await expect(
    detail.getByRole("button", {
      name: /编辑草稿|提交审批|取消批次|批准|驳回/,
    }),
  ).toHaveCount(0);
});

test(
  "采购工作台在桌面与窄屏保持目录、上下文和保存入口可操作",
  async ({ page, request }, testInfo) => {
    await page.setViewportSize({ width: 1200, height: 768 });
    await open(page, request);
    const editor = await newDraft(page);
    const catalog = editor.getByRole("region", { name: "可采购商品" });
    const toolbar = editor.getByRole("search", { name: "商品目录工具栏" });
    const desktopToolbar = await toolbar.boundingBox();
    const desktopCatalog = await catalog.boundingBox();
    expect(desktopToolbar).not.toBeNull();
    expect(desktopCatalog).not.toBeNull();
    expect(desktopToolbar!.height).toBeLessThan(desktopCatalog!.height);
    expect(await toolbar.evaluate((node) => getComputedStyle(node).position))
      .toBe("sticky");
    await toolbar.getByRole("button", { name: "商品分类：全部分类" }).click();
    await expect(page.getByRole("dialog", { name: "筛选商品分类" }))
      .toBeVisible();
    await page.keyboard.press("Escape");
    await catalog.getByRole("row").filter({ hasText: "采购商品01" })
      .getByRole("button", { name: "加入采购商品01", exact: true }).click();
    await page.screenshot({
      path: testInfo.outputPath("batch-workbench-1200x768.png"),
    });

    await page.setViewportSize({ width: 375, height: 812 });
    expect(await toolbar.evaluate((node) => getComputedStyle(node).position))
      .toBe("static");
    const mobileToolbar = await toolbar.boundingBox();
    const mobileCatalog = await catalog.boundingBox();
    expect(mobileToolbar).not.toBeNull();
    expect(mobileCatalog).not.toBeNull();
    expect(mobileToolbar!.height).toBeLessThan(mobileCatalog!.height);
    await catalog.getByRole("row").filter({ hasText: "采购商品03" })
      .getByRole("button", { name: "加入采购商品03", exact: true }).click();
    await expect(editor.getByRole("button", { name: /采购商品01.*成本类目：选择成本类目/ })).toHaveCount(1);
    await expect(editor.getByRole("button", { name: /采购商品02.*成本类目：材料类目01/ })).toHaveCount(1);
    await expect(editor.getByRole("button", { name: /采购商品03.*成本类目：材料类目01/ })).toHaveCount(1);
    const firstCategoryTrigger = editor.getByRole("button", { name: /采购商品01.*成本类目：选择成本类目/ });
    await firstCategoryTrigger.click();
    const controlledDialogId = await firstCategoryTrigger.getAttribute("aria-controls");
    expect(controlledDialogId).toBeTruthy();
    const firstCategoryDialog = page.getByRole("dialog", { name: /采购商品01.*成本类目选择/ });
    await expect(firstCategoryDialog).toHaveAttribute("id", controlledDialogId!);
    await page.keyboard.press("Escape");
    await expect(editor.getByRole("button", { name: "保存草稿", exact: true }))
      .toBeInViewport();
    await page.screenshot({
      path: testInfo.outputPath("batch-workbench-375x812.png"),
    });

    await page.setViewportSize({ width: 375, height: 667 });
    await editor.getByRole("button", { name: "其他", exact: true }).click();
    await editor.getByPlaceholder("一句话说明采购用途").fill("临时采购");
    await editor.getByRole("button", { name: /补充信息/ }).click();
    await editor.getByPlaceholder("补充到货、搬运或现场要求").fill(
      "到货前联系",
    );
    await expect(editor.getByRole("button", { name: "保存草稿", exact: true }))
      .toBeInViewport();
    const saveBox = await editor.getByRole("button", {
      name: "保存草稿",
      exact: true,
    }).boundingBox();
    expect(saveBox).not.toBeNull();
    expect(saveBox!.y + saveBox!.height).toBeLessThanOrEqual(667);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath("batch-workbench-375x667-expanded.png"),
    });
  },
);

test(
  "目录快速搜索后的旧响应不会覆盖新商品；桌面与窄屏截图",
  async ({ page, request }, testInfo) => {
    await open(page, request);
    const editor = await newDraft(page);
    const slow = page.waitForRequest((request) =>
      request.url().includes("supplier-purchase-batch-catalog") &&
      request.url().includes(encodeURIComponent("慢商品"))
    );
    await editor.getByLabel("搜索采购商品").fill("慢商品");
    await editor.getByLabel("搜索采购商品").press("Enter");
    await slow;
    await editor.getByLabel("搜索采购商品").fill("采购商品23");
    await editor.getByLabel("搜索采购商品").press("Enter");
    await expect(editor.getByText("采购商品23 · 标准规格", { exact: true }))
      .toBeVisible();
    // The backend exposes completion of its controlled delayed request, not a fixed sleep.
    await expect.poll(async () =>
      (await (await request.get(`${backend}/__test/state`)).json())
        .pendingCatalog
    ).toBe(0);
    await expect(editor.getByText("慢商品旧结果 · 标准规格", { exact: true }))
      .toHaveCount(0);
    await page.screenshot({
      path: testInfo.outputPath("batch-editor-desktop.png"),
      fullPage: true,
    });
    await page.setViewportSize({ width: 375, height: 812 });
    for (const table of await editor.getByRole("table").all()) {
      expect(
        await table.evaluate((element) =>
          element.getBoundingClientRect().width
        ),
      ).toBeGreaterThanOrEqual(640);
      expect(
        await table.evaluate((element) =>
          Boolean(
            element.parentElement &&
              element.parentElement.scrollWidth >
                element.parentElement.clientWidth,
          )
        ),
      ).toBe(true);
    }
    await expect(editor.getByRole("button", { name: "保存草稿", exact: true }))
      .toBeInViewport();
    expect(
      await page.evaluate(() =>
        document.documentElement.scrollWidth <= innerWidth
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath("batch-editor-mobile.png"),
      fullPage: true,
    });
  },
);
