import { describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildDecorationWorkflowManualGateCheckReport,
  parseDecorationWorkflowManualGateCheckArgs,
} from "./decoration-workflow-manual-gates-check";

const generatedAt = "2026-06-17T22:30:00.000+08:00";

describe("parseDecorationWorkflowManualGateCheckArgs", () => {
  test("parses decoration manual gate evidence file path", () => {
    expect(parseDecorationWorkflowManualGateCheckArgs([
      "--evidence-file",
      "docs/state_machine_migrate/audit/2026-06-17-decoration-workflow-manual-gates.json",
    ])).toEqual({
      evidenceFile:
        "docs/state_machine_migrate/audit/2026-06-17-decoration-workflow-manual-gates.json",
    });
  });

  test("rejects unknown flags", () => {
    expect(() => parseDecorationWorkflowManualGateCheckArgs(["--apply"]))
      .toThrow("未知参数: --apply");
  });
});

describe("buildDecorationWorkflowManualGateCheckReport", () => {
  test("fails when the decoration evidence file is not provided", async () => {
    expect(await buildDecorationWorkflowManualGateCheckReport(null, generatedAt))
      .toEqual({
        ok: false,
        generated_at: generatedAt,
        checks: [
          {
            name: "decoration_manual_gate_evidence",
            ok: false,
            detail: "missing --evidence-file",
          },
        ],
      });
  });

  test("reports pending legacy apply, manual restore, and orange e2e gates", async () => {
    const report = await buildDecorationWorkflowManualGateCheckReport(
      "docs/state_machine_migrate/audit/2026-06-17-decoration-workflow-manual-gates.json",
      generatedAt,
    );

    expect(report.ok).toBe(false);
    expect(report.checks).toEqual([
      {
        name: "read_only_review_current",
        ok: true,
        detail:
          "needs_migration=false; unknown_review_required=0; running_instances_on_legacy_snapshots=10",
      },
      {
        name: "legacy_apply_confirmations",
        ok: false,
        detail:
          "pending=project_signing_rebuild, invalid_customer_cancellations",
      },
      {
        name: "manual_restore_decision",
        ok: false,
        detail:
          "pending=manual_restore_project; project_id=634ff402-ff84-4541-aa7c-3cdcd4fd5460",
      },
      {
        name: "orange_e2e_acceptance",
        ok: false,
        detail:
          "pending=customer_design_workflow, project_signing_workflow, payment_collection_workflow, construction_procedure_log, stage_acceptance_transition, admin_finance_and_workflow_visibility",
      },
      {
        name: "closeout_rules_consistent",
        ok: true,
        detail:
          "can_run_legacy_apply=false; can_close_prd_without_followup=false",
      },
    ]);
  });

  test("passes complete decoration manual gate evidence", async () => {
    const dir = await mkdtemp(join(tmpdir(), "gooes-decoration-gates-"));
    const path = join(dir, "decoration-gates.json");
    try {
      await writeFile(
        path,
        JSON.stringify(buildCompleteEvidence()),
        "utf8",
      );

      expect(await buildDecorationWorkflowManualGateCheckReport(
        path,
        generatedAt,
      )).toEqual({
        ok: true,
        generated_at: generatedAt,
        checks: [
          {
            name: "decoration_manual_gate_evidence",
            ok: true,
            detail: `evidence_file=${path}`,
          },
          {
            name: "read_only_review_current",
            ok: true,
            detail:
              "needs_migration=false; unknown_review_required=0; running_instances_on_legacy_snapshots=7",
          },
          {
            name: "legacy_apply_confirmations",
            ok: true,
            detail:
              "confirmed=project_signing_rebuild, invalid_customer_cancellations",
          },
          {
            name: "manual_restore_decision",
            ok: true,
            detail:
              "selected_option=continue_legacy_acceptance_until_completed",
          },
          {
            name: "orange_e2e_acceptance",
            ok: true,
            detail:
              "passed=customer_design_workflow, project_signing_workflow, payment_collection_workflow, construction_procedure_log, stage_acceptance_transition, admin_finance_and_workflow_visibility",
          },
          {
            name: "closeout_rules_consistent",
            ok: true,
            detail:
              "can_run_legacy_apply=true; can_close_prd_without_followup=true",
          },
        ],
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("rejects confirmed gates without traceable metadata", async () => {
    const dir = await mkdtemp(join(tmpdir(), "gooes-decoration-gates-"));
    const path = join(dir, "decoration-gates.json");
    try {
      const evidence = buildCompleteEvidence();
      evidence.legacy_instance_apply_gates.project_signing_rebuild.evidence = "";
      evidence.orange_e2e_acceptance_gate.confirmed_at = "3026-06-17T10:00:00+08:00";

      await writeFile(path, JSON.stringify(evidence), "utf8");

      const report = await buildDecorationWorkflowManualGateCheckReport(
        path,
        generatedAt,
      );

      expect(report.ok).toBe(false);
      expect(report.checks[0]).toEqual({
        name: "decoration_manual_gate_evidence",
        ok: false,
        detail:
          `evidence_file=${path}; missing=legacy_instance_apply_gates.project_signing_rebuild.evidence, invalid=orange_e2e_acceptance_gate.confirmed_at: must not be in the future`,
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

function buildCompleteEvidence() {
  return {
    latest_read_only_review: {
      reviewed_at: "2026-06-17T22:00:00+08:00",
      commands: [
        "bun --env-file=.env.local apps/api/src/scripts/decoration-workflow-business-audit.ts --sample-limit 100",
        "bun --env-file=.env.local apps/api/src/scripts/decoration-workflow-legacy-instance-review.ts --sample-limit 100",
      ],
      needs_migration: false,
      needs_instance_review: false,
      running_instances_on_legacy_snapshots: 7,
      compatible_runtime: 6,
      rebuild_candidate: 0,
      manual_restore_required: 1,
      unknown_review_required: 0,
      evidence:
        "docs/state_machine_migrate/2026-06-17-decoration-workflow-business-spec.md",
    },
    legacy_instance_apply_gates: {
      project_signing_rebuild: {
        confirmed: true,
        confirmed_by: "业务负责人",
        confirmed_at: "2026-06-17T22:05:00+08:00",
        evidence:
          "docs/state_machine_migrate/2026-06-17-decoration-workflow-legacy-apply-checklist.md",
        project_id: "1a8589fb-8f3f-4900-a759-6d15438ffcc2",
        legacy_instance_id: "b58acf8e-4f18-4b40-b5c7-919600e5e636",
        target_workflow_key: "project_signing",
        latest_dry_run_ok: true,
        apply_command:
          "bun --env-file=.env.local apps/api/src/scripts/decoration-workflow-legacy-rebuild.ts --apply --confirm-rebuild 1a8589fb-8f3f-4900-a759-6d15438ffcc2 --tenant-id 3eebca47-961f-4899-b976-a3d3208d326b --subject-type project --subject-id 1a8589fb-8f3f-4900-a759-6d15438ffcc2 --workflow-key project_signing",
      },
      invalid_customer_cancellations: {
        confirmed: true,
        confirmed_by: "业务负责人",
        confirmed_at: "2026-06-17T22:06:00+08:00",
        evidence:
          "docs/state_machine_migrate/2026-06-17-decoration-workflow-legacy-apply-checklist.md",
        items: [
          {
            legacy_instance_id: "41f7772d-c472-41e6-a913-c6e641be3dd2",
            customer_id: "aa55b76c-a6a1-498a-9e36-fde8b974a248",
            customer_status: "invalid",
            latest_dry_run_ok: true,
            apply_command:
              "bun --env-file=.env.local apps/api/src/scripts/decoration-workflow-legacy-cancel.ts --apply --confirm-cancel 41f7772d-c472-41e6-a913-c6e641be3dd2 --tenant-id 3eebca47-961f-4899-b976-a3d3208d326b --instance-id 41f7772d-c472-41e6-a913-c6e641be3dd2",
          },
          {
            legacy_instance_id: "1a6dc44b-19b9-4516-8d3f-9e2f4125b842",
            customer_id: "2cc20642-03d9-4bc6-a68a-f7236ab8e3ea",
            customer_status: "invalid",
            latest_dry_run_ok: true,
            apply_command:
              "bun --env-file=.env.local apps/api/src/scripts/decoration-workflow-legacy-cancel.ts --apply --confirm-cancel 1a6dc44b-19b9-4516-8d3f-9e2f4125b842 --tenant-id 3eebca47-961f-4899-b976-a3d3208d326b --instance-id 1a6dc44b-19b9-4516-8d3f-9e2f4125b842",
          },
        ],
      },
      manual_restore_project: {
        decision_confirmed: true,
        confirmed_by: "业务负责人",
        confirmed_at: "2026-06-17T22:07:00+08:00",
        evidence:
          "docs/state_machine_migrate/2026-06-17-decoration-workflow-confirmation-request.md",
        project_id: "634ff402-ff84-4541-aa7c-3cdcd4fd5460",
        legacy_instance_id: "c435b9e9-0e22-49e7-9352-446259f9b57c",
        allowed_decision_options: [
          "continue_legacy_acceptance_until_completed",
          "define_new_construction_restore_point_and_script",
          "confirm_project_exception_closure_plan",
        ],
        selected_option: "continue_legacy_acceptance_until_completed",
      },
    },
    orange_e2e_acceptance_gate: {
      confirmed: true,
      confirmed_by: "Orange QA",
      confirmed_at: "2026-06-17T22:08:00+08:00",
      mini_program_version_or_commit: "b611426",
      tenant: "验收租户",
      accounts: "财务/业务员/施工人员",
      evidence:
        "docs/state_machine_migrate/2026-06-17-decoration-workflow-e2e-acceptance-checklist.md",
      required_scenarios: [
        { key: "customer_design_workflow", status: "passed" },
        { key: "project_signing_workflow", status: "passed" },
        { key: "payment_collection_workflow", status: "passed" },
        { key: "construction_procedure_log", status: "passed" },
        { key: "stage_acceptance_transition", status: "passed" },
        { key: "admin_finance_and_workflow_visibility", status: "passed" },
      ],
    },
    closeout_rules: {
      can_run_legacy_apply: true,
      can_close_prd_without_followup: true,
      reason: "All gates confirmed.",
    },
  };
}
