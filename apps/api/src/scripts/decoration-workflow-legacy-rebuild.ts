import {
  classifyDecorationWorkflowLegacyInstance,
  type DecorationLegacyWorkflowReviewClassification,
  type DecorationWorkflowLegacyInstanceReviewInput,
} from "./decoration-workflow-legacy-instance-review";
import {
  closeSqlWithTimeout,
  resolveScriptDatabaseUrl,
} from "./workflow-script-database";

export type DecorationWorkflowLegacyRebuildMode = "dry-run" | "apply";
export type DecorationWorkflowLegacyRebuildSubjectType =
  | "customer"
  | "project"
  | "expense_request";

export type DecorationWorkflowLegacyRebuildOptions = {
  mode: DecorationWorkflowLegacyRebuildMode;
  tenantId: string;
  subjectType: DecorationWorkflowLegacyRebuildSubjectType;
  subjectId: string;
  workflowKey: string;
  actorEmployeeId: string | null;
  reason: string;
  projectStatus: string | null;
  deleteCompletedInstances: boolean;
  confirmSubjectId: string | null;
};

export type DecorationWorkflowLegacyRebuildRequest = {
  tenantId: string;
  definitionId: string;
  subjectType: DecorationWorkflowLegacyRebuildSubjectType;
  subjectId: string;
  reason: string;
  context: Record<string, unknown>;
  actorEmployeeId: string | null;
  projectStatus: string | null;
  deleteCompletedInstances: boolean;
  dryRun: boolean;
};

export type DecorationWorkflowLegacyRebuildPlanFailureReason =
  | "target_mismatch"
  | "classification_not_rebuild_candidate"
  | "recommended_workflow_mismatch";

export type DecorationWorkflowLegacyRebuildPlan =
  | {
    ok: true;
    request: DecorationWorkflowLegacyRebuildRequest;
  }
  | {
    ok: false;
    reason: DecorationWorkflowLegacyRebuildPlanFailureReason;
    classification?: DecorationLegacyWorkflowReviewClassification;
  };

export type DecorationWorkflowLegacyRebuildReport =
  | {
    ok: true;
    mode: DecorationWorkflowLegacyRebuildMode;
    item: DecorationWorkflowLegacyInstanceReviewInput;
    request: DecorationWorkflowLegacyRebuildRequest;
    result: unknown;
  }
  | {
    ok: false;
    reason:
      | "legacy_instance_not_found"
      | "target_definition_not_found"
      | DecorationWorkflowLegacyRebuildPlanFailureReason;
    classification?: DecorationLegacyWorkflowReviewClassification;
  };

type EnvLike = Record<string, string | undefined>;
type TargetDefinitionRow = {
  id: string;
  workflow_key: string;
};
type RpcResultRow = {
  result: unknown;
};

const DEFAULT_REASON = "decoration_workflow_legacy_rebuild";
const SUBJECT_TYPES: readonly DecorationWorkflowLegacyRebuildSubjectType[] = [
  "customer",
  "project",
  "expense_request",
];
const UUID_PATTERN =
  "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$";

