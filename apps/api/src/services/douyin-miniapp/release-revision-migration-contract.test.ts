import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

const path = new URL(
  "../../../../../supabase/migrations/20260917230000_support_douyin_same_version_template_revision.sql",
  import.meta.url,
);
const sql = readFileSync(path, "utf8");

describe("Douyin same-version template revision migration", () => {
  test("uses exact template identity and stores provider evidence", () => {
    expect(sql).toContain("ADD COLUMN provider_summary text NULL");
    expect(sql).toContain(
      "UNIQUE (installation_id, template_id, template_version)",
    );
    expect(sql).toContain("release.template_id = p_template_id");
    expect(sql).toContain("release.template_version = p_template_version");
    expect(sql).toContain("'[#' || p_template_id || '] '");
  });

  test("fails closed and preserves RPC privileges", () => {
    expect(sql).toContain("DOUYIN_RELEASE_EXACT_DELIVERY_DUPLICATES_EXIST");
    expect(sql).toContain(
      "REVOKE ALL ON FUNCTION public.get_or_create_and_claim_douyin_miniapp_release_upload_v2",
    );
    expect(sql).toContain(
      "GRANT EXECUTE ON FUNCTION public.get_or_create_and_claim_douyin_miniapp_release_upload_v2",
    );
    expect(sql).toContain("Rollback:");
  });
});
