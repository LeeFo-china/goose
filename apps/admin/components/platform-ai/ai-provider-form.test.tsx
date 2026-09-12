import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "bun:test";
import { ProviderFormCard, ProviderTable } from "./ai-model-routing-sections";
import {
  emptyProviderForm,
  normalizeProviderFormForType,
  OPENROUTER_API_KEY_SETTING_KEY,
  providerFormFromRecord,
  providerKeyDisplay,
  providerReferencePatch,
  emptyModelForm,
} from "./ai-model-routing-shared";
import * as shared from "./ai-model-routing-shared";
import * as secretEditor from "./ai-provider-secret-editor";
import { ModelFields } from "./ai-provider-models";
import { AiProviderEditor } from "./ai-provider-editor";
import * as providerEditor from "./ai-provider-editor";
import { createModelRequestScope } from "./use-ai-provider-models";
import type { AiSecretSettings } from "./ai-provider-secret-state";
import type { AiProviderRecord, PageData } from "./ai-config-types";

const rawOpenRouterProvider: AiProviderRecord = {
  id: "11111111-1111-4111-8111-111111111111",
  code: "openrouter",
  name: "OpenRouter",
  provider_type: "openrouter",
  endpoint_url: "https://openrouter.ai/api/v1/chat/completions",
  api_key_setting_key: "sk-or-v1-secret",
  status: "active",
  sort_order: 0,
  version: 1,
  created_at: "2026-09-01T00:00:00.000Z",
  updated_at: "2026-09-01T00:00:00.000Z",
};

describe("ProviderFormCard", () => {
  test("provider table exposes deletion only when a manage callback is available", () => {
    const props = {
      page: { list: [rawOpenRouterProvider], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } },
      pending: false, onEdit: () => undefined, onPageChange: () => undefined,
    };
    expect(renderToStaticMarkup(createElement(ProviderTable, { ...props, onDelete: () => undefined }))).toContain("删除");
    expect(renderToStaticMarkup(createElement(ProviderTable, props))).not.toContain("删除");
  });

  test("does not ask operators to type a provider code when creating a provider", () => {
    const html = renderToStaticMarkup(createElement(ProviderFormCard, {
      form: emptyProviderForm(),
      isPending: false,
      onChange: () => undefined,
      onSubmit: async () => undefined,
      onReset: () => undefined,
    }));

    expect(html).toContain("新增供应商");
    expect(html).toContain("系统会自动生成供应商编码");
    expect(html).not.toContain("ai-provider-code");
  });

  test("does not submit provider code from the admin panel", () => {
    const source = readFileSync(new URL("./ai-provider-editor.tsx", import.meta.url), "utf8");

    expect(source).toContain("async function submitProvider()");
    expect(source).not.toContain("code: providerForm.code");
  });

  test("normalizes the provider form when operators choose OpenRouter", () => {
    const source = readFileSync(new URL("./ai-model-routing-sections.tsx", import.meta.url), "utf8");

    expect(source).toContain("normalizeProviderFormForType(");
  });

  test("uses the system OpenRouter key setting instead of asking for the raw key", () => {
    const normalized = normalizeProviderFormForType({
      ...emptyProviderForm(),
      api_key_setting_key: "sk-or-v1-secret",
    }, "openrouter");
    const html = renderToStaticMarkup(createElement(ProviderFormCard, {
      form: normalized,
      isPending: false,
      onChange: () => undefined,
      onSubmit: async () => undefined,
      onReset: () => undefined,
    }));

    expect(normalized.provider_type).toBe("openrouter");
    expect(normalized.api_key_setting_key).toBe(OPENROUTER_API_KEY_SETTING_KEY);
    expect(html).not.toContain(OPENROUTER_API_KEY_SETTING_KEY);
    expect(html).not.toContain("保存供应商后可配置真实密钥");
    expect(html).not.toContain("sk-or-v1-secret");
  });

  test("does not expose historical raw keys when editing or listing providers", () => {
    const form = providerFormFromRecord(rawOpenRouterProvider);
    const providerPage: PageData<AiProviderRecord> = {
      list: [rawOpenRouterProvider],
      pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
    };
    const html = renderToStaticMarkup(createElement(ProviderTable, {
      page: providerPage,
      pending: false,
      onEdit: () => undefined,
      onPageChange: () => undefined,
    }));

    expect(form.api_key_setting_key).toBe("");
    expect(providerReferencePatch(form)).toEqual({});
    expect(html).toContain("已隐藏真实密钥");
    expect(html).not.toContain("sk-or-v1-secret");
  });

  test("unknown legacy references never render and unchanged reference is omitted", () => {
    const form = providerFormFromRecord({ ...rawOpenRouterProvider, provider_type: "openai_compatible", api_key_setting_key: "unregistered-sensitive-value" });
    expect(form.api_key_setting_key).toBe("");
    expect(providerKeyDisplay("unregistered-sensitive-value")).not.toContain("unregistered-sensitive-value");
    expect(providerReferencePatch(form)).toEqual({});
    expect(providerReferencePatch({ ...form, api_key_setting_key: "ARK_API_KEY" })).toEqual({ api_key_setting_key: "ARK_API_KEY" });
  });

  test("historical OpenRouter cannot edit another providers shared key without repair", () => {
    const form = providerFormFromRecord({ ...rawOpenRouterProvider, api_key_setting_key: "ARK_API_KEY" });
    expect(form.api_key_setting_key).toBe("");
    expect(form.api_key_setting_invalid).toBe(true);
    expect(providerReferencePatch(form)).toEqual({});
  });

  test("unchanged type is omitted so unrelated legacy edits do not trigger reference validation", () => {
    const form = providerFormFromRecord(rawOpenRouterProvider);
    expect(providerReferencePatch(form)).toEqual({});
    expect(providerReferencePatch({ ...form, provider_type: "openai_compatible", api_key_setting_key: "ARK_API_KEY" })).toEqual({
      provider_type: "openai_compatible", api_key_setting_key: "ARK_API_KEY",
    });
  });
});

