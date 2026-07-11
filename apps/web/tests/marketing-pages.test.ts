import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

const root = new URL("../", import.meta.url);

const pages = [
  { page: "app/page.tsx", section: "components/official-site/home-sections.tsx" },
  {
    page: "app/(marketing)/products/page.tsx",
    section: "components/official-site/product-sections.tsx",
  },
  {
    page: "app/(marketing)/solutions/page.tsx",
    section: "components/official-site/solution-sections.tsx",
  },
  {
    page: "app/(marketing)/about/page.tsx",
    section: "components/official-site/about-sections.tsx",
  },
] as const;

function read(path: string): string {
  const file = new URL(path, root);
  return existsSync(file) ? readFileSync(file, "utf8") : "";
}

describe("official website marketing pages", () => {
  for (const { page, section } of pages) {
    test(`${page} has one H1 and real image references`, () => {
      const source = `${read(page)}\n${read(section)}`;

      expect(source.match(/<h1\b/g) ?? []).toHaveLength(1);
      expect(source).toContain("<Image");
      expect(source).toMatch(/src="\/[^"]+\.(?:png|webp|jpg)"/);
    });
  }

  test("keeps calls to action aligned with stable public routes", () => {
    const source = pages.map(({ page, section }) => `${read(page)}\n${read(section)}`).join("\n");

    for (const route of ["/products", "/solutions", "/cases", "/partners", "/about"]) {
      expect(source).toContain(`href="${route}"`);
    }
    expect(source).not.toContain('href="#contact"');
  });

  test("rejects template scaffolding and unsafe marketing markup", () => {
    const source = pages.map(({ page, section }) => `${read(page)}\n${read(section)}`).join("\n");

    expect(source).not.toContain("grid-cols-3");
    expect(source).not.toContain("Scroll to explore");
    expect(source).not.toMatch(/(?:^|[>\s])0[1-9]\s*[·/]/);
    expect(source).not.toContain("dangerouslySetInnerHTML");
    expect(source).not.toContain("—");
  });

  test("keeps core navigation available on desktop and mobile", () => {
    const navigation = `${read("components/official-site/site-header.tsx")}\n${read("components/official-site/mobile-navigation.tsx")}`;

    for (const route of ["/products", "/solutions", "/cases", "/partners", "/about"]) {
      expect(navigation).toContain(`href="${route}"`);
    }
  });
});
