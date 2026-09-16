import { existsSync, readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

function readSource(path: string) {
  const url = new URL(path, import.meta.url);
  expect(existsSync(url), path).toBe(true);
  return existsSync(url) ? readFileSync(url, "utf8") : "";
}

const pagePath = "../../app/(console)/platform/service-products/page.tsx";

describe("平台技术服务限时活动页面", () => {
  test("链接式 Tabs 仅请求当前分页列表", () => {
    const page = readSource(pagePath);
    expect(page).toContain('params.tab === "promotions" ? "promotions" : "products"');
    expect(page).toContain('if (activeTab === "promotions")');
    expect(page).toContain('/platform/billing/service-promotions?');
    expect(page).toContain('/platform/billing/service-products?');
    expect(page).not.toContain("Promise.all");
    expect(page).toContain("normalizePage(params.page)");
    expect(page).toContain("normalizePlatformListPageSize(params.pageSize)");
    expect(page).toContain('<Tabs value={activeTab}');
    expect(page).toContain('<TabsTrigger value="products" asChild');
    expect(page).toContain('<TabsTrigger value="promotions" asChild');
    expect(page).toContain('tab=promotions&page=1&pageSize=');
    expect(page).toContain("限时活动");
    const shell = readSource("../platform/platform-list-shell.tsx");
    expect(shell).toContain("new URLSearchParams(window.location.search)");
  });

  test("表格展示权威状态并提供唯一行操作", () => {
    const table = readSource("./platform-service-promotion-table.tsx");
    for (const label of ["活动", "折扣", "活动时间", "状态", "版本", "更新时间", "查看配置"]) {
      expect(table).toContain(label);
    }
    expect(table).toContain("getPromotionPhaseMeta(row.original.phase)");
    expect(table).not.toContain("Date.now");
    expect(table).toContain("emptyText=");
  });

  test("创建编辑使用已验证 payload 并锁定待提交对话框", () => {
    const form = readSource("./platform-service-promotion-form.tsx");
    for (const label of ["运营内容", "价格与时间", "开始时间", "结束时间", "datetime-local"]) {
      expect(form).toContain(label);
    }
    expect(form).toContain("buildPromotionPayload(values, promotion?.version)");
    expect(form).toContain('method: promotion ? "PATCH" : "POST"');
    expect(form).toContain("JSON.stringify(payload.body)");
    expect(form).toContain("if (pendingRef.current) return");
    expect(form).toContain("if (!pendingRef.current)");
    expect(form).toContain("StatusAlert");
    expect(form).toContain("router.refresh()");
  });

  test("发布停止确认使用后端预览和版本幂等控制", () => {
    const detail = readSource("./platform-service-promotion-detail.tsx");
    for (const value of ["确认发布活动", "确认停止活动", "1 年套餐", "2 年套餐", "3 年套餐", "price_preview", "expected_version: promotion.version", "crypto.randomUUID()", "/publish", "/stop", 'method: "POST"', 'variant="destructive"', "reason.trim()", "500"]) {
      expect(detail).toContain(value);
    }
    expect(detail).toContain("if (pendingRef.current) return");
    expect(detail).toContain("if (!pendingRef.current)");
    expect(detail).toContain("event.preventDefault()");
    expect(detail).not.toContain("calculatePromotionAmount");
    expect(detail).toContain('promotion.phase === "active"');
    expect(detail).toContain('promotion.phase === "scheduled"');
  });

  test("列表和对话框保持平铺，无嵌套 Card", () => {
    for (const name of ["table", "form", "detail"]) {
      expect(readSource(`./platform-service-promotion-${name}.tsx`)).not.toContain('@/components/ui/card');
    }
    const loading = readSource("../../app/(console)/platform/service-products/loading.tsx");
    expect(loading).toContain('aria-label="加载套餐与限时活动"');
  });
});
