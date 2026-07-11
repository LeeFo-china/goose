import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const webRoot = join(import.meta.dir, "../..");

const readSource = (path: string): string => {
  const absolutePath = join(webRoot, path);
  return existsSync(absolutePath) ? readFileSync(absolutePath, "utf8") : "";
};

describe("public CMS page contract", () => {
  test("exposes paginated article and case lists plus typed details", () => {
    const articles = readSource("app/(content)/articles/page.tsx");
    const articleDetail = readSource("app/(content)/articles/[slug]/page.tsx");
    const cases = readSource("app/(content)/cases/page.tsx");
    const caseDetail = readSource("app/(content)/cases/[slug]/page.tsx");
    const cityDetail = readSource("app/(content)/cities/[slug]/page.tsx");

    expect(articles).toContain("searchParams: Promise");
    expect(articles).toContain('getPublicSiteContentList("article"');
    expect(cases).toContain("searchParams: Promise");
    expect(cases).toContain('getPublicSiteContentList("case"');

    for (const source of [articleDetail, caseDetail, cityDetail]) {
      expect(source).toContain("generateMetadata");
      expect(source).toContain("getSiteContentDetailForPage");
    }
  });

  test("keeps preview reads private and uncached", () => {
    const pageData = readSource("lib/site-content-page.ts");

    expect(pageData).toContain("getPreviewSiteContentForServerPath");
    expect(pageData).toContain("noStore()");
    expect(pageData).toContain("SiteContentApiError");
    expect(pageData).toContain("notFound()");
  });

  test("emits safe typed JSON-LD for every detail type", () => {
    const structuredData = readSource(
      "components/content/content-structured-data.tsx",
    );

    expect(structuredData).toContain('"Article"');
    expect(structuredData).toContain('"CreativeWork"');
    expect(structuredData).toContain('"BreadcrumbList"');
    expect(structuredData).toContain('"Service"');
    expect(structuredData).toContain('replace(/</g, "\\\\u003c")');
    expect(structuredData).not.toContain("blocks:");
  });

});
