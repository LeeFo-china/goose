import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("./platform-douyin-miniapp-releases.ts", import.meta.url),
  "utf8",
);

describe("platform Douyin release service lazy defaults", () => {
  test("uses a dynamic single-flight async default dependency import", () => {
    expect(source).not.toMatch(/^import .*default-service/m);
    expect(source).toContain('import("./platform-douyin-miniapp-releases/default-service")');
    expect(source).toContain("defaultServicePromise");
    expect(source).toMatch(/defaultServicePromise \?\?=/);
  });
});
