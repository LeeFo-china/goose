import { existsSync, readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

function source(path: string) {
  const url = new URL(path, import.meta.url);
  expect(existsSync(url)).toBe(true);
  return readFileSync(url, "utf8");
}

describe("supplier master-detail workspace", () => {
  test("keeps the page summary compact on narrow screens", () => {
    const page = source("../../app/(console)/platform/ai-models/page.tsx");
    expect(page).not.toContain('className="grid shrink-0 gap-3 md:grid-cols-3"');
    expect(page).toContain("text-xl font-semibold");
  });
  test("supplier tab mounts one workspace and route tab remains separate", () => {
    const panel = source("./ai-model-routing-panel.tsx");
    expect(panel).toContain("<AiProviderWorkspace");
    expect(panel).toContain('<TabsTrigger value="routes">场景路由</TabsTrigger>');
    expect(panel).toContain('<TabsTrigger value="providers">供应商</TabsTrigger>');
    expect(panel).not.toContain("<ProviderFormCard");
    expect(panel).not.toContain("<ModelFormCard");
    expect(panel).not.toContain("providerForm");
  });
  test("workspace keeps table overflow local with a single-column mobile layout", () => {
    const workspace = source("./ai-provider-workspace.tsx");
    expect(workspace).toContain("xl:grid-cols-[320px_minmax(0,1fr)]");
    expect(workspace).toContain("<ProviderRail");
    expect(workspace).toContain("min-w-0");
    expect(workspace).toContain("overflow-auto");
    expect(workspace).toContain("<AiProviderEditor");
    expect(workspace).toContain("<Separator");
    expect(workspace).toContain("<AiProviderModels");
    const models = source("./ai-provider-models.tsx");
    expect(models).toContain("containerClassName=");
    expect(models).toContain('className="break-all text-xs text-muted-foreground"');
    expect(models).not.toContain('className="truncate text-xs text-muted-foreground"');
  });
  test("models expose modality controls and only a read-only existing system code", () => {
    const models = source("./ai-provider-models.tsx");
    expect(models).toContain("模型模态");
    expect(models).toContain("输入模态");
    expect(models).toContain("系统编码");
    expect(models).toContain("readOnly");
    expect(models).not.toMatch(/onChange\(\{\s*\.\.\.form,\s*code:/);
    expect(source("./ai-model-routing-sections.tsx")).not.toMatch(/onChange\(\{\s*\.\.\.form,\s*code:/);
  });
  test("provider editor has supported protocols and factual validation results", () => {
    const editor = source("./ai-provider-editor.tsx");
    expect(editor).toContain("Endpoint Base URL");
    expect(editor).toContain("openai_compatible");
    expect(editor).toContain("openrouter");
    expect(editor).not.toContain("anthropic");
    expect(editor).toContain("/validate");
    expect(editor).toContain('status === "verified"');
    expect(editor).toContain("配置已保存，当前协议没有无损验证方式");
  });
  test("secret editor can manage a registered reference before provider save", () => {
    const secret = source("./ai-provider-secret-editor.tsx");
    expect(secret).not.toContain("Boolean(form.id &&");
    expect(secret).toContain("已配置，模型调用未验证");
    expect(secret).toContain("没有密钥管理权限");
    expect(secret).not.toContain("selected?.key");
    expect(secret).not.toMatch(/<FieldDescription>\s*\{form\.api_key_setting_key/);
  });
});