export function parseDecorationWorkflowLegacyRebuildArgs(
  args: string[],
): DecorationWorkflowLegacyRebuildOptions {
  const draft: Partial<DecorationWorkflowLegacyRebuildOptions> = {
    mode: "dry-run",
    actorEmployeeId: null,
    reason: DEFAULT_REASON,
    projectStatus: null,
    deleteCompletedInstances: false,
    confirmSubjectId: null,
  };
  let explicitDryRun = false;
  let explicitApply = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--dry-run") {
      explicitDryRun = true;
      draft.mode = "dry-run";
      continue;
    }
    if (arg === "--apply") {
      explicitApply = true;
      draft.mode = "apply";
      continue;
    }
    if (arg === "--delete-completed-instances") {
      draft.deleteCompletedInstances = true;
      continue;
    }

    const value = args[index + 1];
    if (arg === "--tenant-id") {
      draft.tenantId = requiredValue(arg, value);
    } else if (arg === "--subject-type") {
      draft.subjectType = parseSubjectType(requiredValue(arg, value));
    } else if (arg === "--subject-id") {
      draft.subjectId = requiredValue(arg, value);
    } else if (arg === "--workflow-key") {
      draft.workflowKey = requiredValue(arg, value);
    } else if (arg === "--actor-employee-id") {
      draft.actorEmployeeId = requiredValue(arg, value);
    } else if (arg === "--reason") {
      draft.reason = requiredValue(arg, value);
    } else if (arg === "--project-status") {
      draft.projectStatus = requiredValue(arg, value);
    } else if (arg === "--confirm-rebuild") {
      draft.confirmSubjectId = requiredValue(arg, value);
    } else {
      throw new Error(`Unsupported argument: ${arg}`);
    }
    index += 1;
  }

  if (explicitApply && explicitDryRun) {
    throw new Error("请勿同时传 --dry-run 和 --apply");
  }
  if (draft.mode === "apply" && !draft.confirmSubjectId) {
    throw new Error("--apply 必须同时传 --confirm-rebuild <subject-id>");
  }
  if (draft.mode === "apply" && draft.confirmSubjectId !== draft.subjectId) {
    throw new Error("--confirm-rebuild 必须等于 --subject-id");
  }

  return {
    mode: draft.mode ?? "dry-run",
    tenantId: requireOption("--tenant-id", draft.tenantId),
    subjectType: requireOption("--subject-type", draft.subjectType),
    subjectId: requireOption("--subject-id", draft.subjectId),
    workflowKey: requireOption("--workflow-key", draft.workflowKey),
    actorEmployeeId: draft.actorEmployeeId ?? null,
    reason: draft.reason ?? DEFAULT_REASON,
    projectStatus: draft.projectStatus ?? null,
    deleteCompletedInstances: draft.deleteCompletedInstances ?? false,
    confirmSubjectId: draft.confirmSubjectId ?? null,
  };
}

export function resolveDecorationWorkflowLegacyRebuildDatabaseUrl(
  env: EnvLike = process.env,
): string | null {
  return resolveScriptDatabaseUrl(env);
}

export function buildDecorationWorkflowLegacyRebuildPlan(input: {
  item: DecorationWorkflowLegacyInstanceReviewInput;
  targetDefinitionId: string;
  options: DecorationWorkflowLegacyRebuildOptions;
}): DecorationWorkflowLegacyRebuildPlan {
  if (
    input.item.tenant_id !== input.options.tenantId ||
    input.item.subject_type !== input.options.subjectType ||
    input.item.subject_id !== input.options.subjectId
  ) {
    return { ok: false, reason: "target_mismatch" };
  }

  const decision = classifyDecorationWorkflowLegacyInstance(input.item);
  if (decision.classification !== "rebuild_candidate") {
    return {
      ok: false,
      reason: "classification_not_rebuild_candidate",
      classification: decision.classification,
    };
  }
  if (decision.recommended_workflow_key !== input.options.workflowKey) {
    return {
      ok: false,
      reason: "recommended_workflow_mismatch",
      classification: decision.classification,
    };
  }

  return {
    ok: true,
    request: {
      tenantId: input.options.tenantId,
      definitionId: input.targetDefinitionId,
      subjectType: input.options.subjectType,
      subjectId: input.options.subjectId,
      reason: input.options.reason,
      actorEmployeeId: input.options.actorEmployeeId,
      projectStatus: input.options.projectStatus,
      deleteCompletedInstances: input.options.deleteCompletedInstances,
      dryRun: input.options.mode === "dry-run",
      context: {
        source: "decoration_workflow_legacy_rebuild",
        legacy_definition_id: input.item.definition_id,
        legacy_instance_id: input.item.instance_id,
        legacy_workflow_key: input.item.workflow_key,
        legacy_current_node_key: input.item.current_node_key,
        legacy_subject_status: input.item.subject_status,
        target_workflow_key: input.options.workflowKey,
      },
    },
  };
}

