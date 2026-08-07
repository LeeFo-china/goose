import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  AssistCustomerProjectLogShareCampaignSchema,
  OpenCustomerProjectLogShareCampaignSchema,
} from "./customer-project-log-share";

const migration = new URL(
  "../../../../supabase/migrations/20260807143000_add_wechat_friend_share_source.sql",
  import.meta.url,
);

describe("好友助力微信好友转发来源", () => {
  test("打开和助力请求接受 wechat_friend", () => {
    expect(OpenCustomerProjectLogShareCampaignSchema.parse({
      share_token: "st_open",
      source: "wechat_friend",
    }).source).toBe("wechat_friend");
    expect(AssistCustomerProjectLogShareCampaignSchema.parse({
      share_token: "st_assist",
      source: "wechat_friend",
    }).source).toBe("wechat_friend");
  });

  test("未传来源继续默认 qrcode 且拒绝未知来源", () => {
    expect(OpenCustomerProjectLogShareCampaignSchema.parse({
      share_token: "st_default",
    }).source).toBe("qrcode");
    expect(AssistCustomerProjectLogShareCampaignSchema.parse({
      share_token: "st_default",
    }).source).toBe("qrcode");

    const invalid = OpenCustomerProjectLogShareCampaignSchema.safeParse({
      share_token: "st_invalid",
      source: "unknown",
    });
    expect(invalid.success).toBe(false);
    if (!invalid.success) {
      expect(invalid.error.issues[0]?.message).toBe("无效的分享来源");
    }
  });

  test("migration 同时扩展打开和助力记录约束", () => {
    const migrationPath = fileURLToPath(migration);
    expect(existsSync(migrationPath)).toBe(true);
    if (!existsSync(migrationPath)) return;

    const sql = readFileSync(migrationPath, "utf8")
      .replace(/--.*$/gm, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();

    for (const table of [
      "customer_log_share_opens",
      "customer_log_share_assists",
    ]) {
      expect(sql).toContain(`alter table public.${table}`);
      expect(sql).toContain(`${table}_source_check`);
    }
    expect(sql.match(/'wechat_friend'/g)?.length).toBe(2);
  });
});
