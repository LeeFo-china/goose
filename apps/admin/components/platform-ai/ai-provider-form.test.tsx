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
} from "./ai-model-routing-shared";
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
    const source = readFileSync(new URL("./ai-model-routing-panel.tsx", import.meta.url), "utf8");

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
    expect(html).toContain(OPENROUTER_API_KEY_SETTING_KEY);
    expect(html).toContain("真实密钥请在系统配置中维护");
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

    expect(form.api_key_setting_key).toBe(OPENROUTER_API_KEY_SETTING_KEY);
    expect(html).toContain("已隐藏真实密钥");
    expect(html).not.toContain("sk-or-v1-secret");
  });
});
