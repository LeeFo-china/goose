import { describe, expect, test } from "bun:test";
import {
  buildImageGallery,
  removeFailedImage,
} from "../components/image-gallery/view-model";
import { resolveThemeColor } from "../components/theme";
import { buildTrustMetrics } from "../components/trust-metrics/view-model";
import {
  buildEntityDetailRoute,
  buildMaterialDetailRoute,
  buildOwnedMaterialDetailRoute,
  buildPageRoute,
  buildTabRoute,
  navigateToMaterialDetail,
  navigateToOwnedMaterialDetail,
  navigateToPage,
} from "./navigation";

const ENTITY_ID = "11111111-1111-4111-8111-111111111111";
const UPPER_MATERIAL_ID = "A1111111-B111-4111-8111-11111111111A";

describe("Douyin native navigation and visual view models", () => {
  test("builds allowlisted tab and page routes and rejects unknown paths", () => {
    expect(buildTabRoute("home")).toBe("/pages/home/index");
    expect(buildTabRoute("cases")).toBe("/pages/cases/index");
    expect(buildTabRoute("budget")).toBe("/pages/budget/index");
    expect(buildPageRoute("pages/company/index")).toBe("/pages/company/index");
    expect(buildPageRoute("pages/sites/index")).toBe("/pages/sites/index");
    expect(() => buildPageRoute("pages/home/index"))
      .toThrow("INVALID_NAVIGATION_TARGET");
    expect(() => navigateToPage("pages/cases/index"))
      .toThrow("INVALID_NAVIGATION_TARGET");
    expect(() => buildPageRoute("pages/admin/index"))
      .toThrow("INVALID_NAVIGATION_TARGET");
    expect(() => buildTabRoute("admin" as never))
      .toThrow("INVALID_NAVIGATION_TARGET");
  });

  test("detail routes contain only one encoded entity id query", () => {
    for (const type of ["case", "site"] as const) {
      const route = buildEntityDetailRoute(type, ENTITY_ID);
      const [path, query = ""] = route.split("?");
      expect(path).toBe("/pages/case-detail/index");
      expect(Array.from(new URLSearchParams(query).entries())).toEqual([["id", ENTITY_ID]]);
      expect(route).not.toMatch(/tenant|deployment|customer/i);
    }
    expect(() => buildEntityDetailRoute("case", `${ENTITY_ID}&tenant_id=forged`))
      .toThrow("INVALID_NAVIGATION_TARGET");
  });

  test("builds the three non-tab material routes with a validated UUID", async () => {
    expect(buildPageRoute("pages/materials/index")).toBe("/pages/materials/index");
    expect(buildPageRoute("pages/my-materials/index")).toBe("/pages/my-materials/index");
    expect(buildMaterialDetailRoute(ENTITY_ID)).toBe(
      `/pages/material-detail/index?id=${ENTITY_ID}`,
    );
    expect(buildOwnedMaterialDetailRoute(ENTITY_ID)).toBe(
      `/pages/material-detail/index?claimId=${ENTITY_ID}`,
    );
    expect(() => buildMaterialDetailRoute(`${ENTITY_ID}&subject_hash=forged`))
      .toThrow("INVALID_NAVIGATION_TARGET");
    expect(() => buildOwnedMaterialDetailRoute("bad-id"))
      .toThrow("INVALID_NAVIGATION_TARGET");

    const urls: string[] = [];
    const originalPlatform = Reflect.get(globalThis, "tt");
    const platform = originalPlatform ?? {};
    Reflect.set(globalThis, "tt", {
      ...platform,
      navigateTo: ({ url, success }: { url: string; success?: () => void }) => {
        urls.push(url);
        success?.();
      },
    });
    try {
      await navigateToMaterialDetail(ENTITY_ID);
      await navigateToOwnedMaterialDetail(ENTITY_ID);
      expect(urls).toEqual([
        `/pages/material-detail/index?id=${ENTITY_ID}`,
        `/pages/material-detail/index?claimId=${ENTITY_ID}`,
      ]);
    } finally {
      if (originalPlatform === undefined) Reflect.deleteProperty(globalThis, "tt");
      else Reflect.set(globalThis, "tt", originalPlatform);
    }
  });

  test("normalizes material and claim UUIDs in navigation routes", () => {
    const normalized = UPPER_MATERIAL_ID.toLowerCase();
    expect(buildMaterialDetailRoute(UPPER_MATERIAL_ID)).toBe(
      `/pages/material-detail/index?id=${normalized}`,
    );
    expect(buildOwnedMaterialDetailRoute(UPPER_MATERIAL_ID)).toBe(
      `/pages/material-detail/index?claimId=${normalized}`,
    );
  });

  test("registers material pages without changing the existing four tab items", async () => {
    const appConfig = await Bun.file(`${__dirname}/../app.json`).json() as {
      pages: string[];
      tabBar: { list: Array<{
        pagePath: string;
        text: string;
        iconPath: string;
        selectedIconPath: string;
      }> };
    };
    expect(appConfig.pages).toEqual(expect.arrayContaining([
      "pages/materials/index",
      "pages/material-detail/index",
      "pages/my-materials/index",
    ]));
    expect(appConfig.tabBar.list).toEqual([
      { pagePath: "pages/home/index", text: "首页", iconPath: "assets/tabbar/home.png", selectedIconPath: "assets/tabbar/home-active.png" },
      { pagePath: "pages/cases/index", text: "项目实景", iconPath: "assets/tabbar/cases.png", selectedIconPath: "assets/tabbar/cases-active.png" },
      { pagePath: "pages/budget/index", text: "预算初算", iconPath: "assets/tabbar/budget.png", selectedIconPath: "assets/tabbar/budget-active.png" },
      { pagePath: "pages/lead/index", text: "免费量房", iconPath: "assets/tabbar/lead.png", selectedIconPath: "assets/tabbar/lead-active.png" },
    ]);
  });

  test("material card exposes preview fields and never binds content or identity fields", async () => {
    const [template, source] = await Promise.all([
      Bun.file(`${__dirname}/../components/material-card/index.ttml`).text(),
      Bun.file(`${__dirname}/../components/material-card/index.ts`).text(),
    ]);
    for (const field of ["title", "category", "summary", "applicable_to", "claimed"]) {
      expect(template).toContain(`item.${field}`);
    }
    expect(`${template}\n${source}`).not.toMatch(
      /content_blocks|tenant_id|installation_id|app_id|subject_hash/,
    );
  });

  test("labels the existing case tab as the unified project showcase", async () => {
    const appConfig = await Bun.file(`${__dirname}/../app.json`).text();
    expect(appConfig).toContain('"pagePath": "pages/cases/index"');
    expect(appConfig).toContain('"text": "项目实景"');
  });

  test("image gallery keeps at most nine unique HTTPS images", () => {
    const images = buildImageGallery([
      "http://unsafe.example.com/cover.jpg",
      "data:image/png;base64,unsafe",
      "https://cdn.example.com/0.jpg",
      "https://cdn.example.com/0.jpg",
      ...Array.from({ length: 12 }, (_, index) => `https://cdn.example.com/${index + 1}.jpg`),
      null,
    ]);

    expect(images).toHaveLength(9);
    expect(images[0]).toEqual({
      url: "https://cdn.example.com/0.jpg", previewIndex: 0, className: "gallery-item--third",
    });
    expect(images.every((image) => image.url.startsWith("https://"))).toBe(true);
    expect(removeFailedImage(images, "https://cdn.example.com/0.jpg"))
      .not.toContainEqual(expect.objectContaining({ url: "https://cdn.example.com/0.jpg" }));
    expect(removeFailedImage([images[0]!], images[0]!.url)).toEqual([]);
  });

  test("image gallery assigns count-aware layouts for project detail photos", () => {
    const urls = Array.from(
      { length: 9 },
      (_, index) => `https://cdn.example.com/gallery-${index + 1}.jpg`,
    );
    expect(buildImageGallery(urls.slice(0, 1)).map((item) => item.className))
      .toEqual(["gallery-item--hero"]);
    expect(buildImageGallery(urls.slice(0, 2)).map((item) => item.className))
      .toEqual(["gallery-item--half", "gallery-item--half"]);
    expect(buildImageGallery(urls.slice(0, 3)).map((item) => item.className))
      .toEqual(["gallery-item--hero", "gallery-item--half", "gallery-item--half"]);
    expect(buildImageGallery(urls.slice(0, 4)).every((item) =>
      item.className === "gallery-item--half")).toBe(true);
    expect(buildImageGallery(urls).every((item) =>
      item.className === "gallery-item--third")).toBe(true);
  });

  test("trust metrics trim invalid entries and cap the row at four", () => {
    expect(buildTrustMetrics([
      { label: " 服务家庭 ", value: " 1200+ " },
      { label: "从业年限", value: "12年" },
      { label: "设计师", value: "36人" },
      { label: "设计师", value: "不应重复" },
      { label: "在建工地", value: "28个" },
      { label: "第五项", value: "不应显示" },
      { label: "", value: "invalid" },
      { label: "invalid", value: null },
    ])).toEqual([
      { label: "服务家庭", value: "1200+" },
      { label: "从业年限", value: "12年" },
      { label: "设计师", value: "36人" },
      { label: "在建工地", value: "28个" },
    ]);
  });

  test("tenant colors always resolve to a readable black or white foreground", () => {
    for (const color of ["#C45A32", "#FFFFFF", "#FFFF00", "#111111"]) {
      const theme = resolveThemeColor(color);
      expect(theme.primaryColor).toBe(color);
      expect(theme.contrastRatio).toBeGreaterThanOrEqual(4.5);
    }
    expect(resolveThemeColor("red; display:none")).toMatchObject({
      primaryColor: "#191817",
      primaryTextColor: "#FFFFFF",
    });
  });
});
