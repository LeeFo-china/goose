import {
  closeSqlWithTimeout,
  resolveScriptDatabaseUrl,
} from "./workflow-script-database";

export type DecorationWorkflowBusinessAuditCheck = {
  check_name: string;
  issue_count: number;
};

export type DecorationWorkflowAffectedInstance = {
  tenant_id: string;
  definition_id: string;
  workflow_key: string;
  instance_id: string;
  subject_type: string;
  subject_id: string;
  current_node_key: string | null;
  issue_code: string;
};

export type DecorationWorkflowBusinessAuditReport = {
  generated_at: string;
  ok: boolean;
  needs_migration: boolean;
  needs_instance_review: boolean;
  total_issues: number;
  checks: DecorationWorkflowBusinessAuditCheck[];
  affected_instances: DecorationWorkflowAffectedInstance[];
};

export type DecorationWorkflowBusinessAuditConfig = {
  sampleLimit: number;
  strict: boolean;
};

type BuildReportInput = {
  generatedAt?: string;
  checks: DecorationWorkflowBusinessAuditCheck[];
  affectedInstances: DecorationWorkflowAffectedInstance[];
};

type EnvLike = Record<string, string | undefined>;

type CountRow = {
  issue_count: number;
};

const DEFAULT_SAMPLE_LIMIT = 100;
const MAX_SAMPLE_LIMIT = 500;
const INSTANCE_REVIEW_CHECK_NAMES = new Set([
  "running_instances_on_legacy_snapshots",
]);

