import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

describe("picture library health permission boundary", () => {
  test("uses concrete picture permissions instead of platform admin guard", () => {
    const source = readFileSync(
      new URL("./picture-library-health.ts", import.meta.url),
      "utf8",
    );

    expect(source).toContain("platform.picture.read");
    expect(source).toContain("platform.picture.manage");
    expect(source).not.toContain("assertPlatformAdmin");
    expect(source).not.toContain("!input.authContext.isPlatformAdmin");
    expect(source).not.toContain("!authContext.isPlatformAdmin");
  });
});
