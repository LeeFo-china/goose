import { expect, test } from "bun:test";
import { parseSecretSettings, replaceAiSecret } from "./ai-provider-secret-state";

test("metadata parsing strips no fields silently and rejects secret-bearing responses", () => {
  const row = { key: "ARK_API_KEY", name: "火山方舟接口密钥", source: "database", status: "configured" } as const;
  expect(parseSecretSettings({ list: [row], can_manage: true }).list).toEqual([row]);
  for (const value of [null, { list: [{ ...row, value_text: "private" }], can_manage: true },
    { list: [{ ...row, key: "PAYMENT_KEY" }], can_manage: true },
    { list: [row, row], can_manage: true }]) {
    expect(() => parseSecretSettings(value)).toThrow();
  }
});

test("blank input never submits; nonempty secret has one isolated request", async () => {
  const calls: Array<{ path: string; init?: RequestInit }> = [];
  const request = async (path: string, init?: RequestInit) => { calls.push({ path, init }); return { key: "ARK_API_KEY", saved: true }; };
  expect(await replaceAiSecret("ARK_API_KEY", "  ", request)).toBe(false);
  expect(calls).toHaveLength(0);
  expect(await replaceAiSecret("ARK_API_KEY", " synthetic-test-value ", request)).toBe(true);
  expect(calls).toHaveLength(1);
  expect(calls[0]?.path).toBe("/platform/ai-config/secret-settings/ARK_API_KEY");
  expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({ value: "synthetic-test-value" });
});

test("malformed acknowledgement fails without retry or exposing upstream values", async () => {
  let calls = 0;
  const request = async () => { calls++; return { saved: false, value: "synthetic-test-value" }; };
  await expect(replaceAiSecret("ARK_API_KEY", "synthetic-test-value", request)).rejects.toThrow("保存结果未确认");
  expect(calls).toBe(1);
});
