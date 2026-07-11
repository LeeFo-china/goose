import { describe, expect, test } from "bun:test";

const migrationPath = new URL(
  "../../../../supabase/migrations/20260711170000_create_site_content_cms.sql",
  import.meta.url,
);

describe("site content migration atomic contracts", () => {
  test("creates atomic create, publish, rollback and archive audit paths", async () => {
    const sql = await Bun.file(migrationPath).text();
    expect(sql).toContain("create_site_content_entry_with_version");
    expect(sql).toContain("archive_site_content");
    for (const action of [
      "site_content_create",
      "site_content_publish",
      "site_content_rollback",
      "site_content_archive",
    ]) expect(sql).toContain(action);
    expect(sql).toContain("CREATE VIEW public.site_content_admin_list");
    expect(sql).toContain("security_invoker = true");
    expect(sql).toContain("LEFT JOIN LATERAL");
  });
});
