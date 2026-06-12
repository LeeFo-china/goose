import { runWorkflowRuntimeConsistencyCheck } from "./workflow-runtime-consistency-check";

type EnvLike = Record<string, string | undefined>;

export type CleanupVerifyCheck = {
  name: string;
  ok: boolean;
  detail: string;
};

export type LegacyObjectPresence = Record<string, boolean>;

export type LegacyCleanupInventory = {
  tables: LegacyObjectPresence;
  rpc: LegacyObjectPresence;
  expenseColumns: LegacyObjectPresence;
  indexes: LegacyObjectPresence;
  policies: LegacyObjectPresence;
};

export type WorkflowDestructiveCleanupVerifyReport = {
  ok: boolean;
  generated_at: string;
  checks: CleanupVerifyCheck[];
};

type PresenceRow = {
  object_name: string;
  present: boolean;
};

const LEGACY_TABLES = [
  "customer_status_transition_logs",
  "project_status_transition_logs",
  "expense_request_approval_chains",
] as const;

const LEGACY_RPC_SIGNATURES = [
  "schedule_project_construction_transition(uuid,uuid,text,text,text,uuid,uuid,uuid,text,jsonb)",
] as const;

const LEGACY_EXPENSE_COLUMNS = [
  "current_step",
  "current_step_role",
] as const;

const LEGACY_INDEXES = [
  "idx_expense_requests_current_step",
  "customer_status_transition_logs_customer_created_idx",
  "customer_status_transition_logs_tenant_created_idx",
  "customer_status_transition_logs_action_idx",
  "project_status_transition_logs_project_created_idx",
  "project_status_transition_logs_tenant_created_idx",
  "project_status_transition_logs_action_idx",
  "idx_expense_request_approval_chains_request_id",
  "idx_expense_request_approval_chains_assignee_status",
  "idx_expense_request_approval_chains_step_status",
  "expense_request_approval_chains_tenant_assignee_status_idx",
] as const;

const LEGACY_POLICIES = [
  "expense_requests.Approvers view pending",
] as const;

export function resolveWorkflowDestructiveCleanupVerifyDatabaseUrl(
  env: EnvLike = process.env,
): string | null {
  return env.SUPABASE_DB_DIRECT_URL || env.SUPABASE_DB_URL || null;
}

export function buildAbsenceCheck(
  name: string,
  presence: LegacyObjectPresence,
): CleanupVerifyCheck {
  const presentObjects = Object.entries(presence)
    .filter(([, present]) => present)
    .map(([objectName]) => objectName);

  return {
    name,
    ok: presentObjects.length === 0,
    detail: presentObjects.length > 0
      ? `present=${presentObjects.join(", ")}`
      : `absent=${Object.keys(presence).join(", ")}`,
  };
}

export function buildWorkflowDestructiveCleanupVerifyReport(
  inventory: LegacyCleanupInventory,
  runtimeConsistency: { ok: boolean; total_issues: number },
  generatedAt = new Date().toISOString(),
): WorkflowDestructiveCleanupVerifyReport {
  const checks: CleanupVerifyCheck[] = [
    buildAbsenceCheck("legacy_tables_absent", inventory.tables),
    buildAbsenceCheck("legacy_rpc_absent", inventory.rpc),
    buildAbsenceCheck(
      "legacy_expense_columns_absent",
      inventory.expenseColumns,
    ),
    buildAbsenceCheck("legacy_indexes_absent", inventory.indexes),
    buildAbsenceCheck("legacy_policies_absent", inventory.policies),
    {
      name: "workflow_runtime_consistency",
      ok: runtimeConsistency.ok,
      detail: `total_issues=${runtimeConsistency.total_issues}`,
    },
  ];

  return {
    ok: checks.every((check) => check.ok),
    generated_at: generatedAt,
    checks,
  };
}

export async function runWorkflowDestructiveCleanupVerify(databaseUrl: string) {
  const inventory = await loadLegacyCleanupInventory(databaseUrl);
  const runtimeConsistency = await runWorkflowRuntimeConsistencyCheck(
    databaseUrl,
  );
  return buildWorkflowDestructiveCleanupVerifyReport(
    inventory,
    runtimeConsistency,
  );
}

