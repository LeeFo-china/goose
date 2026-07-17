import { existsSync, readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

function readSource(path: string) {
  const url = new URL(path, import.meta.url);
  expect(existsSync(url), path).toBe(true);
  return existsSync(url) ? readFileSync(url, "utf8") : "";
}

describe("SearchableLocationSelect", () => {
  test("keeps dropdown scrolling from leaking into interactive maps below", () => {
    const source = readSource("./searchable-location-select.tsx");

    expect(source).toContain("stopOverlayScrollPropagation");
    expect(source).toContain("onWheelCapture={stopOverlayScrollPropagation}");
    expect(source).toContain("onTouchMoveCapture={stopOverlayScrollPropagation}");
    expect(source).toContain("overscroll-contain");
  });
});
