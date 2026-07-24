import { existsSync, readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";
import { shouldLoadSupplierResources } from "./supplier-workspace-rules";

function readSource(path: string) {
  const url = new URL(path, import.meta.url);
  expect(existsSync(url), path).toBe(true);
  return existsSync(url) ? readFileSync(url, "utf8") : "";
}

describe("租户合作供应商工作台", () => {
  test("在采购供应导航组中按查看权限注册入口", () => {
    const source = readSource("../layout/menu-config.ts");

    expect(source).toContain('label: "采购供应"');
    expect(source).toContain('href: "/suppliers"');
    expect(source).toContain('label: "合作供应商"');
    expect(source).toContain('permission: "supplier.view"');
  });

  test("模块禁用时只显示只读空态且不加载供应商资源", () => {
    const source = readSource("./supplier-workspace.tsx");

    expect(source).toContain("供应商模块尚未启用");
    expect(source).toContain("if (!settings.module_enabled)");
    expect(source).toContain(
      "if (!shouldLoadSupplierResources(settings.module_enabled)) return",
    );
    expect(source).toContain("disabledModule");
    expect(shouldLoadSupplierResources(false)).toBe(false);
    expect(shouldLoadSupplierResources(true)).toBe(true);
  });

  test("列表分页展示合作、准入、账期、合同和负责人", () => {
    const source = readSource("./tenant-supplier-table.tsx");

    for (const column of [
      "供应商",
      "合作状态",
      "新订单资格",
      "结算条款",
      "合同健康",
      "租户负责人",
      "操作",
    ]) {
      expect(source).toContain(column);
    }
    expect(source).toContain("pagination");
    expect(source).not.toContain("成本价");
  });

  test("添加合作供应商使用分页目录且初始状态为评估中", () => {
    const source = readSource("./add-supplier-dialog.tsx");

    expect(source).toContain("/suppliers/directory?");
    expect(source).toContain('pageSize: "10"');
    expect(source).toContain("evaluating");
    expect(source).toContain('"Idempotency-Key"');
    expect(source).not.toContain("成本价");
  });

  test("详情使用五个按需加载页签和乐观版本更新", () => {
    const source = readSource("./tenant-supplier-detail.tsx");
    const panels = readSource("./tenant-supplier-detail-panels.tsx");
    const dataSource = readSource("./use-tenant-supplier-detail.ts");

    for (const tab of [
      "合作设置",
      "合同",
      "准入与资质",
      "服务区域",
      "操作记录",
    ]) {
      expect(source).toContain(tab);
    }
    expect(source).toContain("平台供应商资料（只读）");
    expect(source).toContain("expected_version");
    expect(panels).toContain("blocking_reasons");
    expect(panels).not.toContain("/platform/suppliers");
    expect(dataSource).toContain("pageSize=10");
    expect(dataSource).not.toContain("Promise.all");
  });

  test("关系状态只能通过显式命令变更并处理版本冲突", () => {
    const source = readSource("./tenant-supplier-actions.tsx");

    for (const action of ["启用合作", "暂停合作", "终止合作", "加入租户黑名单"]) {
      expect(source).toContain(action);
    }
    expect(source).toContain('"Idempotency-Key"');
    expect(source).toContain("expected_version");
    expect(source).toContain("刷新最新数据");
    expect(source).toContain("重试本次操作");
    expect(source).not.toMatch(/<select[\s>]/i);
  });
});

describe("平台租户供应商模块开关", () => {
  test("租户详情按权限挂载开关并默认禁用缺失配置", () => {
    const page = readSource(
      "../../app/(console)/platform/tenants/[id]/page.tsx",
    );
    const card = readSource(
      "../platform-tenants/tenant-supplier-settings-card.tsx",
    );
    const settingsApi = readSource("./supplier-settings-api.ts");

    expect(page).toContain("/platform/tenant-supplier-settings/");
    expect(page).toContain("platform.supplier.manage");
    expect(page).toContain("TenantSupplierSettingsCard");
    expect(card).toContain("module_enabled: false");
    expect(card).toContain("停用原因");
    expect(card).toContain("const reason = disableReason.trim()");
    expect(card).toContain("pendingIntent");
    expect(card).toContain("重新加载");
    expect(card).not.toContain("<Switch");
    expect(settingsApi).toContain("expected_version: current.version");
    expect(settingsApi).toContain('"Idempotency-Key"');
    expect(card).toContain("模块启用时间");
    expect(card).toContain("新订单合同策略");
  });
});
