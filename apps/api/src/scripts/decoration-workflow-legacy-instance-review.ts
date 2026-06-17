import {
  closeSqlWithTimeout,
  resolveScriptDatabaseUrl,
} from "./workflow-script-database";

export type DecorationLegacyWorkflowReviewClassification =
  | "compatible_runtime"
  | "rebuild_candidate"
  | "manual_restore_required"
  | "unknown_review_required";

export type DecorationWorkflowLegacyInstanceReviewInput = {
  tenant_id: string;
  definition_id: string;
  workflow_key: string;
  instance_id: string;
  subject_type: string;
  subject_id: string;
  subject_title: string | null;
  current_node_key: string | null;
  subject_status: string | null;
};

export type DecorationWorkflowLegacyInstanceReviewDecision = {
  classification: DecorationLegacyWorkflowReviewClassification;
  recommended_action: string;
  recommended_workflow_key: string | null;
  reason: string;
};

export type DecorationWorkflowLegacyActionCommands = {
  dry_run: string | null;
  apply: string | null;
  note: string;
};

export type DecorationWorkflowLegacyInstanceReviewItem =
  & DecorationWorkflowLegacyInstanceReviewInput
  & DecorationWorkflowLegacyInstanceReviewDecision
  & {
    action_commands: DecorationWorkflowLegacyActionCommands;
  };

export type DecorationWorkflowLegacyInstanceReviewTotals = Record<
  DecorationLegacyWorkflowReviewClassification,
  number
>;

export type DecorationWorkflowLegacyInstanceReviewReport = {
  generated_at: string;
  ok: boolean;
  sample_size: number;
  needs_rebuild: boolean;
  needs_manual_restore: boolean;
  has_unknown_review_required: boolean;
  totals: DecorationWorkflowLegacyInstanceReviewTotals;
  items: DecorationWorkflowLegacyInstanceReviewItem[];
};

export type DecorationWorkflowLegacyInstanceReviewConfig = {
  sampleLimit: number;
};

type BuildReportInput = {
  generatedAt?: string;
  items: DecorationWorkflowLegacyInstanceReviewInput[];
};

type EnvLike = Record<string, string | undefined>;

const DEFAULT_SAMPLE_LIMIT = 100;
const MAX_SAMPLE_LIMIT = 500;
const UUID_PATTERN =
  "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$";

const CUSTOMER_COMPATIBLE_NODE_KEYS = new Set([
  "potential",
  "following",
  "arrived",
  "designing",
  "signed",
]);

const CLOSED_CUSTOMER_STATUS_KEYS = new Set([
  "dormant",
  "invalid",
]);

const PROJECT_SIGNING_NODE_KEYS = new Set([
  "designing",
  "proposal_confirmed",
  "signed",
  "design_finalized",
  "pending_start",
]);

const PROJECT_SIGNING_STATUS_KEYS = new Set([
  "designing",
  "proposal_confirmed",
  "signed",
  "design_finalized",
  "pending_start",
]);

const LATE_STAGE_PROJECT_NODE_KEYS = new Set([
  "started",
  "construction_start",
  "constructing",
  "procedure_demolition",
  "procedure_plumbing_electrical",
  "payment_stage_2",
  "procedure_tiling",
  "procedure_woodwork",
  "payment_stage_3",
  "procedure_painting",
  "procedure_installation",
  "final_acceptance",
  "handover",
  "acceptance",
  "completed",
]);

const LATE_STAGE_PROJECT_STATUS_KEYS = new Set([
  "started",
  "constructing",
  "acceptance",
  "completed",
]);

const EMPTY_TOTALS: DecorationWorkflowLegacyInstanceReviewTotals = {
  compatible_runtime: 0,
  rebuild_candidate: 0,
  manual_restore_required: 0,
  unknown_review_required: 0,
};

export function parseDecorationWorkflowLegacyInstanceReviewArgs(
  args: string[],
): DecorationWorkflowLegacyInstanceReviewConfig {
  const config: DecorationWorkflowLegacyInstanceReviewConfig = {
    sampleLimit: DEFAULT_SAMPLE_LIMIT,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--sample-limit") {
      const value = args[index + 1];
      if (!value) throw new Error("--sample-limit requires a value");
      config.sampleLimit = parseSampleLimit(value);
      index += 1;
      continue;
    }

    throw new Error(`Unsupported argument: ${arg}`);
  }

  return config;
}

export function resolveDecorationWorkflowLegacyInstanceReviewDatabaseUrl(
  env: EnvLike = process.env,
): string | null {
  return resolveScriptDatabaseUrl(env);
}

