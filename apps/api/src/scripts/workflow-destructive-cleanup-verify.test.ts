import { describe, expect, test } from "bun:test";
import {
  buildAbsenceCheck,
  buildWorkflowDestructiveCleanupVerifyReport,
  resolveWorkflowDestructiveCleanupVerifyDatabaseUrl,
  type LegacyCleanupInventory,
} from "./workflow-destructive-cleanup-verify";

const cleanInventory: LegacyCleanupInventory = {
  tables: {
    customer_status_transition_logs: false,
    project_status_transition_logs: false,
    expense_request_approval_chains: false,
  },
  rpc: {
    "schedule_project_construction_transition(uuid,uuid,text,text,text,uuid,uuid,uuid,text,jsonb)":
      false,
  },
  expenseColumns: {
    current_step: false,
    current_step_role: false,
  },
  indexes: {
    idx_expense_requests_current_step: false,
    customer_status_transition_logs_customer_created_idx: false,
  },
  policies: {
    "expense_requests.Approvers view pending": false,
  },
};

describe("resolveWorkflowDestructiveCleanupVerifyDatabaseUrl", () => {
  test("prefers the direct database url before pooled url", () => {
    expect(resolveWorkflowDestructiveCleanupVerifyDatabaseUrl({
      SUPABASE_DB_DIRECT_URL: "postgres://direct",
      SUPABASE_DB_URL: "postgres://pooled",
    })).toBe("postgres://direct");

    expect(resolveWorkflowDestructiveCleanupVerifyDatabaseUrl({
      SUPABASE_DB_URL: "postgres://pooled",
    })).toBe("postgres://pooled");
  });

  test("returns null when no database url is configured", () => {
    expect(resolveWorkflowDestructiveCleanupVerifyDatabaseUrl({})).toBeNull();
  });
});

describe("buildAbsenceCheck", () => {
  test("passes when every tracked legacy object is absent", () => {
    expect(buildAbsenceCheck("legacy_tables_absent", {
      customer_status_transition_logs: false,
      project_status_transition_logs: false,
    })).toEqual({
      name: "legacy_tables_absent",
      ok: true,
      detail:
        "absent=customer_status_transition_logs, project_status_transition_logs",
    });
  });

  test("fails and reports present legacy objects", () => {
    expect(buildAbsenceCheck("legacy_tables_absent", {
      customer_status_transition_logs: true,
      project_status_transition_logs: false,
    })).toEqual({
      name: "legacy_tables_absent",
      ok: false,
      detail: "present=customer_status_transition_logs",
    });
  });
});

describe("buildWorkflowDestructiveCleanupVerifyReport", () => {
  test("passes when old objects are absent and workflow runtime is consistent", () => {
    expect(buildWorkflowDestructiveCleanupVerifyReport(
      cleanInventory,
      { ok: true, total_issues: 0 },
      "2026-06-12T00:00:00.000Z",
    )).toEqual({
      ok: true,
      generated_at: "2026-06-12T00:00:00.000Z",
      checks: [
        {
          name: "legacy_tables_absent",
          ok: true,
          detail:
            "absent=customer_status_transition_logs, project_status_transition_logs, expense_request_approval_chains",
        },
        {
          name: "legacy_rpc_absent",
          ok: true,
          detail:
            "absent=schedule_project_construction_transition(uuid,uuid,text,text,text,uuid,uuid,uuid,text,jsonb)",
        },
        {
          name: "legacy_expense_columns_absent",
          ok: true,
          detail: "absent=current_step, current_step_role",
        },
        {
          name: "legacy_indexes_absent",
          ok: true,
          detail:
            "absent=idx_expense_requests_current_step, customer_status_transition_logs_customer_created_idx",
        },
        {
          name: "legacy_policies_absent",
          ok: true,
          detail: "absent=expense_requests.Approvers view pending",
        },
        {
          name: "workflow_runtime_consistency",
          ok: true,
          detail: "total_issues=0",
        },
      ],
    });
  });

  test("fails when a legacy object remains or runtime consistency fails", () => {
    expect(buildWorkflowDestructiveCleanupVerifyReport(
      {
        ...cleanInventory,
        rpc: {
          "schedule_project_construction_transition(uuid,uuid,text,text,text,uuid,uuid,uuid,text,jsonb)":
            true,
        },
      },
      { ok: false, total_issues: 2 },
      "2026-06-12T00:00:00.000Z",
    ).ok).toBe(false);
  });
});
