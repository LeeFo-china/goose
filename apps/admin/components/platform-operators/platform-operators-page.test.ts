import { existsSync, readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

function readSource(path: string) {
  const url = new URL(path, import.meta.url);
  expect(existsSync(url), path).toBe(true);
  return existsSync(url) ? readFileSync(url, "utf8") : "";
}

async function loadRules() {
  return import("./platform-operator-rules").catch(() => null);
}

describe("平台运营人员管理页", () => {
  test("在超管导航中按平台人员查看权限注册入口", () => {
    const menu = readSource("../layout/menu-config.ts");

    expect(menu).toContain('href: "/platform/operators"');
    expect(menu).toContain('label: "平台人员"');
    expect(menu).toContain('permission: "platform.operator.read"');
  });

  test("页面只面向平台身份并读取人员与角色分页接口", () => {
    const page = readSource("../../app/(console)/platform/operators/page.tsx");

    expect(page).toContain("isPlatformOnlySession");
    expect(page).toContain("isPlatformSuperAdmin");
    expect(page).toContain("platform.operator.read");
    expect(page).toContain("platform.operator.manage");
    expect(page).toContain("buildBackendUrl(`/platform/operators?");
    expect(page).toContain('"/platform/roles?page=1&pageSize=100&status=active"');
    expect(page).toContain("PlatformOperatorsTable");
    expect(page).toContain("PlatformOperatorFormButton");
  });

  test("筛选查询始终分页并保留有效状态和角色条件", async () => {
    const rules = await loadRules();
    expect(rules).not.toBeNull();
    if (!rules) return;

    expect(rules.buildPlatformOperatorQuery({
      page: 2,
      pageSize: 20,
      keyword: "  张三  ",
      status: "active",
      roleId: "11111111-1111-4111-8111-111111111111",
    })).toBe(
      `/platform/operators?page=2&pageSize=20&keyword=${encodeURIComponent("张三")}&status=active&roleId=11111111-1111-4111-8111-111111111111`,
    );

    expect(rules.buildPlatformOperatorQuery({
      page: 1,
      pageSize: 100,
      keyword: "",
      status: "",
      roleId: "",
    })).toBe("/platform/operators?page=1&pageSize=100");
  });

  test("人员命令携带乐观版本和 UUID 幂等键", async () => {
    const rules = await loadRules();
    expect(rules).not.toBeNull();
    if (!rules) return;

    const update = rules.buildPlatformOperatorUpdatePayload({
      name: "李四",
      phone: "13800138000",
      status: "active",
      expectedVersion: 7,
      idempotencyKey: "22222222-2222-4222-8222-222222222222",
    });
    expect(update).toEqual({
      name: "李四",
      phone: "13800138000",
      status: "active",
      expected_version: 7,
      idempotency_key: "22222222-2222-4222-8222-222222222222",
    });

    const action = rules.buildPlatformOperatorActionPayload({
      expectedVersion: 8,
      idempotencyKey: "33333333-3333-4333-8333-333333333333",
    });
    expect(action).toEqual({
      expected_version: 8,
      idempotency_key: "33333333-3333-4333-8333-333333333333",
    });
  });

  test("操作按钮覆盖状态流转、角色分配和会话撤销", () => {
    const actions = readSource("./platform-operator-actions.tsx");

    expect(actions).toContain("/platform/operators/${operator.id}/${action}");
    expect(actions).toContain('/platform/operators/${operator.id}/roles');
    expect(actions).toContain("crypto.randomUUID()");
    expect(actions).toContain("buildPlatformOperatorActionPayload");
    expect(actions).toContain("buildPlatformOperatorRolesPayload");
  });

  test("列表表格使用员工已有创建时间字段", () => {
    const table = readSource("./platform-operator-table.tsx");

    expect(table).toContain('accessorKey: "created_at"');
    expect(table).toContain('header: "创建时间"');
    expect(table).not.toContain('accessorKey: "updated_at"');
  });

  test("加载骨架屏复用真实列表壳高度与表格结构", () => {
    const page = readSource("../../app/(console)/platform/operators/page.tsx");
    const loading = readSource("../../app/(console)/platform/operators/loading.tsx");

    for (const source of [page, loading]) {
      expect(source).toContain("h-[calc(100vh-6.5625rem)]");
      expect(source).toContain("min-h-0 flex-col gap-5 overflow-hidden");
    }
    expect(loading).toContain("Skeleton");
    expect(loading).toContain("平台人员");
    expect(loading).toContain("CardHeader");
    expect(loading).toContain("CardContent");
  });
});