export function classifyDecorationWorkflowLegacyInstance(
  input: DecorationWorkflowLegacyInstanceReviewInput,
): DecorationWorkflowLegacyInstanceReviewDecision {
  const currentNodeKey = input.current_node_key ?? "";
  const subjectStatus = input.subject_status ?? "";

  if (
    input.workflow_key === "customer_main" &&
    input.subject_type === "customer" &&
    CUSTOMER_COMPATIBLE_NODE_KEYS.has(currentNodeKey)
  ) {
    if (CLOSED_CUSTOMER_STATUS_KEYS.has(subjectStatus)) {
      return {
        classification: "manual_restore_required",
        recommended_action: "confirm_customer_status_before_continue",
        recommended_workflow_key: null,
        reason: "客户已是关闭状态但旧流程仍在运行，需人工确认是否取消或恢复实例。",
      };
    }

    return {
      classification: "compatible_runtime",
      recommended_action: "continue_current_task",
      recommended_workflow_key: "customer_main",
      reason: "旧客户流程节点已有运行时兼容，可继续完成当前待办。",
    };
  }

  if (
    input.subject_type === "project" &&
    PROJECT_SIGNING_NODE_KEYS.has(currentNodeKey)
  ) {
    if (PROJECT_SIGNING_STATUS_KEYS.has(subjectStatus)) {
      return {
        classification: "rebuild_candidate",
        recommended_action: "dry_run_then_rebuild_project_signing",
        recommended_workflow_key: "project_signing",
        reason: "旧项目实例处于签约阶段节点，应先 dry-run，再受控重建到 project_signing。",
      };
    }

    return {
      classification: "manual_restore_required",
      recommended_action: "define_restore_point_before_rebuild",
      recommended_workflow_key: null,
      reason: "旧项目实例节点与项目状态不一致，需人工确认恢复点。",
    };
  }

  if (
    input.subject_type === "project" &&
    (
      LATE_STAGE_PROJECT_NODE_KEYS.has(currentNodeKey) ||
      LATE_STAGE_PROJECT_STATUS_KEYS.has(subjectStatus)
    )
  ) {
    return {
      classification: "manual_restore_required",
      recommended_action: "define_restore_point_before_rebuild",
      recommended_workflow_key: null,
      reason: "旧项目实例已进入施工后段，不能直接重建到新流程起点。",
    };
  }

  return {
    classification: "unknown_review_required",
    recommended_action: "manual_review",
    recommended_workflow_key: null,
    reason: "旧实例状态无法自动归类，需人工核对当前节点和业务状态。",
  };
}

export function buildDecorationWorkflowLegacyInstanceReviewReport(
  input: BuildReportInput,
): DecorationWorkflowLegacyInstanceReviewReport {
  const items = input.items.map((item) => {
    const decision = classifyDecorationWorkflowLegacyInstance(item);
    return {
      ...item,
      ...decision,
      action_commands: buildActionCommands(item, decision),
    };
  });
  const totals = items.reduce<DecorationWorkflowLegacyInstanceReviewTotals>(
    (summary, item) => ({
      ...summary,
      [item.classification]: summary[item.classification] + 1,
    }),
    { ...EMPTY_TOTALS },
  );

  return {
    generated_at: input.generatedAt ?? new Date().toISOString(),
    ok: totals.unknown_review_required === 0,
    sample_size: items.length,
    needs_rebuild: totals.rebuild_candidate > 0,
    needs_manual_restore: totals.manual_restore_required > 0,
    has_unknown_review_required: totals.unknown_review_required > 0,
    totals,
    items,
  };
}

