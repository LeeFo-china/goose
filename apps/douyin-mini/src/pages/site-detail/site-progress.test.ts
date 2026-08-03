import { describe, expect, test } from "bun:test";
import type { PublicProject } from "../../models";
import { toPublicSitePresentation } from "../sites/view-model";
import { appendSiteProgress, buildSiteProgress } from "./site-progress";

const FIRST_ID = "11111111-1111-4111-8111-111111111111";
const SECOND_ID = "22222222-2222-4222-8222-222222222222";
const THIRD_ID = "33333333-3333-4333-8333-333333333333";

describe("public site progress presentation", () => {
  test("keeps logs newest-first and strips malformed or non-HTTPS images", () => {
    const progress = buildSiteProgress([
      {
        id: FIRST_ID,
        stage_code: "water-electric",
        node_name: "水电施工",
        images: [
          "http://unsafe.example.com/a.jpg",
          "https://cdn.example.com/a.jpg",
          "data:image/png;base64,unsafe",
          "https://cdn.example.com/a.jpg",
        ],
        created_at: "2026-07-18T08:00:00.000Z",
      },
      {
        id: SECOND_ID,
        stage_code: "construction",
        node_name: null,
        images: ["https://cdn.example.com/b.jpg"],
        created_at: "2026-07-20T08:00:00.000Z",
      },
    ]);

    expect(progress.map((item) => item.id)).toEqual([SECOND_ID, FIRST_ID]);
    expect(progress[0]).toMatchObject({ title: "施工中", date: "2026-07-20" });
    expect(progress[1]!.images).toEqual([{ url: "https://cdn.example.com/a.jpg", previewIndex: 0 }]);
  });

  test("appends a page stably without duplicates", () => {
    const current = buildSiteProgress([
      { id: SECOND_ID, stage_code: null, node_name: "木作阶段", images: [],
        created_at: "2026-07-20T08:00:00.000Z" },
      { id: FIRST_ID, stage_code: null, node_name: "水电阶段", images: [],
        created_at: "2026-07-18T08:00:00.000Z" },
    ]);
    const incoming = buildSiteProgress([
      { id: SECOND_ID, stage_code: null, node_name: "重复记录", images: [],
        created_at: "2026-07-20T08:00:00.000Z" },
      { id: THIRD_ID, stage_code: null, node_name: "开工交底", images: [],
        created_at: "2026-07-16T08:00:00.000Z" },
    ]);

    expect(appendSiteProgress(current, incoming).map((item) => item.id))
      .toEqual([SECOND_ID, FIRST_ID, THIRD_ID]);
  });

  test("never derives owner, customer, phone or exact-address presentation fields", () => {
    const progress = buildSiteProgress([{
      id: FIRST_ID,
      stage_code: "started",
      node_name: "开工",
      images: [],
      created_at: "2026-07-20T08:00:00.000Z",
      owner_name: "业主姓名",
      customer_phone: "13800000000",
      address: "1号楼101室",
      employee: { name: "项目经理" },
    }]);

    expect(JSON.stringify(progress)).not.toMatch(/owner|customer|phone|address|employee|13800000000|101室/i);
  });

  test("never falls back to an internal project name when community is missing", () => {
    const site = toPublicSitePresentation({
      id: FIRST_ID,
      title: "张先生 1号楼101室装修",
      cover_image_url: null,
      public_images: [],
      style_tags: [],
      layout: null,
      area: null,
      budget_band: null,
      community: "",
      city: "郑州市",
      district: "金水区",
      status: "constructing",
      start_date: null,
      updated_at: "2026-07-20T08:00:00.000Z",
      description: null,
    } satisfies PublicProject);

    expect(site.title).toBe("公开在建工地");
    expect(JSON.stringify(site)).not.toContain("张先生 1号楼101室装修");
  });
});
