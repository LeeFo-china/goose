import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

const migrationUrl = new URL(
  "../../../../supabase/migrations/20261001130000_backfill_lead_converted_customer_workflow.sql",
  import.meta.url,
);
const migration = existsSync(migrationUrl)
  ? readFileSync(migrationUrl, "utf8")
  : "";

describe("lead-converted customer workflow backfill migration", () => {
  test("is bound to the immutable post-release production audit", () => {
    expect(migration).toContain("3eebca47-961f-4899-b976-a3d3208d326b");
    expect(migration).toContain("2026-10-01T12:55:44.000Z");
    expect(migration).toContain("v_expected_count constant integer := 1");
    expect(migration).toContain(
      "20261001130000_backfill_lead_converted_customer_workflow",
    );
    expect(migration).toContain("customer.status = 'potential'");
    expect(migration).toContain("instance.subject_type = 'customer'");
    expect(migration).toContain("NOT EXISTS");
  });

  test("fails closed on workflow graph and runtime creation", () => {
    expect(migration).toContain("workflow_key = 'customer_main'");
    expect(migration).toContain("definition.status = 'active'");
    expect(migration).toContain("version.status = 'published'");
    expect(migration).toContain("v_start_node");
    expect(migration).toContain("v_potential_node");
    expect(migration).toContain("v_following_node");
    expect(migration).toContain("start_workflow_instance");
    expect(migration).toContain("v_start_result->>'ok'");
    expect(migration).toContain("current_node_key = 'potential'");
  });

  test("assigns tasks, refreshes projections, and asserts final counts", () => {
    expect(migration).toContain("assignee_employee_id = v_customer.owner_id");
    expect(migration).toContain("status = 'pending'");
    expect(migration).toContain("INSERT INTO public.workflow_subject_states");
    expect(migration).toContain("ON CONFLICT (tenant_id, subject_type, subject_id)");
    expect(migration).toContain("v_repaired_count");
    expect(migration).toContain("v_pending_task_count");
    expect(migration).toContain("v_projection_count");
    expect(migration).toContain("v_remaining_count");
    expect(migration).not.toMatch(/\bDELETE\b/i);
    expect(migration).not.toMatch(/cancel_workflow_instance/i);
  });
});
