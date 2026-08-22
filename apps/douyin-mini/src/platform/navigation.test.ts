import { describe, expect, test } from "bun:test";
import {
  buildImageGallery,
  removeFailedImage,
} from "../components/image-gallery/view-model";
import { resolveThemeColor } from "../components/theme";
import { buildTrustMetrics } from "../components/trust-metrics/view-model";
import {
  buildEntityDetailRoute,
  buildPageRoute,
  buildTabRoute,
  navigateToPage,
} from "./navigation";

const ENTITY_ID = "11111111-1111-4111-8111-111111111111";

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