async function loadLegacyCleanupInventory(
  databaseUrl: string,
): Promise<LegacyCleanupInventory> {
  const db = new Bun.SQL(databaseUrl);
  try {
    const [tables, rpc, expenseColumns, indexes, policies] = await Promise.all([
      db<PresenceRow[]>`
        with legacy(object_name) as (
          values
            ($$customer_status_transition_logs$$),
            ($$project_status_transition_logs$$),
            ($$expense_request_approval_chains$$)
        )
        select
          object_name,
          to_regclass(format($$public.%I$$, object_name)) is not null as present
        from legacy;
      `,
      db<PresenceRow[]>`
        with legacy(object_name, function_name) as (
          values (
            $$schedule_project_construction_transition(uuid,uuid,text,text,text,uuid,uuid,uuid,text,jsonb)$$,
            $$schedule_project_construction_transition$$
          )
        )
        select
          object_name,
          exists (
            select 1
            from pg_proc
            where pronamespace = $$public$$::regnamespace
              and proname = function_name
          ) as present
        from legacy;
      `,
      db<PresenceRow[]>`
        with legacy(object_name) as (
          values ($$current_step$$), ($$current_step_role$$)
        )
        select
          legacy.object_name,
          columns.column_name is not null as present
        from legacy
        left join information_schema.columns columns
          on columns.table_schema = $$public$$
         and columns.table_name = $$expense_requests$$
         and columns.column_name = legacy.object_name;
      `,
      db<PresenceRow[]>`
        with legacy(object_name) as (
          values
            ($$idx_expense_requests_current_step$$),
            ($$customer_status_transition_logs_customer_created_idx$$),
            ($$customer_status_transition_logs_tenant_created_idx$$),
            ($$customer_status_transition_logs_action_idx$$),
            ($$project_status_transition_logs_project_created_idx$$),
            ($$project_status_transition_logs_tenant_created_idx$$),
            ($$project_status_transition_logs_action_idx$$),
            ($$idx_expense_request_approval_chains_request_id$$),
            ($$idx_expense_request_approval_chains_assignee_status$$),
            ($$idx_expense_request_approval_chains_step_status$$),
            ($$expense_request_approval_chains_tenant_assignee_status_idx$$)
        )
        select
          object_name,
          to_regclass(format($$public.%I$$, object_name)) is not null as present
        from legacy;
      `,
      db<PresenceRow[]>`
        with legacy(object_name, table_name, policy_name) as (
          values (
            $$expense_requests.Approvers view pending$$,
            $$expense_requests$$,
            $$Approvers view pending$$
          )
        )
        select
          object_name,
          exists (
            select 1
            from pg_policies
            where schemaname = $$public$$
              and tablename = table_name
              and policyname = policy_name
          ) as present
        from legacy;
      `,
    ]);

    return {
      tables: toPresenceMap(tables, LEGACY_TABLES),
      rpc: toPresenceMap(rpc, LEGACY_RPC_SIGNATURES),
      expenseColumns: toPresenceMap(expenseColumns, LEGACY_EXPENSE_COLUMNS),
      indexes: toPresenceMap(indexes, LEGACY_INDEXES),
      policies: toPresenceMap(policies, LEGACY_POLICIES),
    };
  } finally {
    await db.close();
  }
}

function toPresenceMap(
  rows: PresenceRow[],
  expectedObjects: readonly string[],
): LegacyObjectPresence {
  const presence = Object.fromEntries(
    expectedObjects.map((objectName) => [objectName, false]),
  ) as LegacyObjectPresence;
  for (const row of rows) {
    presence[row.object_name] = row.present;
  }
  return presence;
}

async function main() {
  const databaseUrl = resolveWorkflowDestructiveCleanupVerifyDatabaseUrl();
  if (!databaseUrl) {
    console.error("缺少 SUPABASE_DB_DIRECT_URL 或 SUPABASE_DB_URL");
    process.exit(1);
  }

  const report = await runWorkflowDestructiveCleanupVerify(databaseUrl);
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(1);
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(
      error instanceof Error ? error.message : "破坏性清理后验证失败",
    );
    process.exit(1);
  });
}
