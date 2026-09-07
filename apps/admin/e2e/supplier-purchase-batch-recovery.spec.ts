import { expect, test } from "@playwright/test";
import { ids, warehouses } from "./supplier-purchase-batch-fixture.mjs";

// Wire-level response faults only; the existing isolated HTTP fixture still
// executes and records the real UI request before its reply is altered.
const backend = "http://127.0.0.1:3986";
test.afterEach(async ({ page }) => {
  // Let any refresh response handler finish before Playwright closes its page.
  await page.unrouteAll({ behavior: "wait" });
});
for (const legacy of [false, true]) {
  test(`动作原目的地快照刷新恢复${legacy ? "：旧候选缺失快照保留key并停止发送" : "：当前目的地变化仍重放原请求"}`, async ({ page, request }) => {
    await request.post(`${backend}/__test/reset?scenario=project-pending`);
    await page.request.post("/api/auth/login", {
      data: { phone: "reviewer", code: "" },
    });
    const changedDestination = {
      destination_type: "warehouse",
      project_id: null,
      warehouse_id: warehouses[21].id,
      budget_status: "not_applicable",
      budget_snapshot: {},
    };
    let firstReply = true;
    await page.route(
      `**/api/backend/supplier-purchase-batches/${ids.batch}/review`,
      async (route) => {
        const response = await route.fetch();
        if (!firstReply) return route.fulfill({ response });
        firstReply = false;
        const body = await response.json();
        body.data.batch = { ...body.data.batch, ...changedDestination };
        await route.fulfill({ response, json: body });
      },
    );
    await page.goto(
      `/supplier-purchase-batches?purchase_batch_id=${ids.batch}`,
    );
    const detail = page.getByRole("dialog", { name: /采购批次 ·/ });
    await detail.getByRole("button", { name: "驳回", exact: true }).click();
    const action = page.getByRole("dialog", { name: "驳回采购批次" });
    await action.getByLabel("审批意见（必填）").fill("请重新核查材料");
    await action.getByRole("button", { name: "确认驳回", exact: true }).click();
    await expect(
      action.getByRole("button", { name: "使用原请求重试", exact: true }),
    ).toBeEnabled();
    const before = await (await request.get(`${backend}/__test/state`)).json();
    expect(before.commands).toHaveLength(1);
    expect(before.records).toHaveLength(1);
    expect(before.records[0].status).toBe("rejected");
    expect(before.commands[0].payload).toEqual({
      expected_version: 1,
      action: "reject",
      remark: "请重新核查材料",
    });
    if (legacy) {
      await page.evaluate(() => {
        for (const key of Object.keys(sessionStorage)) {
          if (!key.includes(":purchase-batch:")) continue;
          const stored = JSON.parse(sessionStorage.getItem(key) || "{}");
          if (stored.pending?.kind !== "review") continue;
          delete stored.pending.destination;
          sessionStorage.setItem(key, JSON.stringify(stored));
        }
      });
    }
    // A later detail response may describe a different destination. It cannot
    // substitute for the original action's locally frozen destination.
    await page.route(
      `**/api/backend/supplier-purchase-batches/${ids.batch}`,
      async (route) => {
        const response = await route.fetch(), body = await response.json();
        body.data = {
          ...body.data,
          ...changedDestination,
          project: null,
          warehouse: {
            id: warehouses[21].id,
            name: warehouses[21].name,
            status: "active",
          },
        };
        await route.fulfill({ response, json: body });
      },
    );
    await page.reload();
    await expect(detail.getByText("仓库补货 · 补货仓22")).toBeVisible();
    const retry = detail.getByRole("button", {
      name: "使用原请求重试",
      exact: true,
    });
    if (legacy) {
      await expect(detail.getByText(/旧请求缺少原目的地快照/)).toBeVisible();
      await expect(retry).toBeDisabled();
      const storedKeys = await page.evaluate(() =>
        Object.keys(sessionStorage)
          .filter((key) => key.includes(":purchase-batch:"))
          .map((key) =>
            JSON.parse(sessionStorage.getItem(key) || "{}").pending?.command
              .attempt.idempotencyKey
          )
      );
      expect(storedKeys).toContain(before.commands[0].key);
      expect(
        (await (await request.get(`${backend}/__test/state`)).json()).commands,
      ).toHaveLength(1);
      return;
    }
    await retry.click();
    await expect(retry).toHaveCount(0);
    const after = await (await request.get(`${backend}/__test/state`)).json();
    expect(after.records).toHaveLength(1);
    expect(after.commands).toHaveLength(2);
    expect(after.commands[1]).toEqual(before.commands[0]);
  });
}
