import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

describe("GB28181 onboarding layout contract", () => {
  test("keeps long access values inside a wider responsive dialog", () => {
    const dialog = readFileSync(
      new URL("./gb28181-onboarding-dialog.tsx", import.meta.url),
      "utf8",
    );
    const access = readFileSync(
      new URL("./gb28181-onboarding-access.tsx", import.meta.url),
      "utf8",
    );

    expect(dialog).toContain("w-[calc(100vw-2rem)]");
    expect(dialog).toContain("max-w-[760px]");
    expect(dialog).toContain("overflow-x-hidden");
    expect(access).toContain("grid-cols-[minmax(0,1fr)_auto]");
    expect(access).toContain("overflow-hidden");
    expect(access).toContain("break-all");
  });
});
