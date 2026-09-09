import { expect, test } from "bun:test";

test("materials rollout preserves typed requests and extends only the private atomic core", async () => {
  const sql = await Bun.file(new URL("../../../../supabase/migrations/20260908020216_warehouse_material_rollout_command.sql", import.meta.url)).text();
  expect(sql).toContain("warehouse_materials_enabled");
  expect(sql).toContain("p_request jsonb, p_actor_user_id uuid, p_idempotency_key text");
  expect(sql).toContain("WAREHOUSE_MATERIAL_ROLLOUT_SOURCE_MISMATCH");
  expect(sql).toContain("SUPPLIER_ROLLOUT_ORDER_INVALID");
  expect(sql).toContain("FROM PUBLIC, anon, authenticated, service_role");
  expect(sql).not.toMatch(/UPDATE public\.supplier_command_events/);
});
