import {
  classifyDecorationWorkflowLegacyInstance,
  type DecorationLegacyWorkflowReviewClassification,
  type DecorationWorkflowLegacyInstanceReviewInput,
} from "./decoration-workflow-legacy-instance-review";
import {
  closeSqlWithTimeout,
  resolveScriptDatabaseUrl,
} from "./workflow-script-database";

export type DecorationWorkflowLegacyCancelMode = "dry-run" | "apply";

export type DecorationWorkflowLegacyCancelOptions = {
  mode: DecorationWorkflowLegacyCancelMode;
  tenantId: string;
  instanceId: string;
  actorEmployeeId: string | null;
  reason: string;
  confirmInstanceId: string | null;
};

export type DecorationWorkflowLegacyCancelRequest = {
  tenantId: string;
  definitionId: string;
  instanceId: string;
  reason: string;
  context: Record<string, unknown>;
  actorEmployeeId: string | null;
  dryRun: boolean;
};

export type DecorationWorkflowLegacyCancelPlanFailureReason =
  | "target_mismatch"
  | "action_not_cancelable";

export type DecorationWorkflowLegacyCancelPlan =
  | {
    ok: true;
    request: DecorationWorkflowLegacyCancelRequest;
  }
  | {
    ok: false;
    reason: DecorationWorkflowLegacyCancelPlanFailureReason;
    classification?: DecorationLegacyWorkflowReviewClassification;
    recommendedAction?: string;
  };

export type DecorationWorkflowLegacyCancelReport =
  | {
    ok: true;
    mode: DecorationWorkflowLegacyCancelMode;
    item: DecorationWorkflowLegacyInstanceReviewInput;
    request: DecorationWorkflowLegacyCancelRequest;
    result: unknown;
  }
  | {
    ok: false;
    reason:
      | "legacy_instance_not_found"
      | DecorationWorkflowLegacyCancelPlanFailureReason;
    classification?: DecorationLegacyWorkflowReviewClassification;
    recommendedAction?: string;
  };

type EnvLike = Record<string, string | undefined>;
type RpcResultRow = {
  result: unknown;
};

const DEFAULT_REASON = "decoration_workflow_legacy_cancel";
const CANCELABLE_RECOMMENDED_ACTION = "confirm_customer_status_before_continue";
const UUID_PATTERN =
  "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$";

export function parseDecorationWorkflowLegacyCancelArgs(
  args: string[],
): DecorationWorkflowLegacyCancelOptions {
  const draft: Partial<DecorationWorkflowLegacyCancelOptions> = {
    mode: "dry-run",
    actorEmployeeId: null,
    reason: DEFAULT_REASON,
    confirmInstanceId: null,
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

    const value = args[index + 1];
    if (arg === "--tenant-id") {
      draft.tenantId = requiredValue(arg, value);
    } else if (arg === "--instance-id") {
      draft.instanceId = requiredValue(arg, value);
    } else if (arg === "--actor-employee-id") {
      draft.actorEmployeeId = requiredValue(arg, value);
    } else if (arg === "--reason") {
      draft.reason = requiredValue(arg, value);
    } else if (arg === "--confirm-cancel") {
      draft.confirmInstanceId = requiredValue(arg, value);
    } else {
      throw new Error(`Unsupported argument: ${arg}`);
    }
    index += 1;
  }

  if (explicitApply && explicitDryRun) {
    throw new Error("请勿同时传 --dry-run 和 --apply");
  }
  if (draft.mode === "apply" && !draft.confirmInstanceId) {
    throw new Error("--apply 必须同时传 --confirm-cancel <instance-id>");
  }
  if (draft.mode === "apply" && draft.confirmInstanceId !== draft.instanceId) {
    throw new Error("--confirm-cancel 必须等于 --instance-id");
  }

  return {
    mode: draft.mode ?? "dry-run",
    tenantId: requireOption("--tenant-id", draft.tenantId),
    instanceId: requireOption("--instance-id", draft.instanceId),
    actorEmployeeId: draft.actorEmployeeId ?? null,
    reason: draft.reason ?? DEFAULT_REASON,
    confirmInstanceId: draft.confirmInstanceId ?? null,
  };
}

