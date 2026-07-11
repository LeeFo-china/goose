import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

import { MARKETING_CTA } from "../components/official-site/marketing-cta";

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

  test("keeps marketing sections on the shared CTA contract", () => {
    const sectionSources = pages.map(({ section }) => read(section));
    const ctaKeys = new Set<string>();

    for (const source of sectionSources) {
      expect(source).toContain("MARKETING_CTA");
      expect(source).not.toMatch(/href="\/(?:products|solutions|cases|partners|about)(?:#apply)?"/);
      const links = [...source.matchAll(/<Link\b[\s\S]*?<\/Link>/g)].map(([link]) => link);
      for (const link of links) {
        const href = link.match(/href=\{MARKETING_CTA\.(\w+)\.href\}/);
        expect(href).not.toBeNull();
        const key = href?.[1] ?? "";
        expect(link).toContain(`{MARKETING_CTA.${key}.label}`);
        ctaKeys.add(key);
      }
    }
    expect([...ctaKeys].sort()).toEqual(Object.keys(MARKETING_CTA).sort());
    expect(Object.values(MARKETING_CTA).map(({ href }) => href)).toEqual([
      "/products",
      "/solutions",
      "/cases",
      "/partners",
      "/about",
      "/partners#apply",
    ]);
  });

  test("uses one stable CTA label for every marketing target", () => {
    expect(MARKETING_CTA).toEqual({
      products: { href: "/products", label: "查看产品能力" },
      solutions: { href: "/solutions", label: "查看解决方案" },
      cases: { href: "/cases", label: "查看项目案例" },
      partners: { href: "/partners", label: "了解城市合伙人" },
      about: { href: "/about", label: "了解产品边界" },
      contact: { href: "/partners#apply", label: "提交合作咨询" },
    });
  });

  test("makes the existing partner application the sole official contact entry", () => {
    const source = read("components/official-site/about-sections.tsx");

    expect(source).toContain("目前官网唯一官方业务联系入口");
    expect(source).toContain("产品合作、装企接入、城市合作及其他业务咨询");
    expect(source).toContain("MARKETING_CTA.contact.href");
    expect(source).toContain("MARKETING_CTA.contact.label");
    expect(source).not.toMatch(/\b1[3-9]\d{9}\b/);
    expect(source).not.toMatch(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/);
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
