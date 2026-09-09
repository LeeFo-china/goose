import { expect, test } from "@playwright/test";
import type { APIRequestContext, Locator, Page } from "@playwright/test";

const mockBackendBaseUrl = "http://127.0.0.1:3993";
const platformAdminPhone = "18637605353";
const rolloutNames = [
  "所有权读取",
  "私有供应商写入",
  "私有目录写入",
  "采购单快照 V1",
  "采购批次 Workflow",
  "仓库采购",
] as const;

type RolloutName = typeof rolloutNames[number];

type MutationJournalEntry = {
  method: "PATCH";
  path: string;
  idempotencyKey: string | null;
  payload: Record<string, unknown>;
  responseStatus: number;
  rawBody: string;
};

type MockState = {
  settings: {
    version: number;
    module_enabled: boolean;
    ownership_reads_enabled: boolean;
    private_supplier_writes_enabled: boolean;
    private_catalog_writes_enabled: boolean;
    procurement_snapshot_v1_enabled: boolean;
    purchase_batch_workflow_enabled: boolean;
    warehouse_procurement_enabled: boolean;
    warehouse_materials_enabled: boolean;
    warehouse_transfers_enabled: boolean;
    warehouse_stocktakes_enabled: boolean;
  };
  mutations: MutationJournalEntry[];
  settingsReadCount: number;
};

async function resetMock(request: APIRequestContext) {
  const response = await request.post(`${mockBackendBaseUrl}/__test/reset`);
  expect(response.ok()).toBe(true);
}

async function loginAsPlatformAdmin(page: Page) {
  const response = await page.request.post("/api/auth/login", {
    data: { phone: platformAdminPhone, code: "" },
  });
  expect(response.ok()).toBe(true);
}

async function readState(request: APIRequestContext): Promise<MockState> {
  const response = await request.get(`${mockBackendBaseUrl}/__test/state`);
  expect(response.ok()).toBe(true);
  return await response.json() as MockState;
}

function switches(page: Page): Record<RolloutName, Locator> {
  return Object.fromEntries(
    rolloutNames.map((name) => [name, page.getByRole("switch", { name })]),
  ) as Record<RolloutName, Locator>;
}

async function expectToggleWindow(
  controls: Record<RolloutName, Locator>,
  enabledNames: readonly RolloutName[],
) {
  for (const name of rolloutNames) {
    if (enabledNames.includes(name)) {
      await expect(controls[name]).toBeEnabled();
    } else {
      await expect(controls[name]).toBeDisabled();
    }
  }
}

async function expectVersion(request: APIRequestContext, version: number) {
  await expect.poll(async () => (await readState(request)).settings.version)
    .toBe(version);
}