export function resolveDecorationWorkflowLegacyCancelDatabaseUrl(
  env: EnvLike = process.env,
): string | null {
  return resolveScriptDatabaseUrl(env);
}

export function buildDecorationWorkflowLegacyCancelPlan(input: {
  item: DecorationWorkflowLegacyInstanceReviewInput;
  options: DecorationWorkflowLegacyCancelOptions;
}): DecorationWorkflowLegacyCancelPlan {
  if (
    input.item.tenant_id !== input.options.tenantId ||
    input.item.instance_id !== input.options.instanceId
  ) {
    return { ok: false, reason: "target_mismatch" };
  }

  const decision = classifyDecorationWorkflowLegacyInstance(input.item);
  if (
    input.item.subject_type !== "customer" ||
    decision.recommended_action !== CANCELABLE_RECOMMENDED_ACTION
  ) {
    return {
      ok: false,
      reason: "action_not_cancelable",
      classification: decision.classification,
      recommendedAction: decision.recommended_action,
    };
  }

  return {
    ok: true,
    request: {
      tenantId: input.options.tenantId,
      definitionId: input.item.definition_id,
      instanceId: input.options.instanceId,
      reason: input.options.reason,
      actorEmployeeId: input.options.actorEmployeeId,
      dryRun: input.options.mode === "dry-run",
      context: {
        source: "decoration_workflow_legacy_cancel",
        legacy_workflow_key: input.item.workflow_key,
        legacy_current_node_key: input.item.current_node_key,
        legacy_subject_type: input.item.subject_type,
        legacy_subject_id: input.item.subject_id,
        legacy_subject_status: input.item.subject_status,
      },
    },
  };
}

export async function runDecorationWorkflowLegacyCancel(
  databaseUrl: string,
  options: DecorationWorkflowLegacyCancelOptions,
): Promise<DecorationWorkflowLegacyCancelReport> {
  const db = new Bun.SQL(databaseUrl);
  try {
    const item = await readLegacyInstance(db, options);
    if (!item) return { ok: false, reason: "legacy_instance_not_found" };

    const plan = buildDecorationWorkflowLegacyCancelPlan({ item, options });
    if (!plan.ok) return plan;

    const result = plan.request.dryRun
      ? {
        ok: true,
        dry_run: true,
        instance_id: plan.request.instanceId,
        definition_id: plan.request.definitionId,
      }
      : await callCancelRpc(db, plan.request);

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
  options: DecorationWorkflowLegacyCancelOptions,
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
      and instance.id = ${options.instanceId}::uuid
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
    limit 1;
  `;

  return rows[0] ?? null;
}

async function callCancelRpc(
  db: Bun.SQL,
  request: DecorationWorkflowLegacyCancelRequest,
): Promise<unknown> {
  const context = JSON.stringify(request.context);
  const rows = await db<RpcResultRow[]>`
    select public.cancel_workflow_instance(
      ${request.tenantId}::uuid,
      ${request.definitionId}::uuid,
      ${request.instanceId}::uuid,
      ${request.reason},
      ${context}::text::jsonb,
      ${request.actorEmployeeId}::uuid
    ) as result;
  `;

  return rows[0]?.result ?? null;
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
  const options = parseDecorationWorkflowLegacyCancelArgs(Bun.argv.slice(2));
  const databaseUrl = resolveDecorationWorkflowLegacyCancelDatabaseUrl();
  if (!databaseUrl) {
    console.error("缺少 SUPABASE_DB_URL 或 SUPABASE_DB_DIRECT_URL");
    process.exit(1);
  }

  const report = await runDecorationWorkflowLegacyCancel(databaseUrl, options);
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
