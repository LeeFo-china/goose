import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";

const foundationMigration = new URL(
  "../../../../../supabase/migrations/20260821105000_create_douyin_measurement_appointments.sql",
  import.meta.url,
);
const sourceSnapshotMigration = new URL(
  "../../../../../supabase/migrations/20260821105640_snapshot_douyin_appointment_status.sql",
  import.meta.url,
);
const previousMigration = new URL(
  "../../../../../supabase/migrations/20260821105630_bind_douyin_assignee_department_scope.sql",
  import.meta.url,
);

function normalize(sql: string): string {
  return sql.replace(/--[^\n]*/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
}

function functionBody(sql: string, functionName: string): string {
  const normalized = normalize(sql);
  const marker = `create or replace function public.${functionName}`;
  const start = normalized.indexOf(marker);
  const bodyStart = normalized.indexOf("as $function$", start);
  const end = normalized.indexOf("$function$;", bodyStart + 13);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(bodyStart).toBeGreaterThan(start);
  expect(end).toBeGreaterThan(bodyStart);
  return normalized.slice(start, end + 11);
}

describe("douyin customer source status snapshot migration", () => {
  test("keeps the applied measurement foundation immutable", async () => {
    const bytes = await Bun.file(foundationMigration).arrayBuffer();
    expect(createHash("sha256").update(new Uint8Array(bytes)).digest("hex"))
      .toBe("0e135bd00efcadb6d0783628047080d63bae0be4f2855bc44f19c4bb80d833b8");
    const previousBytes = await Bun.file(previousMigration).arrayBuffer();
    expect(createHash("sha256").update(new Uint8Array(previousBytes)).digest("hex"))
      .toBe("b58feaa95f505b832358032592a5a9ecde24841e67fb0f7c6f897f8ffcfdb2b2");
  });

  test("adds only the validated appointment status to future source snapshots", async () => {
    const sql = await Bun.file(sourceSnapshotMigration).text();
    const normalized = normalize(sql);
    const metadata = functionBody(sql, "douyin_measurement_source_metadata");
    const validator = functionBody(sql, "is_valid_douyin_measurement_source_metadata");

    expect(metadata).toContain("'appointment_status', p_appointment.status");
    expect(metadata).not.toMatch(/request_ip|user_agent|sms_code|subject_hash|create_request_hash/);
    expect(validator).toContain("'appointment_status'");
    expect(validator).toContain(
      "p_metadata->>'appointment_status' in ( 'pending_confirmation', 'confirmed', 'completed', 'canceled', 'invalid' )",
    );
    expect(normalized).toMatch(/revoke all on function public\.douyin_measurement_source_metadata\(\s*public\.douyin_measurement_appointments\s*\) from public, anon, authenticated, service_role/);
    expect(normalized).toMatch(/revoke all on function public\.is_valid_douyin_measurement_source_metadata\(\s*jsonb\s*\) from public, anon, authenticated, service_role/);
  });

  test("repairs only matching Douyin appointment rows under an audited bound", async () => {
    const sql = normalize(await Bun.file(sourceSnapshotMigration).text());

    expect(sql).toContain("v_backfill_limit constant bigint := 10000");
    expect(sql).toContain("if v_backfill_count > v_backfill_limit then");
    expect(sql).toContain("douyin_customer_source_status_backfill_limit_exceeded");
    expect(sql).toMatch(/update public\.customer_sources as source set metadata = source\.metadata \|\| pg_catalog\.jsonb_build_object\( 'appointment_status', appointment\.status \) from public\.douyin_measurement_appointments as appointment/);
    expect(sql).toContain("source.douyin_measurement_appointment_id = appointment.id");
    expect(sql).toContain("source.tenant_id = appointment.tenant_id");
    expect(sql).toContain("source.source = 'douyin_miniapp'");
    expect(sql).toContain("source.source_label = '抖音小程序'");
    expect(sql).toContain("source.metadata->>'appointment_status' is distinct from appointment.status");
    expect(sql).not.toMatch(/delete from public\.|insert into public\.customer_sources/);
    expect(sql.match(/update public\.customer_sources/g)).toHaveLength(1);
  });

  test("restores the immutable source trigger after the one-time repair", async () => {
    const sql = await Bun.file(sourceSnapshotMigration).text();
    const normalized = normalize(sql);
    const guardDefinitions = normalized.match(
      /create or replace function public\.douyin_measurement_customer_source_guard\(\)/g,
    ) ?? [];
    const finalGuard = functionBody(
      sql.slice(sql.lastIndexOf("CREATE OR REPLACE FUNCTION public.douyin_measurement_customer_source_guard")),
      "douyin_measurement_customer_source_guard",
    );

    expect(guardDefinitions).toHaveLength(2);
    expect(normalized).not.toMatch(/disable trigger|drop trigger/);
    expect(finalGuard).toContain("if v_is_measurement and tg_op <> 'insert' then");
    expect(finalGuard).toContain("douyin_measurement_customer_source_immutable");
  });
});
