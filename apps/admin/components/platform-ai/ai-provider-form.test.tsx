import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "bun:test";
import { ProviderFormCard } from "./ai-model-routing-sections";
import { emptyProviderForm } from "./ai-model-routing-shared";

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
});
