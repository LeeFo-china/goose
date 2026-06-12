import {
  buildFinalCompletionAuditReport,
  parseFinalAuditArgs,
  type FinalAuditCheck,
  type FinalAuditReport,
} from "./workflow-final-completion-audit";

export type WorkflowMigrationStatusItem = {
  phase: string;
  check: string;
  detail: string;
  next_action: string;
};

export type WorkflowMigrationStatusReport = {
  ok: boolean;
  generated_at: string;
  completed_checks: string[];
  blockers: WorkflowMigrationStatusItem[];
};

const CHECK_GUIDANCE: Record<string, { phase: string; next_action: string }> = {
  no_pending_migrations: {
    phase: "Phase 6",
    next_action: "Apply the destructive cleanup migration pair after manual gates pass.",
  },
  migration_list_aligned: {
    phase: "Phase 6",
    next_action: "Use workflow:migration-status or workflow:final-completion-audit to verify local and remote migration history alignment after target apply.",
  },
  cleanup_readiness: {
    phase: "Phase 7",
    next_action: "Remove remaining production references to the old state machine.",
  },
  destructive_cleanup_verify: {
    phase: "Phase 6",
    next_action: "Run workflow:destructive-cleanup-verify after destructive apply.",
  },
  generated_database_types_clean: {
    phase: "Phase 6",
    next_action: "Regenerate apps/api/src/types/database.ts after destructive apply.",
  },
  manual_gate_evidence: {
    phase: "Phase 4/5/External Gates",
    next_action: "Complete manual-gates.json with backfill, smoke, mini-program, admin, and backup evidence.",
  },
  final_breaking_commit_documented: {
    phase: "Final Audit",
    next_action: "Make the final cleanup commit with a breaking-change marker and DB cleanup context.",
  },
};

export function buildWorkflowMigrationStatusReport(
  audit: FinalAuditReport,
): WorkflowMigrationStatusReport {
  return {
    ok: audit.ok,
    generated_at: audit.generated_at,
    completed_checks: audit.checks
      .filter((check) => check.ok)
      .map((check) => check.name),
    blockers: audit.checks
      .filter((check) => !check.ok)
      .map(toStatusItem),
  };
}

function toStatusItem(check: FinalAuditCheck): WorkflowMigrationStatusItem {
  const guidance = CHECK_GUIDANCE[check.name] ?? {
    phase: "Unknown",
    next_action: "Inspect the failed final audit check and add a targeted gate.",
  };
  return {
    phase: guidance.phase,
    check: check.name,
    detail: check.detail,
    next_action: guidance.next_action,
  };
}

async function main() {
  const audit = await buildFinalCompletionAuditReport(
    parseFinalAuditArgs(process.argv.slice(2)).evidenceFile,
  );
  console.log(JSON.stringify(buildWorkflowMigrationStatusReport(audit), null, 2));
  if (!audit.ok) process.exit(1);
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(
      error instanceof Error ? error.message : "流程迁移状态摘要失败",
    );
    process.exit(1);
  });
}
