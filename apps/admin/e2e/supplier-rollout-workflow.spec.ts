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
] as const;

type RolloutName = typeof rolloutNames[number];

type MutationJournalEntry = {
  method: "PATCH";
  path: string;
  idempotencyKey: string | null;
  payload: Record<string, unknown>;
  responseStatus: number;
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

  test("按相邻顺序启停并发送完整带版本的幂等请求", async ({ page, request }) => {
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
    await expectToggleWindow(controls, ["采购批次 Workflow"]);

    await controls["采购批次 Workflow"].click();
    await expect(controls["采购批次 Workflow"]).not.toBeChecked();
    await expectVersion(request, 7);

    await controls["采购单快照 V1"].click();
    await expect(controls["采购单快照 V1"]).not.toBeChecked();
    await expectVersion(request, 8);
    await controls["私有目录写入"].click();
    await expect(controls["私有目录写入"]).not.toBeChecked();
    await expectVersion(request, 9);
    await controls["私有供应商写入"].click();
    await expect(controls["私有供应商写入"]).not.toBeChecked();
    await expectVersion(request, 10);
    await controls["所有权读取"].click();
    await expect(controls["所有权读取"]).not.toBeChecked();
    await expectVersion(request, 11);
    await expectToggleWindow(controls, ["所有权读取"]);

    const beforeReasonValidation = (await readState(request)).mutations.length;
    await stopButton.click();
    await expect(page.getByText("请填写停用原因。")).toBeVisible();
    expect((await readState(request)).mutations).toHaveLength(
      beforeReasonValidation,
    );

    await page.getByLabel("停用原因").fill("E2E 验证灰度逆序停用");
    await stopButton.click();
    await expectVersion(request, 12);
    await expect(page.getByRole("button", { name: "启用供应商模块" }))
      .toBeVisible();

    const state = await readState(request);
    expect(state.mutations).toHaveLength(12);
    expect(state.mutations.map(({ payload }) => payload.expected_version))
      .toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
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
        "expected_version",
      ]) {
        expect(mutation.payload).toHaveProperty(field);
      }
    }
    expect(state.mutations.at(-1)?.payload).toMatchObject({
      module_enabled: false,
      reason: "E2E 验证灰度逆序停用",
      expected_version: 11,
    });
  });

  test("pending 时锁定控件且 409 刷新后可用同一幂等键重试", async ({ page, request }) => {
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

    await page.getByRole("button", { name: "重试本次操作" }).click();
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
    expect(mutations.at(-1)?.idempotencyKey).toBe(
      mutations.at(-2)?.idempotencyKey,
    );
  });

  test("只读账号能查看六个开关但不能操作", async ({ page, request }) => {
    await page.goto("/e2e-harness/supplier-rollout?level=6&readonly=1", {
      waitUntil: "networkidle",
    });
    const controls = switches(page);
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
});
