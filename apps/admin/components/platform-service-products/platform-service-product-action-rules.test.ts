import { describe, expect, test } from "bun:test";

import type { PlatformServiceProductListItem } from "./platform-service-product-types";
import {
  getNextPublishedVersion,
  getPlatformServiceProductChangedFields,
} from "./platform-service-product-action-rules";

const publishedVersion = {
  id: "version-1",
  version: 1,
  title: "平台部署及年度技术服务（1年）",
  term_years: 1,
  list_amount_fen: 980_000,
  amount_fen: 980_000,
  price_rate_basis_points: 10_000,
  service_scope: ["客户专属系统环境部署"],
  terms_version: 1,
  terms_content: "旧版服务条款",
};

function product(
  overrides: Partial<PlatformServiceProductListItem> = {},
): PlatformServiceProductListItem {
  return {
    id: "product-1",
    code: "platform_service_1y",
    status: "enabled",
    version: 2,
    published_version_id: publishedVersion.id,
    sort_order: 10,
    draft: {
      ...publishedVersion,
      id: null,
      version: 2,
      amount_fen: 880_000,
      service_scope: ["客户专属系统环境部署", "首次操作培训及实施指导"],
      terms_version: 2,
      terms_content: "新版服务条款",
    },
    published: publishedVersion,
    has_unpublished_changes: true,
    created_at: "2026-08-03T00:00:00.000Z",
    updated_at: "2026-08-07T00:00:00.000Z",
    ...overrides,
  };
}

describe("平台技术服务套餐操作确认规则", () => {
  test("只列出草稿相对已发布版本发生变化的字段", () => {
    expect(getPlatformServiceProductChangedFields(product())).toEqual([
      "实付价",
      "服务范围",
      "服务条款",
    ]);
  });

  test("首次发布时列出全部需要确认的字段", () => {
    expect(
      getPlatformServiceProductChangedFields(product({
        published_version_id: null,
        published: null,
      })),
    ).toEqual([
      "套餐名称",
      "服务年限",
      "标价",
      "实付价",
      "服务范围",
      "服务条款",
    ]);
  });

  test("发布版本使用商品当前版本的下一版本", () => {
    expect(getNextPublishedVersion(product())).toBe(3);
  });
});
