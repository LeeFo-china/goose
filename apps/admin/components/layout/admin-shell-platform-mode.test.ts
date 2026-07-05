import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

function readSource(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

describe("AdminShell platform mode", () => {
  test("does not render tenant notification menu for platform-only sessions", () => {
    const source = readSource("./admin-shell.tsx");

    expect(source).toContain("isPlatformMode");
    expect(source).toContain("!isPlatformMode ? <NotificationMenu /> : null");
  });
});
