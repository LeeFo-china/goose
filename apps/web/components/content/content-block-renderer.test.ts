import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const rendererPath = join(
  import.meta.dir,
  "content-block-renderer.tsx",
);

describe("ContentBlockRenderer contract", () => {
  test("renders only the eight approved content block types", () => {
    expect(existsSync(rendererPath)).toBe(true);

    const source = existsSync(rendererPath)
      ? readFileSync(rendererPath, "utf8")
      : "";

    expect(source).toContain('case "paragraph"');
    expect(source).toContain('case "heading"');
    expect(source).toContain('case "image"');
    expect(source).toContain('case "quote"');
    expect(source).toContain('case "list"');
    expect(source).toContain('case "callout"');
    expect(source).toContain('case "metrics"');
    expect(source).toContain('case "gallery"');
    expect(source).not.toContain("dangerouslySetInnerHTML");
  });

});