function buildActionCommands(
  item: DecorationWorkflowLegacyInstanceReviewInput,
  decision: DecorationWorkflowLegacyInstanceReviewDecision,
): DecorationWorkflowLegacyActionCommands {
  if (
    decision.classification === "rebuild_candidate" &&
    decision.recommended_workflow_key
  ) {
    const dryRun = [
      "bun --env-file=.env.local apps/api/src/scripts/decoration-workflow-legacy-rebuild.ts",
      `--tenant-id ${item.tenant_id}`,
      `--subject-type ${item.subject_type}`,
      `--subject-id ${item.subject_id}`,
      `--workflow-key ${decision.recommended_workflow_key}`,
    ].join(" ");

    return {
      dry_run: dryRun,
      apply: [
        "bun --env-file=.env.local apps/api/src/scripts/decoration-workflow-legacy-rebuild.ts",
        "--apply",
        `--confirm-rebuild ${item.subject_id}`,
        `--tenant-id ${item.tenant_id}`,
        `--subject-type ${item.subject_type}`,
        `--subject-id ${item.subject_id}`,
        `--workflow-key ${decision.recommended_workflow_key}`,
      ].join(" "),
      note: "先执行 dry-run，业务确认后才允许执行 apply。",
    };
  }

  if (
    item.subject_type === "customer" &&
    decision.recommended_action === "confirm_customer_status_before_continue"
  ) {
    const dryRun = [
      "bun --env-file=.env.local apps/api/src/scripts/decoration-workflow-legacy-cancel.ts",
      `--tenant-id ${item.tenant_id}`,
      `--instance-id ${item.instance_id}`,
    ].join(" ");

    return {
      dry_run: dryRun,
      apply: [
        "bun --env-file=.env.local apps/api/src/scripts/decoration-workflow-legacy-cancel.ts",
        "--apply",
        `--confirm-cancel ${item.instance_id}`,
        `--tenant-id ${item.tenant_id}`,
        `--instance-id ${item.instance_id}`,
      ].join(" "),
      note: "仅用于客户已关闭但旧流程仍 running 的实例，业务确认后才允许执行 apply。",
    };
  }

  if (decision.classification === "compatible_runtime") {
    return {
      dry_run: null,
      apply: null,
      note: "通过当前 workflow task 和后端返回的 actions 继续推进，不生成脚本命令。",
    };
  }

  return {
    dry_run: null,
    apply: null,
    note: "需先定义人工恢复点或取消方案，不生成自动处置命令。",
  };
}

export async function runDecorationWorkflowLegacyInstanceReview(
  databaseUrl: string,
  config: DecorationWorkflowLegacyInstanceReviewConfig = {
    sampleLimit: DEFAULT_SAMPLE_LIMIT,
  },
): Promise<DecorationWorkflowLegacyInstanceReviewReport> {
  const db = new Bun.SQL(databaseUrl);
  try {
    const items = await readLegacyInstances(db, config.sampleLimit);
    return buildDecorationWorkflowLegacyInstanceReviewReport({ items });
  } finally {
    await closeSqlWithTimeout(db);
  }
}

async function readLegacyInstances(
  db: Bun.SQL,
  sampleLimit: number,
): Promise<DecorationWorkflowLegacyInstanceReviewInput[]> {
  return db<DecorationWorkflowLegacyInstanceReviewInput[]>`
    select
      instance.tenant_id::text,
      instance.definition_id::text,
      definition.workflow_key,
      instance.id::text as instance_id,
      instance.subject_type,
      instance.subject_id,
      coalesce(customer.name, project.name) as subject_title,
      instance.current_node_key,
      coalesce(customer.status, project.status) as subject_status
    from public.workflow_instances instance
    join public.workflow_definitions definition
      on definition.id = instance.definition_id
    join public.workflow_versions version
      on version.id = instance.version_id
    left join public.customers customer
      on instance.subject_type = 'customer'
     and instance.subject_id ~* ${UUID_PATTERN}
     and customer.id = instance.subject_id::uuid
    left join public.projects project
      on instance.subject_type = 'project'
     and instance.subject_id ~* ${UUID_PATTERN}
     and project.id = instance.subject_id::uuid
    where instance.status = 'running'
      and (
        (
          definition.workflow_key = 'customer_main'
          and exists (
            select 1
            from jsonb_array_elements(version.snapshot -> 'nodes') node
            where node ->> 'node_key' = 'signed'
               or node ->> 'business_kind' = 'contract'
          )
        )
        or (
          definition.workflow_key in ('construction_main', 'project_main')
          and exists (
            select 1
            from jsonb_array_elements(version.snapshot -> 'nodes') node
            where node ->> 'node_key' in (
              'designing',
              'proposal_confirmed',
              'signed',
              'design_finalized',
              'pending_start',
              'on_hold',
              'invalid'
            )
          )
        )
      )
    order by instance.updated_at desc
    limit ${sampleLimit};
  `;
}

function parseSampleLimit(value: string): number {
  const parsed = Number(value);
  if (
    !Number.isInteger(parsed) ||
    parsed < 1 ||
    parsed > MAX_SAMPLE_LIMIT
  ) {
    throw new Error(`sample-limit must be an integer between 1 and ${MAX_SAMPLE_LIMIT}`);
  }

  return parsed;
}

async function main() {
  const config = parseDecorationWorkflowLegacyInstanceReviewArgs(
    Bun.argv.slice(2),
  );
  const databaseUrl = resolveDecorationWorkflowLegacyInstanceReviewDatabaseUrl();
  if (!databaseUrl) {
    console.error("缺少 SUPABASE_DB_URL 或 SUPABASE_DB_DIRECT_URL");
    process.exit(1);
  }

  const report = await runDecorationWorkflowLegacyInstanceReview(
    databaseUrl,
    config,
  );
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(1);
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
