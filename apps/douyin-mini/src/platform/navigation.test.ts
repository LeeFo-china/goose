import { describe, expect, test } from "bun:test";
import { buildImageGallery } from "../components/image-gallery/view-model";
import { buildTrustMetrics } from "../components/trust-metrics/view-model";
import {
  buildEntityDetailRoute,
  buildPageRoute,
  buildTabRoute,
} from "./navigation";

const ENTITY_ID = "11111111-1111-4111-8111-111111111111";

describe("Douyin native navigation and visual view models", () => {
  test("builds allowlisted tab and page routes and rejects unknown paths", () => {
    expect(buildTabRoute("home")).toBe("/pages/home/index");
    expect(buildTabRoute("cases")).toBe("/pages/cases/index");
    expect(buildPageRoute("pages/company/index")).toBe("/pages/company/index");
    expect(() => buildPageRoute("pages/admin/index"))
      .toThrow("INVALID_NAVIGATION_TARGET");
    expect(() => buildTabRoute("admin" as never))
      .toThrow("INVALID_NAVIGATION_TARGET");
  });

  test("detail routes contain only one encoded entity id query", () => {
    for (const type of ["case", "site"] as const) {
      const route = buildEntityDetailRoute(type, ENTITY_ID);
      const [path, query = ""] = route.split("?");
      expect(path).toBe(type === "case"
        ? "/pages/case-detail/index"
        : "/pages/site-detail/index");
      expect(Array.from(new URLSearchParams(query).entries())).toEqual([["id", ENTITY_ID]]);
      expect(route).not.toMatch(/tenant|deployment|customer/i);
    }
    expect(() => buildEntityDetailRoute("case", `${ENTITY_ID}&tenant_id=forged`))
      .toThrow("INVALID_NAVIGATION_TARGET");
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
      url: "https://cdn.example.com/0.jpg", previewIndex: 0,
    });
    expect(images.every((image) => image.url.startsWith("https://"))).toBe(true);
  });

  test("trust metrics trim invalid entries and cap the row at four", () => {
    expect(buildTrustMetrics([
      { label: " 服务家庭 ", value: " 1200+ " },
      { label: "从业年限", value: "12年" },
      { label: "设计师", value: "36人" },
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
});
