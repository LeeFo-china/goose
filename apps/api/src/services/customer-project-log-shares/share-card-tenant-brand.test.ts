import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, test } from "bun:test";

import type { CustomerProjectLogShareContext } from "./legacy/shared";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_ANON_KEY ??= "test-anon-key";
process.env.SUPABASE_PUBLISH ??= process.env.SUPABASE_ANON_KEY;
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

let getShareCard: typeof import("./legacy/public-actions").getShareCard;
let normalizeRelation: typeof import("./legacy/shared").normalizeRelation;

beforeAll(async () => {
  ({ getShareCard } = await import("./legacy/public-actions"));
  ({ normalizeRelation } = await import("./legacy/shared"));
});

const context: CustomerProjectLogShareContext = {
  tenant_id: "tenant-1",
  tenant_name: "杭州某某装饰工程有限公司",
  customer_id: "customer-1",
  customer_name: "张先生",
  project_id: "project-1",
  project_name: "中海云麓 12-2-1801",
  project_status: "in_progress",
  project_status_label: "施工中",
  project_address: "杭州市",
  project_style_tags: [],
  property_community: "中海云麓",
  property_building_info: "12-2-1801",
  designer_name: "李设计",
  log_id: "log-1",
  stage_code: null,
  stage_label: null,
  node_name: "水电施工",
  log_content: "施工日志",
  log_images: ["https://example.com/log.jpg"],
  created_at: "2026-08-07T00:00:00.000Z",
};

describe("客户项目日志分享卡租户品牌", () => {
  test("项目上下文从项目所属租户关系取得展示名称", () => {
    const source = readFileSync(
      new URL("./legacy/owned-context.ts", import.meta.url),
      "utf8",
    );

    expect(source).toContain("tenant:tenants!projects_tenant_id_fkey(");
    const tenantRelationSelect = source.match(
      /tenant:tenants!projects_tenant_id_fkey\(\s*([^)]*?)\s*\)/,
    )?.[1];
    expect(tenantRelationSelect?.trim()).toBe("name");
    expect(source).toContain("normalizeRelation(project.tenant");
    expect(source).toContain("tenant_name:");

    expect(normalizeRelation<{ name: string | null }>(
      { name: "对象租户" },
      { name: null },
    ))
      .toEqual({ name: "对象租户" });
    expect(normalizeRelation<{ name: string | null }>(
      [{ name: "数组租户" }],
      { name: null },
    ))
      .toEqual({ name: "数组租户" });
  });

  test("分享卡同时返回同值的 tenant_name 和 company_name", async () => {
    const result = await getShareCard.call({
      resolveOptionalShareCampaignForOwnedLog: async () => ({
        context,
        campaign: null,
      }),
    }, "auth-user-1", "project-1", "log-1");

    expect(result).toMatchObject({
      tenant_name: "杭州某某装饰工程有限公司",
      company_name: "杭州某某装饰工程有限公司",
      project_name: "中海云麓 12-2-1801",
      images: ["https://example.com/log.jpg"],
    });
  });

  test("租户名称缺失时仍返回稳定的 null 双字段", async () => {
    const result = await getShareCard.call({
      resolveOptionalShareCampaignForOwnedLog: async () => ({
        context: { ...context, tenant_name: null },
        campaign: null,
      }),
    }, "auth-user-1", "project-1", "log-1");

    expect(result.tenant_name).toBeNull();
    expect(result.company_name).toBeNull();
  });
});
