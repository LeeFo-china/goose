import { existsSync, readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

function readSource(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

describe("Finance wechat pay applyment sign prompt contract", () => {
  test("surfaces the WeChat sign link as a tenant-side primary action", () => {
    const panelSource = readSource("./finance-wechat-pay-applyment-panel.tsx");
    const promptUrl = new URL(
      "./finance-wechat-pay-applyment-sign-prompt.tsx",
      import.meta.url,
    );

    expect(existsSync(promptUrl)).toBe(true);
    const promptSource = readFileSync(promptUrl, "utf8");

    expect(panelSource).toContain("FinanceWechatPayApplymentSignPrompt");
    expect(panelSource).toContain("availableActions");
    expect(promptSource).toContain("open_sign_url");
    expect(promptSource).toContain("待超级管理员签约");
    expect(promptSource).toContain("打开签约链接");
    expect(promptSource).toContain("复制签约链接");
  });
});
