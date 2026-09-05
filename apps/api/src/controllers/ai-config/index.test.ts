import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

function source() {
  return readFileSync(new URL("./index.ts", import.meta.url), "utf8");
}

describe("AiConfigController routes", () => {
  test("declares paginated catalog and OpenRouter command routes", () => {
    const code = source();
    for (const route of [
      '@Get("/platform/ai-config/providers")',
      '@Get("/platform/ai-config/models")',
      '@Get("/platform/ai-config/routes")',
      '@Get("/platform/ai-config/providers/:id/route-model-options")',
      '@Post("/platform/ai-config/providers/:id/route-model-options:resolve")',
      '@Get("/platform/ai-config/catalog-runs")',
      '@Get("/platform/ai-config/catalog-runs/:id/entries")',
      '@Post("/platform/ai-config/openrouter/models/sync-preview")',
      '@Post("/platform/ai-config/openrouter/models/apply")',
      '@Patch("/platform/ai-config/models/:id/capability")',
      '@Get("/platform/ai-config/openrouter/credits")',
      '@Get("/platform/ai-config/usage-summary")',
    ]) {
      expect(code).toContain(route);
    }
    expect(code).toContain("AiModelListQuerySchema.safeParse");
    expect(code).toContain("AiRouteModelOptionListQuerySchema.safeParse");
    expect(code).toContain("AiRouteModelOptionResolvePayloadSchema.safeParse");
    expect(code).toContain("OpenRouterCatalogApplyPayloadSchema.safeParse");
    expect(code).toContain("this.getAiConfigManageContext(request)");
  });
});
