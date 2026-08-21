import { describe, expect, test } from "bun:test";

const path = new URL(
  "../../../../../supabase/migrations/20260820100000_create_douyin_project_public_profiles.sql",
  import.meta.url,
);

describe("douyin public project profile migration", () => {
  test("enforces tenant ownership, publication state and private writes", async () => {
    const sql = await Bun.file(path).text();
    expect(sql).toContain("CREATE TABLE public.douyin_project_public_profiles");
    expect(sql).toContain("UNIQUE (tenant_id, project_id)");
    expect(sql).toContain("publication_status IN ('draft', 'published', 'hidden')");
    expect(sql).toContain("ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain("REVOKE ALL ON TABLE public.douyin_project_public_profiles");
  });
});
