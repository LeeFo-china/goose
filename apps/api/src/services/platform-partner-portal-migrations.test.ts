import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const migrationsDir = join(import.meta.dir, "../../../../supabase/migrations");

describe("platform partner portal migration", () => {
  test("creates partner members table and indexes", () => {
    const migrationName = readdirSync(migrationsDir)
      .find((name) => name.endsWith("_create_platform_partner_members.sql"));

    expect(migrationName).toBeTruthy();
    const migrationPath = join(migrationsDir, migrationName!);
    expect(existsSync(migrationPath)).toBe(true);

    const sql = readFileSync(migrationPath, "utf8");
    for (const fragment of [
      "CREATE TABLE IF NOT EXISTS public.platform_partner_members",
      "partner_id uuid NOT NULL REFERENCES public.platform_partners(id)",
      "auth_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL",
      "DROP CONSTRAINT IF EXISTS sms_verification_codes_scene_check",
      "'bind_customer'::text",
      "'bind_employee'::text",
      "'admin_login'::text",
      "'rebind_wechat'::text",
      "'bind_platform_partner'::text",
      "tr_platform_partner_members_updated_at",
      "platform_partner_members_partner_phone_idx",
      "platform_partner_members_auth_user_status_idx",
      "platform_partner_members_partner_status_idx",
    ]) expect(sql).toContain(fragment);
  });

  test("creates atomic partner member binding RPC and uniqueness indexes", () => {
    const migrationPath = join(
      migrationsDir,
      "20260705191000_create_platform_partner_member_binding_rpc.sql",
    );

    expect(existsSync(migrationPath)).toBe(true);
    const sql = readFileSync(migrationPath, "utf8");
    for (const fragment of [
      "claim_platform_partner_member_binding",
      "FOR UPDATE SKIP LOCKED",
      "platform_partner_members_auth_user_active_unique_idx",
      "platform_partner_members_phone_active_unique_idx",
      "sms_invalid",
      "member_already_bound",
      "REVOKE ALL ON FUNCTION public.claim_platform_partner_member_binding",
      "GRANT EXECUTE ON FUNCTION public.claim_platform_partner_member_binding",
      "TO service_role",
    ]) expect(sql).toContain(fragment);
    expect(sql).not.toContain("p_now");
  });

  test("hardens partner member binding RPC with partner availability check", () => {
    const migrationPath = join(
      migrationsDir,
      "20260705204000_harden_platform_partner_member_binding_rpc.sql",
    );

    expect(existsSync(migrationPath)).toBe(true);
    const sql = readFileSync(migrationPath, "utf8");
    for (const fragment of [
      "CREATE OR REPLACE FUNCTION public.claim_platform_partner_member_binding",
      "JOIN public.platform_partners AS partner ON partner.id = member.partner_id",
      "partner.status AS partner_status",
      "FOR UPDATE OF member, partner SKIP LOCKED",
      "v_member.partner_status <> 'active'",
      "partner_unavailable",
      "REVOKE ALL ON FUNCTION public.claim_platform_partner_member_binding",
      "FROM PUBLIC",
      "FROM anon",
      "FROM authenticated",
      "GRANT EXECUTE ON FUNCTION public.claim_platform_partner_member_binding",
      "TO service_role",
    ]) expect(sql).toContain(fragment);
  });

  test("creates partner dashboard monthly summary RPC", () => {
    const migrationPath = join(
      migrationsDir,
      "20260705192000_create_partner_dashboard_summary_rpc.sql",
    );

    expect(existsSync(migrationPath)).toBe(true);
    const sql = readFileSync(migrationPath, "utf8");
    for (const fragment of [
      "get_partner_dashboard_monthly_summary",
      "p_partner_id uuid",
      "partner_id = p_partner_id",
      "count(*)",
      "coalesce(sum(",
      "filter (where status = 'available')",
      "filter (where status = 'paid')",
      "partner_settlement_batches_partner_created_idx",
      "tenant_partner_bindings_partner_bound_idx",
      "partner_commission_ledger_partner_created_idx",
      "bound_at DESC",
      "created_at DESC",
      "REVOKE ALL ON FUNCTION public.get_partner_dashboard_monthly_summary",
      "FROM PUBLIC",
      "FROM anon",
      "FROM authenticated",
      "GRANT EXECUTE ON FUNCTION public.get_partner_dashboard_monthly_summary",
      "TO service_role",
    ]) expect(sql).toContain(fragment);
  });
});