describe("model payload contract", () => {
  test("create and update never send system code or UI id", () => {
    expect(shared).toHaveProperty("modelPayload");
    const form = { ...emptyModelForm(rawOpenRouterProvider.id), name: "设计模型", model_name: "model-v1", code: "system_code" };
    const create = shared.modelPayload(form);
    expect(create).not.toHaveProperty("code");
    expect(create).not.toHaveProperty("id");
    expect(create).not.toHaveProperty("expected_version");
    expect(shared.modelPayload({ ...form, id: "model-id", version: 4 })).toEqual({ ...create, expected_version: 4 });
  });
  test("requires legal input modalities", () => {
    expect(shared).toHaveProperty("modelPayload");
    const form = { ...emptyModelForm(rawOpenRouterProvider.id), name: "模型", model_name: "v1" };
    expect(() => shared.modelPayload({ ...form, input_modalities: [] })).toThrow();
    expect(shared.modelPayload({ ...form, input_modalities: ["text", "image"] }).input_modalities).toEqual(["text", "image"]);
  });
});

describe("supplier and model component contracts", () => {
  test("late validation is discarded after editing even when the draft returns to the same version", async () => {
    const scope = createModelRequestScope();
    let state = providerEditor.initialProviderEditorState(rawOpenRouterProvider);
    let finish: (() => void) | undefined;
    const response = new Promise<void>((resolve) => { finish = resolve; });
    const request = scope.run(() => response, () => {
      state = providerEditor.providerEditorReducer(state, { type: "validation", validation: "verified", providerId: rawOpenRouterProvider.id, version: 1 });
    }, () => undefined);
    scope.invalidate();
    const baseline = state.baseline;
    state = providerEditor.providerEditorReducer(state, { type: "change", form: { ...state.form, name: "草稿" } });
    state = providerEditor.providerEditorReducer(state, { type: "change", form: baseline });
    finish?.(); await request;
    expect(providerEditor.canValidateProvider(state)).toBe(true);
    expect(providerEditor.providerValidationVisible(state)).toBe(false);
    expect(state.validatedVersion).toBeNull();
  });
  test("returning a stale draft to its old baseline never permits validation", () => {
    expect(providerEditor).toHaveProperty("canValidateProvider");
    const initial = providerEditor.initialProviderEditorState(rawOpenRouterProvider);
    const draft = providerEditor.providerEditorReducer(initial, { type: "change", form: { ...initial.form, name: "草稿" } });
    const refreshed = providerEditor.providerEditorReducer(draft, { type: "refresh", provider: { ...rawOpenRouterProvider, version: 2 } });
    const reverted = providerEditor.providerEditorReducer(refreshed, { type: "change", form: initial.baseline });
    expect(reverted.serverUpdated).toBe(true);
    expect(providerEditor.canValidateProvider(reverted)).toBe(false);
    const late = providerEditor.providerEditorReducer(reverted, { type: "validation", validation: "verified", providerId: rawOpenRouterProvider.id, version: 1 });
    expect(late.validation).not.toBe("verified");
    const latest = providerEditor.providerEditorReducer(reverted, { type: "load-latest" });
    expect(providerEditor.canValidateProvider(latest)).toBe(true);
    expect(providerEditor.providerEditorReducer(latest, { type: "validation", validation: "verified", providerId: rawOpenRouterProvider.id, version: 1 }).validation).not.toBe("verified");
    const verified = providerEditor.providerEditorReducer(latest, { type: "validation", validation: "verified", providerId: rawOpenRouterProvider.id, version: 2 });
    expect(verified.validatedVersion).toBe(2);
    expect(providerEditor.providerValidationVisible(verified)).toBe(true);
    expect(providerEditor.providerValidationVisible({ ...verified, form: initial.form })).toBe(false);
    expect(providerEditor.providerEditorReducer(latest, { type: "validation", validation: "unsupported", providerId: "another-supplier", version: 2 }).validation).toBe("idle");
    const conflicted = providerEditor.providerEditorReducer(verified, { type: "stale" });
    expect(providerEditor.canValidateProvider(conflicted)).toBe(false);
    expect(conflicted.requiresReload).toBe(true);
    expect(providerEditor.providerEditorReducer(conflicted, { type: "load-latest" })).toBe(conflicted);
    expect(providerEditor.providerValidationVisible(conflicted)).toBe(false);
  });
  test("focus recovery chooses connected enabled targets and falls back from removed dialog triggers", () => {
    expect(shared).toHaveProperty("resolveAiFocusTarget");
    const trigger = { isConnected: true, disabled: false, focus: () => undefined };
    const fallback = { isConnected: true, focus: () => undefined };
    expect(shared.resolveAiFocusTarget(trigger, fallback)).toBe(trigger);
    expect(shared.resolveAiFocusTarget({ ...trigger, isConnected: false }, fallback)).toBe(fallback);
    expect(shared.resolveAiFocusTarget({ ...trigger, disabled: true }, fallback)).toBe(fallback);
    expect(shared.resolveAiFocusTarget(null, fallback)).toBe(fallback);
    expect(shared.resolveAiFocusTarget(null, { ...fallback, isConnected: false })).toBeNull();
  });
  test("known configuration errors have safe actionable copy while unknown payloads remain private", () => {
    expect(shared).toHaveProperty("aiConfigErrorFeedback");
    for (const [code, copy] of [
      ["AI_MODEL_ALREADY_REGISTERED", "已登记"], ["AI_MODEL_MODALITY_IN_USE", "场景路由"],
      ["AI_CONFIG_VERSION_STALE", "加载最新配置"], ["AI_OPENROUTER_CATALOG_FAILED", "检查密钥"],
      ["AI_OPENROUTER_CATALOG_INVALID", "目录格式"], ["AI_PROVIDER_ENDPOINT_INVALID", "HTTPS"],
      ["AI_OPENROUTER_API_KEY_MISSING", "配置密钥"],
    ]) {
      const feedback = shared.aiConfigErrorFeedback({ code, message: "sk-secret", details: { token: "raw-key" }, body: "raw-body" }, "结果未确认");
      expect(feedback.message).toContain(copy);
      expect(JSON.stringify(feedback)).not.toMatch(/sk-secret|raw-key|raw-body/);
    }
    expect(shared.aiConfigErrorFeedback({ code: "AI_CONFIG_VERSION_STALE" }, "结果未确认").stale).toBe(true);
    expect(shared.aiConfigErrorFeedback({ code: "UNKNOWN", message: "sk-secret", body: "raw-body" }, "结果未确认")).toEqual({ message: "结果未确认", stale: false });
  });
  test("secret metadata success followed by 403 revokes management and discards stale settings", () => {
    expect(secretEditor).toHaveProperty("secretSettingsReducer");
    const form = { ...emptyProviderForm(), api_key_setting_key: "ARK_API_KEY" };
    const settings: AiSecretSettings = { can_manage: true, list: [{ key: "ARK_API_KEY", name: "火山方舟", source: "database", status: "configured" }] };
    const initial = { settings: null, loading: true, error: "" };
    const loaded = secretEditor.secretSettingsReducer(initial, { type: "loaded", settings });
    expect(secretEditor.secretEditorAccess(form, loaded.settings, loaded.loading).canEdit).toBe(true);
    const loading = secretEditor.secretSettingsReducer(loaded, { type: "loading" });
    expect(secretEditor.secretEditorAccess(form, loading.settings, loading.loading).canEdit).toBe(false);
    const forbidden = secretEditor.secretSettingsReducer(loading, { type: "failed", error: { status: 403 } });
    expect(secretEditor.secretEditorAccess(form, forbidden.settings, forbidden.loading).canEdit).toBe(false);
    expect(forbidden.settings).toBeNull();
    expect(forbidden.error).toBe("没有密钥管理权限");
    const failed = secretEditor.secretSettingsReducer(loaded, { type: "failed", error: { status: 500 } });
    expect(failed.settings).toBeNull();
    expect(secretEditor.secretEditorAccess(form, failed.settings, failed.loading).canEdit).toBe(false);
    const denied = secretEditor.secretSettingsReducer(loaded, { type: "loaded", settings: { ...settings, can_manage: false } });
    expect(denied.settings?.can_manage).not.toBe(true);
    expect(denied.error).toBe("没有密钥管理权限");
  });
  test("clean supplier refresh replaces baseline and invalidates old validation", () => {
    expect(providerEditor).toHaveProperty("providerEditorReducer");
    const initial = { ...providerEditor.initialProviderEditorState(rawOpenRouterProvider), validation: "verified" as const };
    const record = { ...rawOpenRouterProvider, version: 2, name: "服务器新名称" };
    const refreshed = providerEditor.providerEditorReducer(initial, { type: "refresh", provider: record });
    expect(refreshed.form.name).toBe("服务器新名称");
    expect(refreshed.baseline.version).toBe(2);
    expect(refreshed.validation).toBe("idle");
    expect(refreshed.serverUpdated).toBe(false);
  });
  test("dirty supplier refresh preserves draft until latest is explicitly loaded", () => {
    expect(providerEditor).toHaveProperty("providerEditorReducer");
    const initial = providerEditor.initialProviderEditorState(rawOpenRouterProvider);
    const dirty = providerEditor.providerEditorReducer(initial, { type: "change", form: { ...initial.form, name: "本地草稿" } });
    const record = { ...rawOpenRouterProvider, version: 2, name: "服务器新名称" };
    const refreshed = providerEditor.providerEditorReducer(dirty, { type: "refresh", provider: record });
    expect(refreshed.form.name).toBe("本地草稿");
    expect(refreshed.baseline.version).toBe(1);
    expect(refreshed.serverUpdated).toBe(true);
    const loaded = providerEditor.providerEditorReducer(refreshed, { type: "load-latest" });
    expect(loaded.form.name).toBe("服务器新名称");
    expect(loaded.form.version).toBe(2);
    expect(loaded.form).toEqual(loaded.baseline);
    expect(loaded.validation).toBe("idle");
  });
  test("supplier identity switches reset drafts and successful saves establish a new baseline", () => {
    expect(providerEditor).toHaveProperty("providerEditorReducer");
    const initial = providerEditor.initialProviderEditorState(rawOpenRouterProvider);
    const dirty = providerEditor.providerEditorReducer(initial, { type: "change", form: { ...initial.form, name: "草稿" } });
    const other = { ...rawOpenRouterProvider, id: "other", name: "另一个供应商" };
    expect(providerEditor.providerEditorReducer(dirty, { type: "refresh", provider: other }).form.name).toBe(other.name);
    const saved = providerEditor.providerEditorReducer(dirty, { type: "saved", provider: { ...rawOpenRouterProvider, name: "草稿", version: 2 } });
    expect(saved.form).toEqual(saved.baseline);
    expect(saved.baseline.version).toBe(2);
    expect(saved.serverUpdated).toBe(false);
  });
  test("renders model capability fields with only existing codes read-only", () => {
    const form = { ...emptyModelForm(rawOpenRouterProvider.id), name: "设计模型", model_name: "model-v1" };
    const render = (value: typeof form) => renderToStaticMarkup(createElement(ModelFields, { form: value, disabled: false, onChange: () => undefined }));
    expect(render(form)).not.toContain('id="ai-model-system-code"');
    const editing = render({ ...form, id: "model", code: "system_model_code" });
    expect(editing).toContain('id="ai-model-system-code"');
    expect(editing).toMatch(/readonly=""/i);
    expect(editing).toContain("模型模态");
    expect(editing).toContain("输入模态");
    expect(editing.match(/role="checkbox"/g)?.length).toBe(4);
  });
  test("renders safe supplier settings with a disabled unsaved validation action", () => {
    const props = { canManage: true, onSaved: async () => undefined };
    const empty = renderToStaticMarkup(createElement(AiProviderEditor, { ...props, provider: null }));
    expect(empty).toMatch(/<button[^>]*disabled=""[^>]*>.*?验证连接<\/button>/);
    expect(empty).toContain("Endpoint Base URL");
    const existing = renderToStaticMarkup(createElement(AiProviderEditor, { ...props, provider: rawOpenRouterProvider }));
    expect(existing).not.toContain("sk-or-v1-secret");
    expect(existing).toContain("系统编码");
  });
  test("registered secret can be managed before supplier save and access has four factual states", () => {
    expect(secretEditor).toHaveProperty("secretEditorAccess");
    const form = { ...emptyProviderForm(), api_key_setting_key: "ARK_API_KEY" };
    const settings: AiSecretSettings = { can_manage: true, list: [{ key: "ARK_API_KEY", name: "火山方舟", source: "database", status: "configured" }] };
    expect(secretEditor.secretEditorAccess(form, settings, false)).toMatchObject({ canEdit: true, statusText: "已配置，模型调用未验证" });
    expect(secretEditor.secretEditorAccess(form, { ...settings, can_manage: false }, false)).toMatchObject({ canEdit: false, statusText: "没有密钥管理权限" });
    expect(secretEditor.secretEditorAccess({ ...form, api_key_setting_key: "" }, settings, false).statusText).toBe("未配置");
    expect(secretEditor.secretEditorAccess({ ...form, api_key_setting_key: "", api_key_setting_invalid: true }, settings, false).statusText).toBe("配置引用异常");
  });
  test("loaded supplier identities survive bounded page refreshes with updated records", () => {
    expect(shared).toHaveProperty("mergeProviderRecords");
    const outsideFirstPage = { ...rawOpenRouterProvider, id: "supplier-page-six", name: "第六页供应商" };
    const updated = { ...rawOpenRouterProvider, name: "已更新名称" };
    const records = shared.mergeProviderRecords([outsideFirstPage, rawOpenRouterProvider], [updated]);
    expect(records).toEqual([outsideFirstPage, updated]);
  });
});
