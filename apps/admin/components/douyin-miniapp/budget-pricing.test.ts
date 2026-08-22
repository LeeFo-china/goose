import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { FactorEditor, PricingItemEditor } from "./budget-pricing";
import { createEmptyPricingEditorItem } from "./budget-pricing-logic";

const componentFile = new URL("./budget-pricing.tsx", import.meta.url);
const pageFile = new URL(
  "../../app/(console)/douyin-miniapp/budget/page.tsx",
  import.meta.url,
);

describe("douyin budget pricing admin UI contract", () => {
  test("provides the complete version workflow with guarded activation", async () => {
    const source = await Bun.file(componentFile).text();
    expect(source).toContain("/tenant/douyin-miniapp/budget/pricing-versions");
    expect(source).toContain("/items");
    expect(source).toContain("/factors");
    expect(source).toContain("buildPricingFactorsPayload");
    expect(source).toContain("dirty || factorDirty");
    expect(source).toContain('"activate"');
    expect(source).toContain('"archive"');
    expect(source).toContain("AlertDialogTitle");
    expect(source).toContain("启用报价版本");
    expect(source).toContain("buildPricingItemsPayload");
    expect(source).toMatch(/setItems\(normalizePricingEditorItemOrder/);
    expect(source).toContain("addPricingEditorItem(current");
    expect(source).toContain("removePricingEditorItem(current");
    expect(source).toContain(
      "setItems(normalizePricingEditorItemOrder(selectedVersion.items.map(pricingItemToEditor)))",
    );
    expect(source).toContain("createBudgetPricingRequestAuthority");
    expect(source).toContain("撤销未保存修改");
    expect(source).toContain("const requestAuthority");
    expect(source).toContain(
      "isCurrent={version.id === activeVersion?.id}",
    );
    expect(source).toContain(
      "pricingStatusDisplay(version.status, isCurrent)",
    );
    expect(source).not.toContain("const listAuthority");
    expect(source).toContain("signal: mutationRequest.controller.signal");
    expect(source).toContain("await loadPage(pageTarget.current())");
    expect(source).not.toContain("void loadPage");
    expect(source).toContain("disabled={busy}");
    expect(source.indexOf("await loadPage(pageTarget.current())"))
      .toBeLessThan(source.indexOf("toast.success(successMessage)"));
  });

  test("uses accessible human-facing fields and never exposes internal expressions or AI secrets", async () => {
    const source = await Bun.file(componentFile).text();
    expect(source).toContain("FieldGroup");
    expect(source).toContain("aria-invalid");
    expect(source).toContain("validation-summary");
    expect(source).toContain("100㎡舒适档毛坯全屋预览");
    expect(source).toContain("项目状态");
    expect(source).toContain("适用房屋现状");
    expect(source).toContain("户型复杂度系数");
    expect(source).toContain("风格复杂度系数");
    expect(source).toContain('id="budget-pricing-save-validation-summary"');
    expect(source).toContain('id="budget-pricing-activation-validation-summary"');
    expect(source).toMatch(/aria-describedby=\{saveWarnings\.length > 0 \? "budget-pricing-save-validation-summary"/);
    expect(source).toMatch(/aria-describedby=\{activationWarnings\.length > 0 \? "budget-pricing-activation-validation-summary"/);
    expect(source).not.toContain("condition_payload");
    expect(source).not.toMatch(/ai[_ -]?(provider|model|key)|api[_ -]?key/i);
  });

  test("renders all layout and style factor labels from the version payload", () => {
    const factorPayload = {
      layout_coefficients_bps: {
        one_bedroom_one_living: 10_000,
        two_bedroom_one_living: 10_000,
        two_bedroom_two_living: 10_100,
        three_bedroom_one_living: 10_150,
        three_bedroom_two_living: 10_200,
        four_bedroom_two_living: 10_350,
        villa_duplex: 10_800,
        custom: 10_000,
      },
      style_coefficients_bps: {
        modern_simple: 10_000,
        cream: 10_300,
        new_chinese: 10_800,
        nordic: 10_200,
        light_luxury: 10_700,
        natural_wood: 10_300,
        american: 10_600,
        french: 10_800,
        wabi_sabi: 10_700,
        custom: 10_000,
      },
    };
    const markup = renderToStaticMarkup(createElement(FactorEditor, {
      factorPayload,
      warnings: [],
      onChange: () => undefined,
    }));
    expect(markup).toContain("自定义户型");
    expect(markup).toContain("自定义风格");
    expect(markup).toContain("三室两厅");
    expect(markup).toContain("新中式");
    expect(markup).toContain("value=\"101.50\"");
  });

  test("renders unique field errors for inverted, overflowing and out-of-range values", () => {
    const inverted = {
      ...createEmptyPricingEditorItem("base.comfortable.rough", 0),
      minimum_amount_yuan: "1200",
      maximum_amount_yuan: "900",
      property_condition_coefficient_bps: 0,
      whole_house_coefficient_bps: 100_001,
    };
    const overflowing = {
      ...createEmptyPricingEditorItem("custom_cabinet", 1),
      minimum_amount_yuan: "90071992547410",
      maximum_amount_yuan: "90071992547410",
    };
    const markup = renderToStaticMarkup(createElement("div", null,
      createElement(PricingItemEditor, {
        item: inverted, index: 0, onChange: () => undefined, onRemove: () => undefined,
      }),
      createElement(PricingItemEditor, {
        item: overflowing, index: 1, onChange: () => undefined, onRemove: () => undefined,
      }),
    ));

    expect(markup).toContain("最低价不能高于最高价");
    expect(markup).toContain("最高价不能低于最低价");
    expect(markup).toContain("金额超出可保存范围");
    expect(markup).toContain("系数必须大于 0");
    expect(markup).toContain("系数不能超过 1000%");
    const describedIds = [...markup.matchAll(/aria-describedby="([^"]+-error)"/g)]
      .map((match) => match[1]!);
    const renderedIds = [...markup.matchAll(/id="([^"]+-error)"/g)]
      .map((match) => match[1]!);
    expect(describedIds.length).toBeGreaterThanOrEqual(6);
    expect(new Set(renderedIds).size).toBe(renderedIds.length);
    expect(describedIds.every((id) => renderedIds.includes(id))).toBe(true);
  });

  test("server-loads the first bounded page and enforces tenant management permission", async () => {
    const source = await Bun.file(pageFile).text();
    expect(source).toContain('const PAGE_SIZE = 20');
    expect(source).toContain('"douyin_miniapp.manage"');
    expect(source).toContain("pricing-versions?page=1&pageSize=20");
    expect(source).toContain("normalizePricingVersionPage");
  });

  test("uses a scroll-safe layout for long pricing forms", async () => {
    const source = await Bun.file(componentFile).text();
    expect(source).toContain("flex h-full min-h-0 flex-col");
    expect(source).toContain("min-h-0");
    expect(source).toContain("overflow-y-auto");
    expect(source).toContain("pb-24");
  });
});