test.describe("租户供应商灰度确定性交互", () => {
  test.beforeEach(async ({ page, request }) => {
    await resetMock(request);
    await loginAsPlatformAdmin(page);
  });

  test('盘点独立启停、原字节重试和父模块保护', async ({ page, request }, info) => {
    await request.post(`${mockBackendBaseUrl}/__test/reset`, { data: { level: 1, version: 1 } });
    await page.goto('/e2e-harness/supplier-rollout?level=1');
    const control = page.getByRole('switch', { name: '仓库盘点', exact: true });
    await expect(control).toBeEnabled();
    await request.post(`${mockBackendBaseUrl}/__test/failure-next`, { data: { status: 503, commit: true } });
    await control.click(); await expect(page.getByText('操作结果尚未确认', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '重试本次操作', exact: true }).click();
    await expect(control).toBeChecked(); await expectVersion(request, 2);
    const state = await readState(request);
    expect(state.settings).toMatchObject({ warehouse_stocktakes_enabled: true, warehouse_transfers_enabled: false, warehouse_materials_enabled: false, warehouse_procurement_enabled: false });
    expect(state.mutations).toHaveLength(2);
    expect(typeof state.mutations[0].rawBody).toBe('string');
    expect(state.mutations[1].rawBody).toBe(state.mutations[0].rawBody);
    expect(state.mutations[1].idempotencyKey).toBe(state.mutations[0].idempotencyKey);
    await expect(page.getByRole('button', { name: '停用供应商模块', exact: true })).toBeDisabled();
    await page.mouse.move(0, 0);
    await expect(page.locator('[data-sonner-toast]')).toHaveCount(0, { timeout: 10_000 });
    await control.scrollIntoViewIfNeeded(); await page.screenshot({ path: info.outputPath('stocktakes-independent.png'), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await control.click(); await expect(control).not.toBeChecked(); await expectVersion(request, 3);
    await expect(page.getByRole('button', { name: '停用供应商模块', exact: true })).toBeEnabled();
    expect((await readState(request)).mutations[2].payload.warehouse_stocktakes_enabled).toBe(false);
  });

  test('旧响应省略盘点字段，刷新新配置后原冻结body仍不补字段', async ({ page, request }) => {
    await request.post(`${mockBackendBaseUrl}/__test/reset`, { data: { level: 1, version: 1, stocktakes: true } });
    // Existing SSR harness intentionally represents a legacy response without this field.
    await page.goto('/e2e-harness/supplier-rollout?level=1');
    await request.post(`${mockBackendBaseUrl}/__test/failure-next`, { data: { status: 503, commit: true } });
    await page.getByRole('switch', { name: '所有权读取', exact: true }).click();
    await expect(page.getByText('操作结果尚未确认', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '重新加载', exact: true }).click();
    await expect(page.getByRole('switch', { name: '仓库盘点', exact: true })).toBeChecked();
    await page.getByRole('button', { name: '重试本次操作', exact: true }).click();
    await expect(page.getByText('操作结果尚未确认', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('switch', { name: '仓库盘点', exact: true })).toBeEnabled();
    const state = await readState(request); expect(state.mutations).toHaveLength(2);
    expect(Object.hasOwn(state.mutations[0].payload, 'warehouse_stocktakes_enabled')).toBe(false);
    expect(state.mutations[1].rawBody).toBe(state.mutations[0].rawBody);
    expect(state.mutations[1].idempotencyKey).toBe(state.mutations[0].idempotencyKey);
    expect(state.settings.warehouse_stocktakes_enabled).toBe(true);
  });

  test("调拨开关独立、冻结重试且关闭模块前必须关闭", async ({ page, request }, testInfo) => {
    await request.post(`${mockBackendBaseUrl}/__test/reset`, { data: { level: 1, version: 1 } });
    await page.goto('/e2e-harness/supplier-rollout?level=1');
    const transfer = page.getByRole('switch', { name: '仓库调拨', exact: true });
    await expect(transfer).toBeEnabled();
    await expect(page.getByRole('switch', { name: '仓库采购', exact: true })).toBeDisabled();
    await request.post(`${mockBackendBaseUrl}/__test/failure-next`, { data: { status: 503, commit: true } });
    await transfer.click();
    await expect(page.getByText('操作结果尚未确认', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '重试本次操作', exact: true }).click();
    await expect(transfer).toBeChecked();
    await expectVersion(request, 2);
    const state = await readState(request);
    expect(state.settings).toMatchObject({ warehouse_transfers_enabled: true, warehouse_materials_enabled: false, warehouse_procurement_enabled: false });
    expect(state.mutations).toHaveLength(2);
    expect(state.mutations[0].payload).toEqual(state.mutations[1].payload);
    expect(state.mutations[0].idempotencyKey).toBe(state.mutations[1].idempotencyKey);
    await expect(page.getByRole('button', { name: '停用供应商模块', exact: true })).toBeDisabled();
    await transfer.scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath('transfers-independent.png'), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await transfer.click();
    await expect(transfer).not.toBeChecked();
    await expectVersion(request, 3);
    await expect(page.getByRole('button', { name: '停用供应商模块', exact: true })).toBeEnabled();
  });

  test("领退料开关独立于采购链，未知结果重放原请求且阻止带子开关停用模块", async ({ page, request }, testInfo) => {
    await request.post(`${mockBackendBaseUrl}/__test/reset`, { data: { level: 1, version: 1 } });
    await page.goto("/e2e-harness/supplier-rollout?level=1", { waitUntil: "networkidle" });
    const materials = page.getByRole("switch", { name: "仓库领退料", exact: true });
    await expect(materials).toBeEnabled();
    await expect(page.getByRole("switch", { name: "仓库采购", exact: true })).toBeDisabled();
    await request.post(`${mockBackendBaseUrl}/__test/failure-next`, { data: { status: 503, commit: true } });
    await materials.click();
    await expect(page.getByText("操作结果尚未确认", { exact: true })).toBeVisible();
    await expect(materials).toBeDisabled();
    await page.getByRole("button", { name: "重试本次操作", exact: true }).click();
    await expect(materials).toBeChecked();
    await expectVersion(request, 2);
    const afterReplay = await readState(request);
    expect(afterReplay.settings).toMatchObject({ warehouse_materials_enabled: true, warehouse_procurement_enabled: false,
      ownership_reads_enabled: false, procurement_snapshot_v1_enabled: false });
    expect(afterReplay.mutations).toHaveLength(2);
    expect(afterReplay.mutations[0]!.idempotencyKey).toBe(afterReplay.mutations[1]!.idempotencyKey);
    expect(afterReplay.mutations[0]!.payload).toEqual(afterReplay.mutations[1]!.payload);
    const legacyDisable: Record<string, unknown> = { ...afterReplay.mutations[0]!.payload, module_enabled: false,
      expected_version: 2, reason: "验证旧客户端省略独立开关时不能越过依赖" };
    delete legacyDisable.warehouse_materials_enabled;
    const rejected = await request.patch(`${mockBackendBaseUrl}${afterReplay.mutations[0]!.path}`, {
      headers: { "Idempotency-Key": "legacy-disable-with-materials-enabled" }, data: legacyDisable,
    });
    expect(rejected.status()).toBe(409);
    expect((await readState(request)).settings).toMatchObject({ version: 2,
      module_enabled: true, warehouse_materials_enabled: true });
    await expect(page.getByRole("button", { name: "停用供应商模块", exact: true })).toBeDisabled();
    await page.mouse.move(0, 0);
    await expect(page.locator("[data-sonner-toast]")).toHaveCount(0, { timeout: 10_000 });
    await materials.scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath("materials-independent.png"), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await materials.click();
    await expect(materials).not.toBeChecked();
    await expectVersion(request, 3);
    await expect(page.getByRole("button", { name: "停用供应商模块", exact: true })).toBeEnabled();
  });

  test("按相邻顺序启停并发送完整带版本的幂等请求", async ({ page, request }, testInfo) => {
    await page.goto("/e2e-harness/supplier-rollout?level=0", {
      waitUntil: "networkidle",
    });
    await expect(
      page.getByRole("heading", { name: "供应商灰度测试台", level: 1 }),
    ).toBeVisible();

    const controls = switches(page);
    for (const name of rolloutNames) {
      await expect(controls[name]).toBeVisible();
      await expect(controls[name]).not.toBeChecked();
    }
    await expectToggleWindow(controls, []);

    const moduleButton = page.getByRole("button", {
      name: "启用供应商模块",
    });
    await moduleButton.click();
    await expectVersion(request, 1);
    await expectToggleWindow(controls, ["所有权读取"]);

    await controls["所有权读取"].click();
    await expect(controls["所有权读取"]).toBeChecked();
    await expectVersion(request, 2);
    await expectToggleWindow(controls, ["所有权读取", "私有供应商写入"]);

    const stopButton = page.getByRole("button", { name: "停用供应商模块" });
    await expect(stopButton).toBeDisabled();
    await expect(page.getByText("请先逆序关闭子开关")).toBeVisible();
    const childEnabledMutationCount = (await readState(request)).mutations.length;
    await stopButton.click({ force: true });
    await expect.poll(async () => (await readState(request)).mutations.length)
      .toBe(childEnabledMutationCount);

    await controls["私有供应商写入"].click();
    await expect(controls["私有供应商写入"]).toBeChecked();
    await expectVersion(request, 3);
    await expectToggleWindow(controls, ["私有供应商写入", "私有目录写入"]);

    await controls["私有目录写入"].click();
    await expect(controls["私有目录写入"]).toBeChecked();
    await expectVersion(request, 4);
    await expectToggleWindow(controls, ["私有目录写入", "采购单快照 V1"]);

    await controls["采购单快照 V1"].click();
    await expect(controls["采购单快照 V1"]).toBeChecked();
    await expectVersion(request, 5);
    await expectToggleWindow(controls, [
      "采购单快照 V1",
      "采购批次 Workflow",
    ]);

    await controls["采购批次 Workflow"].click();
    await expect(controls["采购批次 Workflow"]).toBeChecked();
    await expectVersion(request, 6);
    await expectToggleWindow(controls, ["采购批次 Workflow", "仓库采购"]);
    await controls["仓库采购"].click();
    await expect(controls["仓库采购"]).toBeChecked();
    await expectVersion(request, 7);
    await expectToggleWindow(controls, ["仓库采购"]);
    // Sonner pauses dismissal while its stack is hovered; leave the stack
    // before waiting for the existing timers to finish.
    await page.mouse.move(0, 0);
    await expect(page.locator("[data-sonner-toast]")).toHaveCount(0, { timeout: 10_000 });
    await controls["仓库采购"].scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath("warehouse-enabled.png"), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await controls["仓库采购"].click();
    await expect(controls["仓库采购"]).not.toBeChecked();
    await expectVersion(request, 8);

    await controls["采购批次 Workflow"].click();
    await expect(controls["采购批次 Workflow"]).not.toBeChecked();
    await expectVersion(request, 9);

    await controls["采购单快照 V1"].click();
    await expect(controls["采购单快照 V1"]).not.toBeChecked();
    await expectVersion(request, 10);
    await controls["私有目录写入"].click();
    await expect(controls["私有目录写入"]).not.toBeChecked();
    await expectVersion(request, 11);
    await controls["私有供应商写入"].click();
    await expect(controls["私有供应商写入"]).not.toBeChecked();
    await expectVersion(request, 12);
    await controls["所有权读取"].click();
    await expect(controls["所有权读取"]).not.toBeChecked();
    await expectVersion(request, 13);
    await expectToggleWindow(controls, ["所有权读取"]);

    const beforeReasonValidation = (await readState(request)).mutations.length;
    await stopButton.click();
    await expect(page.getByText("请填写停用原因。")).toBeVisible();
    expect((await readState(request)).mutations).toHaveLength(
      beforeReasonValidation,
    );

    await page.getByLabel("停用原因").fill("E2E 验证灰度逆序停用");
    await stopButton.click();
    await expectVersion(request, 14);
    await expect(page.getByRole("button", { name: "启用供应商模块" }))
      .toBeVisible();

    const state = await readState(request);
    expect(state.mutations).toHaveLength(14);
    expect(state.mutations.map(({ payload }) => payload.expected_version))
      .toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
    for (const mutation of state.mutations) {
      expect(mutation).toMatchObject({
        method: "PATCH",
        path: "/platform/tenant-supplier-settings/91000000-0000-4000-8000-000000000001",
        idempotencyKey: expect.stringMatching(/^tenant-supplier-/),
        responseStatus: 200,
      });
      for (const field of [
        "module_enabled",
        "require_active_contract_for_new_order",
        "ownership_reads_enabled",
        "private_supplier_writes_enabled",
        "private_catalog_writes_enabled",
        "procurement_snapshot_v1_enabled",
        "purchase_batch_workflow_enabled",
        "warehouse_procurement_enabled",
        "warehouse_materials_enabled",
        "warehouse_transfers_enabled",
        "expected_version",
      ]) {
        expect(mutation.payload).toHaveProperty(field);
      }
    }
    expect(state.mutations.at(-1)?.payload).toMatchObject({
      module_enabled: false,
      reason: "E2E 验证灰度逆序停用",
      expected_version: 13,
    });
  });

  test("pending 时锁定控件且明确版本冲突后新操作使用新幂等键", async ({ page, request }) => {
    await page.goto("/e2e-harness/supplier-rollout?level=0", {
      waitUntil: "networkidle",
    });
    const controls = switches(page);
    await page.getByRole("button", { name: "启用供应商模块" }).click();
    await expectVersion(request, 1);

    const delayResponse = await request.post(
      `${mockBackendBaseUrl}/__test/delay-next`,
      { data: { ms: 700 } },
    );
    expect(delayResponse.ok()).toBe(true);
    await controls["所有权读取"].click();
    await expect(page.getByRole("button", { name: /正在保存/ })).toBeDisabled();
    await expectToggleWindow(controls, []);
    await expect(controls["所有权读取"]).toBeChecked();
    await expectVersion(request, 2);

    const conflictResponse = await request.post(
      `${mockBackendBaseUrl}/__test/conflict-next`,
    );
    expect(conflictResponse.ok()).toBe(true);
    await controls["私有供应商写入"].click();
    await expect(page.getByText("数据版本已变化", { exact: true }))
      .toBeVisible();
    await expect.poll(async () => (await readState(request)).settingsReadCount)
      .toBeGreaterThanOrEqual(1);
    await expect(controls["私有供应商写入"]).not.toBeChecked();

    await expect(page.getByRole("button", { name: "重试本次操作" })).toHaveCount(0);
    await page.getByRole("button", { name: "刷新最新数据" }).click();
    await controls["私有供应商写入"].click();
    await expect(controls["私有供应商写入"]).toBeChecked();
    await expectVersion(request, 4);

    const mutations = (await readState(request)).mutations;
    expect(mutations.slice(-2).map((mutation) => ({
      expectedVersion: mutation.payload.expected_version,
      idempotencyKey: mutation.idempotencyKey,
      responseStatus: mutation.responseStatus,
    }))).toEqual([
      {
        expectedVersion: 2,
        idempotencyKey: expect.any(String),
        responseStatus: 409,
      },
      {
        expectedVersion: 3,
        idempotencyKey: expect.any(String),
        responseStatus: 200,
      },
    ]);
    expect(mutations.at(-1)?.idempotencyKey).not.toBe(
      mutations.at(-2)?.idempotencyKey,
    );
  });

  test("只读账号能查看全部开关但不能操作", async ({ page, request }) => {
    await page.goto("/e2e-harness/supplier-rollout?level=7&readonly=1", {
      waitUntil: "networkidle",
    });
    const controls = switches(page);
    await expect(page.getByRole("switch", { name: "仓库领退料", exact: true })).toBeVisible();
    await expect(page.getByRole("switch", { name: "仓库领退料", exact: true })).toBeDisabled();
    await expect(page.getByRole("switch", { name: "仓库盘点", exact: true })).toBeVisible();
    await expect(page.getByRole("switch", { name: "仓库盘点", exact: true })).toBeDisabled();
    for (const name of rolloutNames) {
      await expect(controls[name]).toBeVisible();
      await expect(controls[name]).toBeChecked();
      await expect(controls[name]).toBeDisabled();
    }
    await expect(
      page.getByText("当前账号没有 platform.supplier.manage 权限，仅可查看配置。"),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /供应商模块/ })).toHaveCount(0);
    expect((await readState(request)).mutations).toHaveLength(0);
  });

  for (const status of [503, 408, 429]) {
    test(`未知结果 ${status} 刷新后仍保留原请求并重放历史结果`, async ({ page, request }) => {
      await request.post(`${mockBackendBaseUrl}/__test/reset`, { data: { level: 6, version: 6 } });
      await page.goto("/e2e-harness/supplier-rollout?level=6", { waitUntil: "networkidle" });
      if (status === 408) {
        // Chromium automatically retries native 408 responses. Fulfill at the
        // browser boundary so this case exercises an observed unknown outcome.
        let firstPatch = true;
        await page.route("**/api/backend/platform/tenant-supplier-settings/**", async (route) => {
          if (route.request().method() !== "PATCH" || !firstPatch) return route.continue();
          firstPatch = false;
          const response = await route.fetch();
          await route.fulfill({ response, status: 408 });
        });
      }
      await request.post(`${mockBackendBaseUrl}/__test/failure-next`, { data: { status, commit: true } });
      await page.getByRole("switch", { name: "仓库采购", exact: true }).click();
      await expect(page.getByText("操作结果尚未确认", { exact: true })).toBeVisible();
      await request.post(`${mockBackendBaseUrl}/__test/advance-policy`);
      await page.getByRole("button", { name: "重新加载" }).click();
      await expect(page.getByRole("switch", { name: "仓库采购", exact: true })).toBeDisabled();
      // A retry permission rejection must retain the unknown original command.
      await request.post(`${mockBackendBaseUrl}/__test/failure-next`, { data: { status: 403, commit: false } });
      await page.getByRole("button", { name: "重试本次操作" }).click();
      await expect(page.getByText("测试请求失败", { exact: true }).first()).toBeVisible();
      await expect(page.getByText("操作结果尚未确认", { exact: true })).toBeVisible();
      await page.getByRole("button", { name: "重试本次操作" }).click();
      await expect.poll(async () => (await readState(request)).mutations.length).toBe(3);
      await expect(page.getByRole("button", { name: "正在保存", exact: true })).toHaveCount(0);
      await expect(page.getByText("操作结果尚未确认", { exact: true })).toHaveCount(0);
      await expectVersion(request, 8);
      const state = await readState(request);
      expect(state.mutations).toHaveLength(3);
      expect(state.mutations.map((entry) => entry.payload)).toEqual(Array(3).fill(state.mutations[0]!.payload));
      expect(new Set(state.mutations.map((entry) => entry.idempotencyKey)).size).toBe(1);
      expect(state.mutations[0]!.payload).toMatchObject({ warehouse_procurement_enabled: true, expected_version: 6,
        require_active_contract_for_new_order: false });
    });
  }

  test("保存成功后读取失败仅重新读取，不再提交命令", async ({ page, request }) => {
    await request.post(`${mockBackendBaseUrl}/__test/reset`, { data: { level: 6, version: 6 } });
    await page.goto("/e2e-harness/supplier-rollout?level=6", { waitUntil: "networkidle" });
    await request.post(`${mockBackendBaseUrl}/__test/fail-reads`);
    await page.getByRole("switch", { name: "仓库采购", exact: true }).click();
    await expect(page.getByText("配置读取失败", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "重试本次操作" })).toHaveCount(0);
    await page.getByRole("button", { name: "重新加载" }).click();
    await expect(page.getByRole("switch", { name: "仓库采购", exact: true })).toBeChecked();
    expect((await readState(request)).mutations).toHaveLength(1);
  });
});
