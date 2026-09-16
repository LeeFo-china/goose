import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, test, spyOn } from "bun:test";

function readSource(path: string) {
  const url = new URL(path, import.meta.url);
  expect(existsSync(url), path).toBe(true);
  return existsSync(url) ? readFileSync(url, "utf8") : "";
}

const pagePath = "../../app/(console)/platform/service-products/page.tsx";

describe("平台技术服务限时活动页面", () => {
  test("链接式 Tabs 仅请求当前分页列表", () => {
    const page = readSource(pagePath) + readSource("./platform-service-promotion-tabs.tsx");
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
    for (const value of ["确认发布活动", "确认停止活动", "1 年套餐", "2 年套餐", "3 年套餐", "price_preview", "expected_version: confirmationPromotion.version", "crypto.randomUUID()", "/publish", "/stop", 'method: "POST"', 'variant="destructive"', "reason.trim()", "500"]) {
      expect(detail).toContain(value);
    }
    expect(detail).toContain("if (pendingRef.current) return");
    expect(detail).toContain("if (!pendingRef.current)");
    expect(detail).toContain("event.preventDefault()");
    expect(detail).not.toContain("calculatePromotionAmount");
    expect(detail).toContain('promotion.phase === "active"');
    expect(detail).toContain('promotion.phase === "scheduled"');
  });

  test("发布前获取有界最新预览，再以确认版本提交", async () => {
    const detail = readSource("./platform-service-promotion-detail.tsx");
    expect(detail).toContain("await loadPromotionPreview");
    expect(detail).toContain("setConfirmationPromotion(freshPromotion)");
    expect(detail).toContain("prices={confirmationPromotion.price_preview}");
    expect(detail).toContain("找不到该活动");
    const { loadPromotionPreview } = await import("./platform-service-promotion-detail");
    const freshPromotion = { id: "promotion-1", version: 9, price_preview: [{ list_amount_fen: 1200000, base_amount_fen: 1000000, effective_amount_fen: 200000 }] };
    const fetchMock = spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { list: [freshPromotion] } })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { list: [freshPromotion] } })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: "读取失败" }), { status: 500 }));
    try {
      expect(await loadPromotionPreview("promotion-1", 2, 20)).toMatchObject(freshPromotion);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [path, init] = fetchMock.mock.calls[0]!;
      expect(path).toBe("/api/backend/platform/billing/service-promotions?page=2&pageSize=20");
      expect(init).toMatchObject({ method: "GET", cache: "no-store" });
      expect(await loadPromotionPreview("missing", 2, 20)).toBeUndefined();
      await expect(loadPromotionPreview("promotion-1", 2, 20)).rejects.toMatchObject({ message: "读取失败" });
    } finally { fetchMock.mockRestore(); }
  });

  test("确认展示三种金额、版本以及新旧订单和自动恢复影响", () => {
    const detail = readSource("./platform-service-promotion-detail.tsx");
    for (const text of ["标价", "日常价", "活动价", "price.list_amount_fen", "confirmationPromotion.version", "只影响发布后创建的新订单，已有订单继续使用订单快照", "发布后到开始时间自动生效，到结束时间自动恢复日常价", "新内容和价格将立即影响后续新订单"]) {
      expect(detail).toContain(text);
    }
  });

  test("危险确认按钮不再被 AlertDialogAction 的主色类覆盖", async () => {
    const detail = readSource("./platform-service-promotion-detail.tsx");
    expect(detail).not.toContain("AlertDialogAction");
    const { Button } = await import("../ui/button");
    const html = renderToStaticMarkup(createElement(Button, { variant: "destructive" }, "确认停止活动"));
    expect(html).toContain("bg-destructive");
    expect(html).not.toContain("bg-primary");
  });

  test("链接 Tabs 手动激活，两个 trigger 都存在对应面板", async () => {
    const page = readSource(pagePath);
    expect(page).toContain('activationMode="manual"');
    expect(page).toContain('<TabsContent value="products" forceMount');
    expect(page).toContain('<TabsContent value="promotions" forceMount');
    expect(page).toContain('hidden={isPromotions}');
    expect(page).toContain('hidden={!isPromotions}');
    const nav = readSource("./platform-service-promotion-tabs.tsx");
    expect(nav).toContain('event.key === " "');
    expect(nav).toContain("event.currentTarget.click()");
    const { Tabs, TabsContent } = await import("../ui/tabs");
    const { PlatformServicePromotionTabsNav } = await import("./platform-service-promotion-tabs");
    const html = renderToStaticMarkup(createElement(Tabs, { value: "promotions", activationMode: "manual" },
      createElement(PlatformServicePromotionTabsNav, { pageSize: 20 }),
      createElement(TabsContent, { value: "products", forceMount: true, hidden: true }),
      createElement(TabsContent, { value: "promotions", forceMount: true }, "限时活动列表"),
    ));
    const controls = [...html.matchAll(/aria-controls="([^"]+)"/g)];
    expect(controls).toHaveLength(2);
    for (const match of controls) expect(html).toContain(`id="${match[1]}"`);
    expect([...html.matchAll(/role="tabpanel"/g)]).toHaveLength(2);
  });

  test("列表和对话框保持平铺，无嵌套 Card", () => {
    for (const name of ["table", "form", "detail"]) {
      expect(readSource(`./platform-service-promotion-${name}.tsx`)).not.toContain('@/components/ui/card');
    }
    const loading = readSource("../../app/(console)/platform/service-products/loading.tsx");
    expect(loading).toContain('aria-label="加载套餐与限时活动"');
  });
});
