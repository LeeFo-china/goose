import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

describe("platform marketing pages permission boundary", () => {
  test("platform marketing page controller uses concrete site content permissions", () => {
    const source = readFileSync(
      new URL("../controllers/marketing-pages/platform-controller.ts", import.meta.url),
      "utf8",
    );

    expect(source).toContain("platform.site_content.read");
    expect(source).toContain("platform.site_content.manage");
    expect(source).toContain("platform.site_content.publish");
  });

  test("platform marketing page services check concrete site content permissions", () => {
    const adminList = readFileSync(
      new URL("./marketing-pages/legacy/admin-list.ts", import.meta.url),
      "utf8",
    );
    const pages = readFileSync(
      new URL("./marketing-pages/legacy/pages.ts", import.meta.url),
      "utf8",
    );
    const drafts = readFileSync(
      new URL("./marketing-pages/legacy/drafts.ts", import.meta.url),
      "utf8",
    );

    expect(adminList).toContain("platform.site_content.read");
    expect(adminList).toContain("platform.site_content.manage");
    expect(pages).toContain("platform.site_content.read");
    expect(pages).toContain("platform.site_content.manage");
    expect(drafts).toContain("platform.site_content.read");
    expect(drafts).toContain("platform.site_content.manage");
    expect(drafts).toContain("platform.site_content.publish");
    expect(adminList).not.toContain("assertPlatformAdmin");
    expect(pages).not.toContain("assertPlatformAdmin");
    expect(drafts).not.toContain("assertPlatformAdmin");
  });
});
