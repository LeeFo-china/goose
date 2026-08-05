import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

describe("usage legacy platform permission boundary", () => {
  test("platform usage legacy services use concrete usage permission", () => {
    const shared = readFileSync(
      new URL("./usage/legacy/shared.ts", import.meta.url),
      "utf8",
    );
    const platform = readFileSync(
      new URL("./usage/legacy/platform.ts", import.meta.url),
      "utf8",
    );
    const logs = readFileSync(
      new URL("./usage/legacy/logs.ts", import.meta.url),
      "utf8",
    );

    const source = `${shared}\n${platform}\n${logs}`;
    expect(source).toContain("platform.usage.read");
    expect(source).not.toContain("assertPlatformAdmin");
    expect(source).not.toContain("!authContext.isPlatformAdmin");
  });
});
