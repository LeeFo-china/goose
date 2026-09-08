import { expect, test } from "@playwright/test";

import {
  chooseBatchPurpose,
  ids,
  openProjectBatchEditor,
  readBatchState,
} from "./supplier-purchase-batch-workflow-helpers";
import { projects, uuid } from "./supplier-purchase-batch-fixture.mjs";

test("桌面工作台并排显示目录和已选商品，组合筛选保留分页参数且可清除", async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 1200, height: 768 });
  const editor = await openProjectBatchEditor(page, request);
  const catalog = editor.getByRole("region", { name: "可采购商品" });
  const selection = editor.getByRole("region", { name: "已选商品" });
  const catalogBox = await catalog.boundingBox();
  const selectionBox = await selection.boundingBox();
  expect(catalogBox).not.toBeNull();
  expect(selectionBox).not.toBeNull();
  expect(catalogBox!.x + catalogBox!.width).toBeLessThanOrEqual(
    selectionBox!.x + 1,
  );
  expect(Math.abs(catalogBox!.y - selectionBox!.y)).toBeLessThanOrEqual(1);
  expect(await catalog.evaluate((catalogElement) => {
    const selectionElement = Array.from(
      catalogElement.parentElement?.children ?? [],
    ).find((element) => element.getAttribute("aria-label") === "已选商品");
    return Boolean(
      selectionElement &&
        catalogElement.compareDocumentPosition(selectionElement) &
          Node.DOCUMENT_POSITION_FOLLOWING,
    );
  })).toBe(true);

  const toolbar = editor.getByRole("search", { name: "商品目录工具栏" });
  await toolbar.getByRole("button", { name: "商品分类：全部分类" }).click();
  const categoryDialog = page.getByRole("dialog", { name: "筛选商品分类" });
  await categoryDialog.getByRole("button", { name: "下一页", exact: true })
    .click();
  await categoryDialog.getByLabel("商品分类", { exact: true }).click();
  await page.getByRole("option", {
    name: "材料 / 商品分类23",
    exact: true,
  }).click();

  await toolbar.getByRole("button", { name: "供应商：全部供应商" }).click();
  const supplierDialog = page.getByRole("dialog", { name: "筛选供应商" });
  await supplierDialog.getByLabel("供应商", { exact: true }).click();
  await page.getByRole("option", { name: "第一建材商", exact: true }).click();
  await expect(catalog.getByText("采购商品23 · 标准规格", { exact: true }))
    .toBeVisible();

  await expect.poll(async () => {
    const state = await readBatchState(request);
    return state.requests.filter((path) =>
      path.startsWith("/supplier-purchase-batch-catalog?")
    ).at(-1) ?? "";
  }).toContain("tenantSupplierId=");
  const state = await readBatchState(request);
  const filteredPath = state.requests.filter((path) =>
    path.startsWith("/supplier-purchase-batch-catalog?")
  ).at(-1);
  expect(filteredPath).toBeTruthy();
  const filteredQuery = new URL(filteredPath!, "http://fixture").searchParams;
  expect(filteredQuery.get("categoryId")).toBe(uuid(1022));
  expect(filteredQuery.get("tenantSupplierId")).toBe(ids.relationship);
  expect(filteredQuery.get("page")).toBe("1");
  expect(filteredQuery.get("pageSize")).toBe("20");

  await toolbar.getByRole("button", { name: "清除商品分类筛选" }).click();
  await toolbar.getByRole("button", { name: "清除供应商筛选" }).click();
  await expect(catalog.getByText("采购商品01 · 标准规格", { exact: true }))
    .toBeVisible();
  await expect.poll(async () => {
    const nextState = await readBatchState(request);
    const path = nextState.requests.filter((entry) =>
      entry.startsWith("/supplier-purchase-batch-catalog?")
    ).at(-1) ?? "";
    const query = new URL(path, "http://fixture").searchParams;
    return {
      categoryId: query.get("categoryId"),
      supplierId: query.get("tenantSupplierId"),
    };
  }).toEqual({ categoryId: null, supplierId: null });
});

