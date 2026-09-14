import { expect, test } from "bun:test";
import { DOUYIN_ENTRY_PATH_VALUES } from "@gooes/domain";

const migration = new URL(
  "../../../../../supabase/migrations/20260914202700_accept_douyin_official_lead_attribution.sql",
  import.meta.url,
);

test("official attribution remains valid when an appointment becomes a customer source", async () => {
  const sql = (await Bun.file(migration).text()).replace(/--[^\n]*/g, " ")
    .replace(/\s+/g, " ").toLowerCase();
  const start = sql.indexOf("create or replace function public.is_valid_douyin_measurement_attribution_snapshot");
  const end = sql.indexOf("$function$;", start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  const validator = sql.slice(start, end);
  expect(validator).toContain("'analysis_info'");
  for (const path of DOUYIN_ENTRY_PATH_VALUES) expect(validator).toContain(`'${path}'`);
  for (const field of ["video_item_id", "live_room_id", "unique_id"]) {
    expect(validator).toContain(`'${field}'`);
  }
  expect(validator).toContain("char_length(official.value #>> '{}') not between 1 and 256");
  expect(sql).toContain("revoke all on function public.is_valid_douyin_measurement_attribution_snapshot(jsonb)");
});
