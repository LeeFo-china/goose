type RebuildMode = "dry-run" | "apply";
type RebuildSubjectType = "customer" | "project" | "expense_request";

type RebuildOptions = {
  mode: RebuildMode;
  tenantId: string | null;
  subjectType: RebuildSubjectType | null;
};

type RebuildSummaryRow = {
  subject_type: RebuildSubjectType;
  total_instances: number;
  missing_states: number;
  stale_states: number;
};

type RebuildApplyRow = {
  upserted_count: number;
};

type EnvLike = Record<string, string | undefined>;

const SUBJECT_TYPES: readonly RebuildSubjectType[] = [
  "customer",
  "project",
  "expense_request",
];

export function parseRebuildArgs(argv: string[]): RebuildOptions {
  const options: RebuildOptions = {
    mode: "dry-run",
    tenantId: null,
    subjectType: null,
  };
  let explicitDryRun = false;
  let explicitApply = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") continue;

    if (arg === "--dry-run") {
      explicitDryRun = true;
      options.mode = "dry-run";
      continue;
    }

    if (arg === "--apply") {
      explicitApply = true;
      options.mode = "apply";
      continue;
    }

    if (arg === "--tenant-id") {
      options.tenantId = argv[index + 1] || null;
      index += 1;
      continue;
    }

    if (arg === "--subject-type") {
      options.subjectType = parseSubjectType(argv[index + 1] || "");
      index += 1;
    }
  }

  if (explicitApply === explicitDryRun) {
    throw new Error("请且只请传 --dry-run 或 --apply");
  }

  return options;
}

export function resolveRebuildDatabaseUrl(
  env: EnvLike = process.env,
): string | null {
  return env.SUPABASE_DB_URL || env.SUPABASE_DB_DIRECT_URL || null;
}

async function summarizeSubjectStates(
  db: Bun.SQL,
  options: RebuildOptions,
): Promise<RebuildSummaryRow[]> {
  return db<RebuildSummaryRow[]>`
    with latest_instances as (
      select distinct on (instance.tenant_id, instance.subject_type, instance.subject_id)
        instance.id,
        instance.tenant_id,
        instance.definition_id,
        instance.subject_type,
        instance.subject_id,
        instance.status,
        instance.current_node_key,
        instance.current_node_snapshot,
        instance.started_at,
        instance.created_at,
        instance.updated_at
      from public.workflow_instances instance
      where instance.subject_type in ('customer', 'project', 'expense_request')
        and (${options.tenantId}::uuid is null or instance.tenant_id = ${options.tenantId}::uuid)
        and (${options.subjectType}::text is null or instance.subject_type = ${options.subjectType})
      order by
        instance.tenant_id,
        instance.subject_type,
        instance.subject_id,
        case when instance.status = 'running' then 0 else 1 end,
        instance.started_at desc,
        instance.created_at desc,
        instance.updated_at desc,
        instance.id desc
    ),
    pending_task_counts as (
      select tenant_id, instance_id, count(*)::int as pending_task_count
      from public.workflow_tasks
      where status = 'pending'
        and (${options.tenantId}::uuid is null or tenant_id = ${options.tenantId}::uuid)
      group by tenant_id, instance_id
    )
    select
      latest.subject_type::text as subject_type,
      count(*)::int as total_instances,
      count(*) filter (where state.id is null)::int as missing_states,
      count(*) filter (
        where state.id is not null
          and (
            state.definition_id is distinct from latest.definition_id
            or state.instance_id is distinct from latest.id
            or state.instance_status is distinct from latest.status
            or state.current_node_key is distinct from latest.current_node_key
            or state.current_node_title is distinct from nullif(btrim(latest.current_node_snapshot->>'title'), '')
            or state.current_business_kind is distinct from nullif(btrim(latest.current_node_snapshot->>'business_kind'), '')
            or state.pending_task_count is distinct from coalesce(task_counts.pending_task_count, 0)
          )
      )::int as stale_states
    from latest_instances latest
    left join pending_task_counts task_counts
      on task_counts.tenant_id = latest.tenant_id
     and task_counts.instance_id = latest.id
    left join public.workflow_subject_states state
      on state.tenant_id = latest.tenant_id
     and state.subject_type = latest.subject_type
     and state.subject_id = latest.subject_id
    group by latest.subject_type
    order by latest.subject_type;
  `;
}