export async function runDecorationWorkflowLegacyRebuild(
  databaseUrl: string,
  options: DecorationWorkflowLegacyRebuildOptions,
): Promise<DecorationWorkflowLegacyRebuildReport> {
  const db = new Bun.SQL(databaseUrl);
  try {
    const item = await readLegacyInstance(db, options);
    if (!item) return { ok: false, reason: "legacy_instance_not_found" };

    const definition = await readTargetDefinition(db, options);
    if (!definition) return { ok: false, reason: "target_definition_not_found" };

    const plan = buildDecorationWorkflowLegacyRebuildPlan({
      item,
      targetDefinitionId: definition.id,
      options,
    });
    if (!plan.ok) return plan;

    const result = await callRebuildRpc(db, plan.request);
    return {
      ok: true,
      mode: options.mode,
      item,
      request: plan.request,
      result,
    };
  } finally {
    await closeSqlWithTimeout(db);
  }
}

async function readLegacyInstance(
  db: Bun.SQL,
  options: DecorationWorkflowLegacyRebuildOptions,
): Promise<DecorationWorkflowLegacyInstanceReviewInput | null> {
  const rows = await db<DecorationWorkflowLegacyInstanceReviewInput[]>`
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
      and instance.tenant_id = ${options.tenantId}::uuid
      and instance.subject_type = ${options.subjectType}
      and instance.subject_id = ${options.subjectId}
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
    limit 1;
  `;

  return rows[0] ?? null;
}

async function readTargetDefinition(
  db: Bun.SQL,
  options: DecorationWorkflowLegacyRebuildOptions,
): Promise<TargetDefinitionRow | null> {
  const rows = await db<TargetDefinitionRow[]>`
    select id::text, workflow_key
    from public.workflow_definitions
    where tenant_id = ${options.tenantId}::uuid
      and workflow_key = ${options.workflowKey}
      and status = 'active'
      and active_version_id is not null
    order by updated_at desc, id desc
    limit 1;
  `;

  return rows[0] ?? null;
}

async function callRebuildRpc(
  db: Bun.SQL,
  request: DecorationWorkflowLegacyRebuildRequest,
): Promise<unknown> {
  const context = JSON.stringify(request.context);
  const rows = await db<RpcResultRow[]>`
    select public.rebuild_workflow_subject_runtime(
      ${request.tenantId}::uuid,
      ${request.definitionId}::uuid,
      ${request.subjectType},
      ${request.subjectId},
      ${request.reason},
      ${context}::text::jsonb,
      ${request.actorEmployeeId}::uuid,
      ${request.projectStatus},
      ${request.deleteCompletedInstances},
      ${request.dryRun}
    ) as result;
  `;

  return rows[0]?.result ?? null;
}

function parseSubjectType(value: string): DecorationWorkflowLegacyRebuildSubjectType {
  if (SUBJECT_TYPES.includes(value as DecorationWorkflowLegacyRebuildSubjectType)) {
    return value as DecorationWorkflowLegacyRebuildSubjectType;
  }
  throw new Error("--subject-type 必须是 customer、project 或 expense_request");
}

function requiredValue(flag: string, value: string | undefined): string {
  if (!value) throw new Error(`${flag} requires a value`);
  return value;
}

function requireOption<T>(flag: string, value: T | undefined | null): T {
  if (!value) throw new Error(`${flag} is required`);
  return value;
}

async function main() {
  const options = parseDecorationWorkflowLegacyRebuildArgs(Bun.argv.slice(2));
  const databaseUrl = resolveDecorationWorkflowLegacyRebuildDatabaseUrl();
  if (!databaseUrl) {
    console.error("缺少 SUPABASE_DB_URL 或 SUPABASE_DB_DIRECT_URL");
    process.exit(1);
  }

  const report = await runDecorationWorkflowLegacyRebuild(databaseUrl, options);
  console.log(JSON.stringify(report, null, 2));

  if (!report.ok) process.exit(1);
  const result = report.result;
  if (
    !result ||
    typeof result !== "object" ||
    !("ok" in result) ||
    result.ok !== true
  ) {
    process.exit(1);
  }
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
