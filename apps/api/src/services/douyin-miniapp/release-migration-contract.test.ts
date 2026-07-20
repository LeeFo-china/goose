import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const migration = new URL(
  "../../../../../supabase/migrations/20260719102000_create_douyin_miniapp_releases.sql",
  import.meta.url,
);

function sql(): string {
  return readFileSync(migration, "utf8").replace(/--.*$/gm, "").replace(/\s+/g, " ").trim();
}

describe("douyin miniapp release migration", () => {
  test("creates the release ledger with its installation and operator ownership", () => {
    const source = sql();
    expect(source).toContain("CREATE TABLE public.douyin_miniapp_releases");
    expect(source).toContain(
      "installation_id uuid NOT NULL REFERENCES public.douyin_miniapp_installations(id) ON DELETE RESTRICT",
    );
    expect(source).toContain(
      "platform_operator_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT",
    );
    for (const column of [
      "template_id text NOT NULL",
      "template_version text NOT NULL",
      "description text NOT NULL",
      "channel text NOT NULL DEFAULT 'default'",
      "ext_json jsonb NOT NULL",
      "douyin_log_id text NULL",
      "test_qr_url text NULL",
      "audit_host_names text[] NOT NULL DEFAULT ARRAY[]::text[]",
      "audit_note text NULL",
      "audit_result jsonb NULL",
      "submitted_at timestamptz NULL",
      "audited_at timestamptz NULL",
      "released_at timestamptz NULL",
      "created_at timestamptz NOT NULL DEFAULT now()",
      "updated_at timestamptz NOT NULL DEFAULT now()",
    ]) expect(source).toContain(column);
  });

  test("enforces identifiers, semantic versions, channels, and all eight statuses", () => {
    const source = sql();
    expect(source).toContain("template_id ~ '^[1-9][0-9]{0,18}$'");
    expect(source).toContain("length(template_version) <= 64");
    expect(source).toContain(
      "template_version ~ '^(0|[1-9][0-9]*)[.](0|[1-9][0-9]*)[.](0|[1-9][0-9]*)",
    );
    expect(source).toContain("([+][0-9A-Za-z-]+([.][0-9A-Za-z-]+)*)?$'");
    expect(source).not.toContain("template_version ~ '^[0-9]+[.][0-9]+[.][0-9]+");
    expect(source).toContain("channel IN ('default', '1')");
    for (const status of [
      "created", "uploaded", "testing", "audit_pending", "audit_rejected",
      "audit_approved", "released", "failed",
    ]) expect(source).toContain(`'${status}'`);
  });

  test("fails closed on ext_json and stores only bounded safe provider metadata", () => {
    const source = sql();
    expect(source).toContain(
      "ext_json - ARRAY['extEnable', 'extAppid', 'ext']::text[] = '{}'::jsonb",
    );
    expect(source).toContain("ext_json ?& ARRAY['extEnable', 'extAppid', 'ext']::text[]");
    expect(source).toContain("ext_json -> 'extEnable' = 'true'::jsonb");
    expect(source).toContain("jsonb_typeof(ext_json -> 'extAppid') = 'string'");
    expect(source).toContain("ext_json -> 'ext' - 'deployment_key' = '{}'::jsonb");
    expect(source).toContain("ext_json -> 'ext' ? 'deployment_key'");
    expect(source).not.toContain("ext_json::text !~* '(token|secret|phone|openid)'");
    expect(source).toContain(
      "audit_result - ARRAY['audit_id', 'status', 'reason', 'error_code']::text[] = '{}'::jsonb",
    );
    expect(source).toContain("octet_length(audit_result::text) <= 4096");
    expect(source).toContain("test_qr_url ~ '^https://[^[:space:]]+$'");
    expect(source).toContain("cardinality(audit_host_names) <= 20");
    expect(source).toContain("array_position(audit_host_names, '') IS NULL");
    expect(source).toContain(
      "array_to_string(audit_host_names, ',') ~ '^(|[A-Za-z0-9.-]{1,253}(,[A-Za-z0-9.-]{1,253})*)$'",
    );
    expect(source).toContain("length(audit_note) BETWEEN 1 AND 1000");
    expect(source).toContain("douyin_log_id ~ '^[A-Za-z0-9._:-]{1,128}$'");
  });

  test("adds lifecycle indexes, updated-at trigger, RLS, and least-privilege grants", () => {
    const source = sql();
    expect(source).toContain(
      "CREATE INDEX douyin_miniapp_releases_installation_created_idx ON public.douyin_miniapp_releases(installation_id, created_at DESC, id DESC)",
    );
    expect(source).toContain(
      "CREATE INDEX douyin_miniapp_releases_status_updated_idx ON public.douyin_miniapp_releases(status, updated_at DESC)",
    );
    expect(source).toContain(
      "CREATE TRIGGER tr_douyin_miniapp_releases_updated_at BEFORE UPDATE ON public.douyin_miniapp_releases FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()",
    );
    expect(source).toContain(
      "ALTER TABLE public.douyin_miniapp_releases ENABLE ROW LEVEL SECURITY",
    );
    expect(source).toContain(
      "REVOKE ALL ON TABLE public.douyin_miniapp_releases FROM PUBLIC, anon, authenticated, service_role",
    );
    expect(source).toContain(
      "GRANT SELECT, INSERT, UPDATE ON TABLE public.douyin_miniapp_releases TO service_role",
    );
  });
});
