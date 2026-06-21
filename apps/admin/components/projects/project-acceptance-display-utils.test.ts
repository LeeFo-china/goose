import { describe, expect, test } from "bun:test";
import type { ProjectAcceptance } from "./project-acceptance-types";
import {
  getAcceptanceEvidenceSummary,
  getAcceptanceItemStats,
} from "./project-acceptance-display-utils";

function acceptanceFixture(): ProjectAcceptance {
  return {
    id: "acceptance-1",
    project_id: "project-1",
    acceptance_type: "stage",
    stage_code: "plumbing_electrical",
    stage_label: "水电",
    title: "水电验收",
    status: "draft",
    status_label: "草稿",
    summary: null,
    reject_reason: null,
    reject_source: null,
    created_at: null,
    updated_at: null,
    submitted_at: null,
    items: [
      {
        id: "item-1",
        category: "水路",
        title: "冷热水管",
        standard: "水路走向与设计一致",
        required: true,
        allow_not_applicable: false,
        photo_required: true,
        photo_min_count: 1,
        photo_max_count: 6,
        result: "pass",
        remark: null,
        images: ["acceptance-a.jpg"],
        rectification_remark: null,
        rectification_images: ["rectification-a.jpg"],
      },
      {
        id: "item-2",
        category: "电路",
        title: "强弱电",
        standard: "强弱电间距符合要求",
        required: true,
        allow_not_applicable: false,
        photo_required: false,
        photo_min_count: 0,
        photo_max_count: 0,
        result: null,
        remark: null,
        images: [],
        image_items: [{
          id: "image-item-2",
          item_id: "item-2",
          item_title: "强弱电",
          path: "acceptance-b.jpg",
          source: "acceptance_item",
        }],
        rectification_remark: null,
        rectification_images: [],
      },
    ],
    actions: [{
      id: "action-1",
      action: "customer_dispute",
      operator_type: "customer",
      operator_id: null,
      from_status: "leader_approved",
      to_status: "rejected",
      comment: "请复核水管照片",
      created_at: null,
      images: ["customer-a.jpg"],
    }],
  };
}

describe("project acceptance display helpers", () => {
  test("counts item stats from local item results", () => {
    expect(getAcceptanceItemStats(acceptanceFixture())).toEqual({
      total: 2,
      pass: 1,
      fail: 0,
      pending: 1,
    });
  });

  test("summarizes acceptance, rectification, and action images", () => {
    const summary = getAcceptanceEvidenceSummary(acceptanceFixture());

    expect(summary.total).toBe(4);
    expect(summary.acceptanceImages.map((image) => image.item_title)).toEqual([
      "冷热水管",
      "强弱电",
    ]);
    expect(summary.rectificationImages[0]?.path).toBe("rectification-a.jpg");
    expect(summary.actionImages[0]?.path).toBe("customer-a.jpg");
  });
});
