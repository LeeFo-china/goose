import { expect, test } from "bun:test";
import { shouldPreserveEmptyAiSecret } from "./ai-secret-input";

test("only registered AI secrets preserve empty inputs", () => {
  for (const key of ["AI_API_KEY", "DEEPSEEK_API_KEY", "OPENROUTER_API_KEY", "ARK_API_KEY"]) {
    expect(shouldPreserveEmptyAiSecret({ key, is_secret: true }, " \n ")).toBe(true);
    expect(shouldPreserveEmptyAiSecret({ key, is_secret: true }, "replacement")).toBe(false);
  }
  expect(shouldPreserveEmptyAiSecret({ key: "SMS_SECRET", is_secret: true }, "")).toBe(false);
  expect(shouldPreserveEmptyAiSecret({ key: "AI_API_KEY", is_secret: false }, "")).toBe(false);
});
