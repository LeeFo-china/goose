import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

describe("system settings permission boundary", () => {
  test("platform system settings endpoints use concrete settings permissions", () => {
    const source = readFileSync(
      new URL("./system-settings/index.ts", import.meta.url),
      "utf8",
    );

    expect(source).toContain("system.settings.read");
    expect(source).toContain("system.settings.update");
    expect(source).toContain("system.settings.test");
    expect(source).not.toContain("!authContext.isPlatformAdmin");
  });
});