test("切换项目取消时保留上下文，确认后清空商品并按新项目重载目录", async ({
  page,
  request,
}) => {
  const editor = await openProjectBatchEditor(page, request);
  await editor.getByLabel("采购项目", { exact: true }).click();
  await page.getByRole("option", { name: "采购项目02", exact: true }).click();
  const confirmation = page.getByRole("alertdialog", {
    name: "更换采购范围？",
  });
  await confirmation.getByRole("button", { name: "取消", exact: true })
    .click();
  await expect(editor.getByLabel("采购项目", { exact: true }))
    .toContainText("采购项目01");
  await expect(editor.getByRole("heading", {
    name: "采购商品02 · 标准规格",
    exact: true,
  })).toBeVisible();

  await editor.getByLabel("采购项目", { exact: true }).click();
  await page.getByRole("option", { name: "采购项目02", exact: true }).click();
  await confirmation.getByRole("button", {
    name: "清空并更换",
    exact: true,
  }).click();
  await expect(editor.getByLabel("采购项目", { exact: true }))
    .toContainText("采购项目02");
  await expect(editor.getByText("从左侧商品目录加入商品", { exact: true }))
    .toBeVisible();
  await expect.poll(async () => {
    const state = await readBatchState(request);
    return state.requests.some((path) => {
      if (!path.startsWith("/supplier-purchase-batch-catalog?")) return false;
      return new URL(path, "http://fixture").searchParams.get("projectId") ===
        projects[1].id;
    });
  }).toBe(true);
});

test("修改采购用途后关闭需要确认放弃", async ({ page, request }) => {
  const editor = await openProjectBatchEditor(page, request);
  await chooseBatchPurpose(editor, "现场补料");
  await editor.getByRole("button", { name: "关闭", exact: true }).last()
    .click();
  await expect(page.getByRole("alertdialog", {
    name: "放弃未保存的更改？",
  })).toBeVisible();
});

test("保存进行中锁定按钮，连续触发只发送一次 mutation", async ({
  page,
  request,
}) => {
  const editor = await openProjectBatchEditor(page, request);
  const saveRequestPattern =
    "**/api/backend/supplier-purchase-batches/*/save-draft";
  let releaseRequest: () => void = () => {};
  const requestGate = new Promise<void>((resolve) => {
    releaseRequest = resolve;
  });
  await page.route(
    saveRequestPattern,
    async (route) => {
      await requestGate;
      await route.continue();
    },
  );
  try {
    const intercepted = page.waitForRequest(
      (request) =>
        request.method() === "POST" &&
        request.url().includes(
          "/api/backend/supplier-purchase-batches/",
        ) && request.url().endsWith("/save-draft"),
      { timeout: 5_000 },
    );
    const save = editor.getByRole("button", {
      name: "保存草稿",
      exact: true,
    });
    await save.click();
    await intercepted;
    const pendingSave = editor.getByRole("button", {
      name: "正在确认…",
      exact: true,
    });
    await expect(pendingSave).toHaveText("正在确认…");
    await expect(pendingSave).toBeDisabled();
    await pendingSave.evaluate((button: HTMLButtonElement) => button.click());
    releaseRequest();
    await expect(page.getByText("本次保存的供应商拆单预览"))
      .toBeVisible();
    expect((await readBatchState(request)).commands).toHaveLength(1);
  } finally {
    releaseRequest();
    await page.unroute(saveRequestPattern);
  }
});

test("375×812 可真实加入商品，保存入口留在视口且页面不横溢", async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const editor = await openProjectBatchEditor(page, request, {
    addProduct: "采购商品01",
  });
  await expect(editor.getByRole("heading", {
    name: "采购商品01 · 标准规格",
    exact: true,
  })).toBeVisible();
  const save = editor.getByRole("button", { name: "保存草稿", exact: true });
  await expect(save).toBeInViewport();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBe(true);
  expect(
    await editor.evaluate((element) => element.scrollWidth <= element.clientWidth),
  ).toBe(true);
});