async function rebuildSubjectStates(
  db: Bun.SQL,
  options: RebuildOptions,
): Promise<number> {
  const rows = await db<RebuildApplyRow[]>`
    with latest_instances as (
      select distinct on (instance.tenant_id, instance.subject_type, instance.subject_id)
        instance.id,
        instance.tenant_id,
        instance.definition_id,
        instance.subject_type,
        instance.subject_id,
        instance.status,
        instance.current_node_key,
        instance.current_node_snapshot,
        instance.started_at,
        instance.created_at,
        instance.updated_at
      from public.workflow_instances instance
      where instance.subject_type in ('customer', 'project', 'expense_request')
        and (${options.tenantId}::uuid is null or instance.tenant_id = ${options.tenantId}::uuid)
        and (${options.subjectType}::text is null or instance.subject_type = ${options.subjectType})
      order by
        instance.tenant_id,
        instance.subject_type,
        instance.subject_id,
        case when instance.status = 'running' then 0 else 1 end,
        instance.started_at desc,
        instance.created_at desc,
        instance.updated_at desc,
        instance.id desc
    ),
    pending_task_counts as (
      select tenant_id, instance_id, count(*)::int as pending_task_count
      from public.workflow_tasks
      where status = 'pending'
        and (${options.tenantId}::uuid is null or tenant_id = ${options.tenantId}::uuid)
      group by tenant_id, instance_id
    ),
    upserted as (
      insert into public.workflow_subject_states (
        tenant_id,
        subject_type,
        subject_id,
        definition_id,
        instance_id,
        instance_status,
        current_node_key,
        current_node_title,
        current_business_kind,
        pending_task_count
      )
      select
        latest.tenant_id,
        latest.subject_type,
        latest.subject_id,
        latest.definition_id,
        latest.id,
        latest.status,
        latest.current_node_key,
        nullif(btrim(latest.current_node_snapshot->>'title'), ''),
        nullif(btrim(latest.current_node_snapshot->>'business_kind'), ''),
        coalesce(task_counts.pending_task_count, 0)
      from latest_instances latest
      left join pending_task_counts task_counts
        on task_counts.tenant_id = latest.tenant_id
       and task_counts.instance_id = latest.id
      on conflict (tenant_id, subject_type, subject_id)
      do update set
        definition_id = excluded.definition_id,
        instance_id = excluded.instance_id,
        instance_status = excluded.instance_status,
        current_node_key = excluded.current_node_key,
        current_node_title = excluded.current_node_title,
        current_business_kind = excluded.current_business_kind,
        pending_task_count = excluded.pending_task_count
      returning id
    )
    select count(*)::int as upserted_count
    from upserted;
  `;

  return rows[0]?.upserted_count ?? 0;
}

function parseSubjectType(value: string): RebuildSubjectType {
  if (SUBJECT_TYPES.includes(value as RebuildSubjectType)) {
    return value as RebuildSubjectType;
  }
  throw new Error("--subject-type 必须是 customer、project 或 expense_request");
}

async function main() {
  const options = parseRebuildArgs(process.argv.slice(2));
  const databaseUrl = resolveRebuildDatabaseUrl();
  if (!databaseUrl) {
    throw new Error("缺少 SUPABASE_DB_URL 或 SUPABASE_DB_DIRECT_URL");
  }

  const db = new Bun.SQL(databaseUrl);
  try {
    const before = await summarizeSubjectStates(db, options);
    const upserted = options.mode === "apply"
      ? await rebuildSubjectStates(db, options)
      : 0;
    const after = options.mode === "apply"
      ? await summarizeSubjectStates(db, options)
      : before;

    console.log(JSON.stringify({
      mode: options.mode,
      tenant_id: options.tenantId,
      subject_type: options.subjectType,
      before,
      upserted,
      after,
    }, null, 2));
  } finally {
    await db.close();
  }
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(
      error instanceof Error ? error.message : "重建 workflow subject state 失败",
    );
    process.exit(1);
  });
}
