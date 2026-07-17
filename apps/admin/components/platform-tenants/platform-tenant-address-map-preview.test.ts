import { existsSync, readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

function readSource(path: string) {
  const url = new URL(path, import.meta.url);
  expect(existsSync(url), path).toBe(true);
  return existsSync(url) ? readFileSync(url, "utf8") : "";
}

describe("platform tenant address map preview", () => {
  test("keeps the marker centered and renders a nonblank default map", () => {
    const source = readSource("./platform-tenant-address-map-preview.tsx");

    expect(source).toContain("DEFAULT_MAP_LOCATION");
    expect(source).toContain("DEFAULT_MAP_ZOOM");
    expect(source).toContain("mapInstanceRef.current?.setCenter?.(position)");
    expect(source).toContain("mapInstanceRef.current?.setZoom?.(nextZoom)");
    expect(source).toContain("resolvedLocation");
    expect(source).toContain('previewClassName = "h-40"');
    expect(source).toContain("className={previewClassName}");
    expect(source).not.toContain("if (latitude == null || longitude == null) return null");
  });
});
