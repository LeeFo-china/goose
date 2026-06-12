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

async function runWorkflowRuntimeConsistencyCheck(databaseUrl: string) {
  const db = new Bun.SQL(databaseUrl);
  try {
    const rows = await db<WorkflowRuntimeConsistencyCheckRow[]>`
    with pending_task_counts as (
      select tenant_id, instance_id, count(*)::int as pending_task_count
      from public.workflow_tasks
      where status = 'pending'
      group by tenant_id, instance_id
    ),
    checks as (
      select
        1 as ord,
        'running_instance_missing_subject_state'::text as check_name,
        count(*)::int as issue_count
      from public.workflow_instances instance
      where instance.status = 'running'
        and instance.subject_type in ('customer', 'project', 'expense_request')
        and not exists (
          select 1
          from public.workflow_subject_states state
          where state.tenant_id = instance.tenant_id
            and state.subject_type = instance.subject_type
            and state.subject_id = instance.subject_id
        )
      union all
      select
        2,
        'subject_state_missing_instance',
        count(*)::int
      from public.workflow_subject_states state
      where state.instance_id is not null
        and not exists (
          select 1
          from public.workflow_instances instance
          where instance.id = state.instance_id
        )
      union all
      select
        3,
        'subject_state_instance_identity_mismatch',
        count(*)::int
      from public.workflow_subject_states state
      join public.workflow_instances instance
        on instance.id = state.instance_id
      where state.tenant_id <> instance.tenant_id
        or state.subject_type <> instance.subject_type
        or state.subject_id <> instance.subject_id
        or state.definition_id is distinct from instance.definition_id
      union all
      select
        4,
        'subject_state_instance_status_mismatch',
        count(*)::int
      from public.workflow_subject_states state
      join public.workflow_instances instance
        on instance.id = state.instance_id
      where state.instance_status is distinct from instance.status
      union all
      select
        5,
        'subject_state_current_node_mismatch',
        count(*)::int
      from public.workflow_subject_states state
      join public.workflow_instances instance
        on instance.id = state.instance_id
      where state.current_node_key is distinct from instance.current_node_key
      union all
      select
        6,
        'subject_state_pending_task_count_mismatch',
        count(*)::int
      from public.workflow_subject_states state
      left join pending_task_counts task_counts
        on task_counts.tenant_id = state.tenant_id
       and task_counts.instance_id = state.instance_id
      where state.pending_task_count <> coalesce(task_counts.pending_task_count, 0)
      union all
      select
        7,
        'running_instance_missing_current_node',
        count(*)::int
      from public.workflow_instances instance
      where instance.status = 'running'
        and instance.current_node_key is null
      union all
      select
        8,
        'running_instance_multiple_current_nodes',
        count(*)::int
      from (
        select node.instance_id
        from public.workflow_instance_nodes node
        join public.workflow_instances instance
          on instance.id = node.instance_id
        where instance.status = 'running'
          and node.status = 'running'
        group by node.instance_id
        having count(*) > 1
      ) duplicate_nodes
      union all
      select
        9,
        'running_instance_current_node_mismatch',
        count(*)::int
      from public.workflow_instances instance
      where instance.status = 'running'
        and exists (
          select 1
          from public.workflow_instance_nodes node
          where node.instance_id = instance.id
            and node.status = 'running'
            and node.node_key is distinct from instance.current_node_key
        )
      union all
      select
        10,
        'pending_task_instance_not_running',
        count(*)::int
      from public.workflow_tasks task
      left join public.workflow_instances instance
        on instance.id = task.instance_id
      where task.status = 'pending'
        and coalesce(instance.status, '') <> 'running'
      union all
      select
        11,
        'pending_task_node_not_current',
        count(*)::int
      from public.workflow_tasks task
      join public.workflow_instances instance
        on instance.id = task.instance_id
      where task.status = 'pending'
        and instance.status = 'running'
        and task.node_key is distinct from instance.current_node_key
      union all
      select
        12,
        'pending_task_missing_running_node_run',
        count(*)::int
      from public.workflow_tasks task
      left join public.workflow_instance_nodes node
        on node.id = task.instance_node_id
       and node.status = 'running'
      where task.status = 'pending'
        and node.id is null
    )
    select check_name, issue_count
    from checks
    order by ord;
    `;

    return buildWorkflowRuntimeConsistencyReport(rows);
  } finally {
    await db.close();
  }
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
