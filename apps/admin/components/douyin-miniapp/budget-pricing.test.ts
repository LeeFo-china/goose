import { describe, expect, test } from "bun:test";

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
    expect(source).toContain('"activate"');
    expect(source).toContain('"archive"');
    expect(source).toContain("AlertDialogTitle");
    expect(source).toContain("启用报价版本");
    expect(source).toContain("buildPricingItemsPayload");
    expect(source).toContain("createBudgetPricingRequestAuthority");
    expect(source).toContain("撤销未保存修改");
    expect(source).toMatch(/handleCreateDraft[\s\S]+?loadPage\(1\)/);
  });

  test("uses accessible human-facing fields and never exposes internal expressions or AI secrets", async () => {
    const source = await Bun.file(componentFile).text();
    expect(source).toContain("FieldGroup");
    expect(source).toContain("aria-invalid");
    expect(source).toContain("validation-summary");
    expect(source).toContain("100㎡舒适档毛坯全屋预览");
    expect(source).toContain("项目状态");
    expect(source).toContain("适用房屋现状");
    expect(source).not.toContain("condition_payload");
    expect(source).not.toMatch(/ai[_ -]?(provider|model|key)|api[_ -]?key/i);
  });

  test("server-loads the first bounded page and enforces tenant management permission", async () => {
    const source = await Bun.file(pageFile).text();
    expect(source).toContain('const PAGE_SIZE = 20');
    expect(source).toContain('"douyin_miniapp.manage"');
    expect(source).toContain("pricing-versions?page=1&pageSize=20");
    expect(source).toContain("normalizePricingVersionPage");
  });
});