export function parseDecorationWorkflowBusinessAuditArgs(
  args: string[],
): DecorationWorkflowBusinessAuditConfig {
  const config: DecorationWorkflowBusinessAuditConfig = {
    sampleLimit: DEFAULT_SAMPLE_LIMIT,
    strict: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--strict") {
      config.strict = true;
      continue;
    }

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

export function resolveDecorationWorkflowBusinessAuditDatabaseUrl(
  env: EnvLike = process.env,
): string | null {
  return resolveScriptDatabaseUrl(env);
}

export function buildDecorationWorkflowBusinessAuditReport(
  input: BuildReportInput,
): DecorationWorkflowBusinessAuditReport {
  const totalIssues = input.checks.reduce(
    (sum, check) => sum + check.issue_count,
    0,
  );
  const migrationIssues = input.checks
    .filter((check) => !INSTANCE_REVIEW_CHECK_NAMES.has(check.check_name))
    .reduce((sum, check) => sum + check.issue_count, 0);
  const instanceReviewIssues = input.checks
    .filter((check) => INSTANCE_REVIEW_CHECK_NAMES.has(check.check_name))
    .reduce((sum, check) => sum + check.issue_count, 0);

  return {
    generated_at: input.generatedAt ?? new Date().toISOString(),
    ok: totalIssues === 0,
    needs_migration: migrationIssues > 0,
    needs_instance_review: instanceReviewIssues > 0 ||
      input.affectedInstances.length > 0,
    total_issues: totalIssues,
    checks: input.checks,
    affected_instances: input.affectedInstances,
  };
}

export async function runDecorationWorkflowBusinessAudit(
  databaseUrl: string,
  config: DecorationWorkflowBusinessAuditConfig = {
    sampleLimit: DEFAULT_SAMPLE_LIMIT,
    strict: false,
  },
): Promise<DecorationWorkflowBusinessAuditReport> {
  const db = new Bun.SQL(databaseUrl);
  try {
    const checks = await readAuditChecks(db);
    const affectedInstances = await readAffectedInstances(
      db,
      config.sampleLimit,
    );

    return buildDecorationWorkflowBusinessAuditReport({
      checks,
      affectedInstances,
    });
  } finally {
    await closeSqlWithTimeout(db);
  }
}

async function readAuditChecks(
  db: Bun.SQL,
): Promise<DecorationWorkflowBusinessAuditCheck[]> {
  return [
    {
      check_name: "active_customer_main_contains_signed_node",
      issue_count: await readIssueCount(db<CountRow[]>`
        select count(*)::int as issue_count
        from public.workflow_definitions definition
        join public.workflow_versions version
          on version.id = definition.active_version_id
        where definition.status = 'active'
          and definition.workflow_key = 'customer_main'
          and exists (
            select 1
            from jsonb_array_elements(version.snapshot -> 'nodes') node
            where node ->> 'node_key' = 'signed'
               or node ->> 'business_kind' = 'contract'
          );
      `),
    },
    {
      check_name: "active_construction_main_contains_project_signing_nodes",
      issue_count: await readIssueCount(db<CountRow[]>`
        select count(*)::int as issue_count
        from public.workflow_definitions definition
        join public.workflow_versions version
          on version.id = definition.active_version_id
        where definition.status = 'active'
          and definition.workflow_key = 'construction_main'
          and exists (
            select 1
            from jsonb_array_elements(version.snapshot -> 'nodes') node
            where node ->> 'node_key' in (
              'designing',
              'proposal_confirmed',
              'signed',
              'design_finalized',
              'pending_start'
            )
               or node ->> 'business_kind' = 'contract'
          );
      `),
    },
    {
      check_name: "active_project_workflow_contains_exception_nodes",
      issue_count: await readIssueCount(db<CountRow[]>`
        select count(*)::int as issue_count
        from public.workflow_definitions definition
        join public.workflow_versions version
          on version.id = definition.active_version_id
        where definition.status = 'active'
          and definition.workflow_key in (
            'project_signing',
            'construction_main',
            'project_main'
          )
          and exists (
            select 1
            from jsonb_array_elements(version.snapshot -> 'nodes') node
            where node ->> 'node_key' in ('on_hold', 'invalid')
          );
      `),
    },
    {
      check_name: "tenants_missing_project_signing_definition",
      issue_count: await readIssueCount(db<CountRow[]>`
        select count(*)::int as issue_count
        from (
          select distinct tenant_id
          from public.workflow_definitions
          where workflow_key in ('construction_main', 'project_main')
            and status = 'active'
        ) tenant_with_project_workflow
        where not exists (
          select 1
          from public.workflow_definitions definition
          where definition.tenant_id = tenant_with_project_workflow.tenant_id
            and definition.workflow_key = 'project_signing'
            and definition.status = 'active'
            and definition.active_version_id is not null
        );
      `),
    },
    {
      check_name: "running_instances_on_legacy_snapshots",
      issue_count: await readIssueCount(db<CountRow[]>`
        select count(*)::int as issue_count
        from public.workflow_instances instance
        join public.workflow_definitions definition
          on definition.id = instance.definition_id
        join public.workflow_versions version
          on version.id = instance.version_id
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
          );
      `),
    },
  ];
}

async function readAffectedInstances(
  db: Bun.SQL,
  sampleLimit: number,
): Promise<DecorationWorkflowAffectedInstance[]> {
  return db<DecorationWorkflowAffectedInstance[]>`
    select
      instance.tenant_id::text,
      instance.definition_id::text,
      definition.workflow_key,
      instance.id::text as instance_id,
      instance.subject_type,
      instance.subject_id,
      instance.current_node_key,
      case
        when definition.workflow_key = 'customer_main'
          then 'running_legacy_customer_instance'
        else 'running_legacy_construction_instance'
      end as issue_code
    from public.workflow_instances instance
    join public.workflow_definitions definition
      on definition.id = instance.definition_id
    join public.workflow_versions version
      on version.id = instance.version_id
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

async function readIssueCount(query: Promise<CountRow[]>): Promise<number> {
  const rows = await query;
  return rows[0]?.issue_count ?? 0;
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
  const config = parseDecorationWorkflowBusinessAuditArgs(Bun.argv.slice(2));
  const databaseUrl = resolveDecorationWorkflowBusinessAuditDatabaseUrl();
  if (!databaseUrl) {
    console.error("缺少 SUPABASE_DB_URL 或 SUPABASE_DB_DIRECT_URL");
    process.exit(1);
  }

  const report = await runDecorationWorkflowBusinessAudit(databaseUrl, config);
  console.log(JSON.stringify(report, null, 2));
  if (config.strict && !report.ok) process.exit(1);
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(
      error instanceof Error ? error.message : "装修 workflow 业务审计失败",
    );
    process.exit(1);
  });
}
