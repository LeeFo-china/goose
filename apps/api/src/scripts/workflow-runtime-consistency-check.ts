export type WorkflowRuntimeConsistencyCheckRow = {
  check_name: string;
  issue_count: number;
};

export type WorkflowRuntimeConsistencyReport = {
  generated_at: string;
  ok: boolean;
  total_issues: number;
  checks: WorkflowRuntimeConsistencyCheckRow[];
};

type EnvLike = Record<string, string | undefined>;
type CountRow = { issue_count: number };

export function resolveWorkflowRuntimeConsistencyDatabaseUrl(
  env: EnvLike = process.env,
): string | null {
  return env.SUPABASE_DB_URL || env.SUPABASE_DB_DIRECT_URL || null;
}

export function buildWorkflowRuntimeConsistencyReport(
  checks: WorkflowRuntimeConsistencyCheckRow[],
  generatedAt = new Date().toISOString(),
): WorkflowRuntimeConsistencyReport {
  const totalIssues = checks.reduce(
    (sum, check) => sum + check.issue_count,
    0,
  );

  return {
    generated_at: generatedAt,
    ok: totalIssues === 0,
    total_issues: totalIssues,
    checks,
  };
}

export async function runWorkflowRuntimeConsistencyCheck(databaseUrl: string) {
  const db = new Bun.SQL(databaseUrl);
  try {
    const checks: WorkflowRuntimeConsistencyCheckRow[] = [];

    checks.push({
      check_name: "running_instance_missing_subject_state",
      issue_count: await readIssueCount(db<CountRow[]>`
        select count(*)::int as issue_count
        from public.workflow_instances instance
        where instance.status = 'running'
          and instance.subject_type in ('customer', 'project', 'expense_request')
          and not exists (
            select 1
            from public.workflow_subject_states state
            where state.tenant_id = instance.tenant_id
              and state.subject_type = instance.subject_type
              and state.subject_id = instance.subject_id
          );
      `),
    });

    checks.push({
      check_name: "subject_state_missing_instance",
      issue_count: await readIssueCount(db<CountRow[]>`
        select count(*)::int as issue_count
        from public.workflow_subject_states state
        where state.instance_id is not null
          and not exists (
            select 1
            from public.workflow_instances instance
            where instance.id = state.instance_id
          );
      `),
    });

    checks.push({
      check_name: "subject_state_instance_identity_mismatch",
      issue_count: await readIssueCount(db<CountRow[]>`
        select count(*)::int as issue_count
        from public.workflow_subject_states state
        join public.workflow_instances instance
          on instance.id = state.instance_id
        where state.tenant_id <> instance.tenant_id
          or state.subject_type <> instance.subject_type
          or state.subject_id <> instance.subject_id
          or state.definition_id is distinct from instance.definition_id;
      `),
    });

    checks.push({
      check_name: "subject_state_instance_status_mismatch",
      issue_count: await readIssueCount(db<CountRow[]>`
        select count(*)::int as issue_count
        from public.workflow_subject_states state
        join public.workflow_instances instance
          on instance.id = state.instance_id
        where state.instance_status is distinct from instance.status;
      `),
    });

    checks.push({
      check_name: "subject_state_current_node_mismatch",
      issue_count: await readIssueCount(db<CountRow[]>`
        select count(*)::int as issue_count
        from public.workflow_subject_states state
        join public.workflow_instances instance
          on instance.id = state.instance_id
        where state.current_node_key is distinct from instance.current_node_key;
      `),
    });

    checks.push({
      check_name: "subject_state_pending_task_count_mismatch",
      issue_count: await readIssueCount(db<CountRow[]>`
        with pending_task_counts as (
          select tenant_id, instance_id, count(*)::int as pending_task_count
          from public.workflow_tasks
          where status = 'pending'
          group by tenant_id, instance_id
        )
        select count(*)::int as issue_count
        from public.workflow_subject_states state
        left join pending_task_counts task_counts
          on task_counts.tenant_id = state.tenant_id
         and task_counts.instance_id = state.instance_id
        where state.pending_task_count <> coalesce(task_counts.pending_task_count, 0);
      `),
    });

    checks.push({
      check_name: "running_instance_missing_current_node",
      issue_count: await readIssueCount(db<CountRow[]>`
        select count(*)::int as issue_count
        from public.workflow_instances instance
        where instance.status = 'running'
          and instance.current_node_key is null;
      `),
    });

    checks.push({
      check_name: "running_instance_multiple_current_nodes",
      issue_count: await readIssueCount(db<CountRow[]>`
        select count(*)::int as issue_count
        from (
          select node.instance_id
          from public.workflow_instance_nodes node
          join public.workflow_instances instance
            on instance.id = node.instance_id
          where instance.status = 'running'
            and node.status = 'running'
          group by node.instance_id
          having count(*) > 1
        ) duplicate_nodes;
      `),
    });

    checks.push({
      check_name: "running_instance_current_node_mismatch",
      issue_count: await readIssueCount(db<CountRow[]>`
        select count(*)::int as issue_count
        from public.workflow_instance_nodes node
        join public.workflow_instances instance
          on instance.id = node.instance_id
        where instance.status = 'running'
          and node.status = 'running'
          and node.node_key is distinct from instance.current_node_key;
      `),
    });

    checks.push({
      check_name: "pending_task_instance_not_running",
      issue_count: await readIssueCount(db<CountRow[]>`
        select count(*)::int as issue_count
        from public.workflow_tasks task
        left join public.workflow_instances instance
          on instance.id = task.instance_id
        where task.status = 'pending'
          and coalesce(instance.status, '') <> 'running';
      `),
    });

    checks.push({
      check_name: "pending_task_node_not_current",
      issue_count: await readIssueCount(db<CountRow[]>`
        select count(*)::int as issue_count
        from public.workflow_tasks task
        join public.workflow_instances instance
          on instance.id = task.instance_id
        where task.status = 'pending'
          and instance.status = 'running'
          and task.node_key is distinct from instance.current_node_key;
      `),
    });

    checks.push({
      check_name: "pending_task_missing_running_node_run",
      issue_count: await readIssueCount(db<CountRow[]>`
        select count(*)::int as issue_count
        from public.workflow_tasks task
        left join public.workflow_instance_nodes node
          on node.id = task.instance_node_id
         and node.status = 'running'
        where task.status = 'pending'
          and node.id is null;
      `),
    });

    return buildWorkflowRuntimeConsistencyReport(checks);
  } finally {
    await db.close();
  }
}

async function readIssueCount(query: Promise<CountRow[]>): Promise<number> {
  const rows = await query;
  return rows[0]?.issue_count ?? 0;
}

async function main() {
  const databaseUrl = resolveWorkflowRuntimeConsistencyDatabaseUrl();
  if (!databaseUrl) {
    console.error("缺少 SUPABASE_DB_URL 或 SUPABASE_DB_DIRECT_URL");
    process.exit(1);
  }

  const report = await runWorkflowRuntimeConsistencyCheck(databaseUrl);
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(1);
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(
      error instanceof Error ? error.message : "流程运行时一致性检查失败",
    );
    process.exit(1);
  });
}
