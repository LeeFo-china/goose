type ObjectRow = {
  object_kind: "constraint" | "index";
  object_name: string;
  definition: string;
};

type PrivilegeRow = {
  role_name: string;
  function_signature: string;
  can_execute: boolean;
};

type IssueCountRow = {
  issue_count: number;
};

type SmokeCheckInput = {
  objects: boolean;
  privileges: boolean;
  historicalBackfill: boolean;
  safeMirrorRepair: boolean;
  invalidLimit: boolean;
  emptyClaim: boolean;
  rolledBack: boolean;
};

export type TenantCreditRefundReconciliationSmokeSummary = {
  objects: boolean;
  privileges: boolean;
  historical_backfill: boolean;
  safe_mirror_repair: boolean;
  invalid_limit: boolean;
  empty_claim: boolean;
  rolled_back: boolean;
};

type SmokeCliInput = {
  databaseUrl: string | undefined;
  runSmoke?: (
    databaseUrl: string,
  ) => Promise<TenantCreditRefundReconciliationSmokeSummary>;
  writeStdout?: (message: string) => void;
  writeStderr?: (message: string) => void;
};

const INVALID_LIMIT_ERROR =
  "BILLING_RECHARGE_REFUND_RECONCILE_LIMIT_INVALID";
const BUN_POSTGRES_SERVER_ERROR = "ERR_POSTGRES_SERVER_ERROR";
const INVALID_PARAMETER_VALUE_SQLSTATE = "22023";
export const TENANT_CREDIT_REFUND_RECONCILIATION_SMOKE_FAILED =
  "TENANT_CREDIT_REFUND_RECONCILIATION_SMOKE_FAILED";
const REQUIRED_INDEX = "tenant_credit_refund_reconcile_due_idx";
const REQUIRED_CONSTRAINTS = [
  "tenant_credit_refund_reconcile_attempt_count_check",
  "tenant_credit_refund_reconcile_lease_check",
  "tenant_credit_refund_reconcile_last_error_check",
] as const;
const LAST_ERROR_CONSTRAINT =
  "tenant_credit_refund_reconcile_last_error_check";

export const RECONCILIATION_FUNCTION_SIGNATURES = [
  "public.billing_begin_wechat_recharge_refund(uuid,text,timestamp with time zone)",
  "public.billing_claim_wechat_recharge_refunds(integer,integer,uuid,timestamp with time zone)",
  "public.billing_reschedule_wechat_recharge_refund(uuid,uuid,timestamp with time zone,timestamp with time zone,text,jsonb,text,integer)",
  "public.billing_close_wechat_recharge_refund(uuid,uuid,timestamp with time zone,jsonb)",
  "public.billing_apply_wechat_recharge_refund_callback_state(uuid,text,text,timestamp with time zone,jsonb)",
  "public.billing_confirm_wechat_recharge_refund(uuid,text,text,integer,timestamp with time zone,uuid,jsonb)",
  "public.billing_confirm_claimed_wechat_recharge_refund(uuid,uuid,text,text,integer,timestamp with time zone,jsonb)",
] as const;

class SmokeCheckError extends Error {}
class RollbackSentinel extends Error {}

export function buildTenantCreditRefundReconciliationSmokeSummary(
  input: SmokeCheckInput,
): TenantCreditRefundReconciliationSmokeSummary {
  return {
    objects: input.objects,
    privileges: input.privileges,
    historical_backfill: input.historicalBackfill,
    safe_mirror_repair: input.safeMirrorRepair,
    invalid_limit: input.invalidLimit,
    empty_claim: input.emptyClaim,
    rolled_back: input.rolledBack,
  };
}

export function isInvalidReconciliationLimitError(error: unknown): boolean {
  return error instanceof Error &&
    "code" in error &&
    error.code === BUN_POSTGRES_SERVER_ERROR &&
    "errno" in error &&
    error.errno === INVALID_PARAMETER_VALUE_SQLSTATE &&
    error.message === INVALID_LIMIT_ERROR;
}

function validateObjects(rows: ObjectRow[]): boolean {
  const indexRows = rows.filter((row) => row.object_kind === "index");
  const constraintRows = rows.filter(
    (row) => row.object_kind === "constraint",
  );
  const constraintsByName = new Map(
    constraintRows.map((row) => [row.object_name, row.definition]),
  );
  const lastErrorDefinition = constraintsByName.get(LAST_ERROR_CONSTRAINT);

  return indexRows.length === 1 &&
    indexRows[0]?.object_name === REQUIRED_INDEX &&
    REQUIRED_CONSTRAINTS.every((name) => constraintsByName.has(name)) &&
    constraintRows.length === REQUIRED_CONSTRAINTS.length &&
    typeof lastErrorDefinition === "string" &&
    /char_length\(reconcile_last_error\) <= 200/.test(lastErrorDefinition);
}

function validatePrivileges(rows: PrivilegeRow[]): boolean {
  const expectedRowCount = RECONCILIATION_FUNCTION_SIGNATURES.length * 2;
  return rows.length === expectedRowCount &&
    rows.every((row) =>
      (row.role_name === "anon" || row.role_name === "authenticated") &&
      RECONCILIATION_FUNCTION_SIGNATURES.includes(
        row.function_signature as typeof RECONCILIATION_FUNCTION_SIGNATURES[number],
      ) &&
      row.can_execute === false
    );
}

function readIssueCount(rows: IssueCountRow[]): number {
  return rows[0]?.issue_count ?? -1;
}

export async function runTenantCreditRefundReconciliationSmoke(
  databaseUrl: string,
): Promise<TenantCreditRefundReconciliationSmokeSummary> {
  const db = new Bun.SQL(databaseUrl);

  try {
    const objectRows = await db<ObjectRow[]>`
      select
        'index'::text as object_kind,
        indexname::text as object_name,
        indexdef::text as definition
      from pg_indexes
      where schemaname = 'public'
        and tablename = 'tenant_credit_refund_requests'
        and indexname = ${REQUIRED_INDEX}
      union all
      select
        'constraint'::text as object_kind,
        constraint_record.conname::text as object_name,
        pg_get_constraintdef(constraint_record.oid)::text as definition
      from pg_constraint constraint_record
      where constraint_record.conrelid =
        'public.tenant_credit_refund_requests'::regclass
        and constraint_record.conname in (
          'tenant_credit_refund_reconcile_attempt_count_check',
          'tenant_credit_refund_reconcile_lease_check',
          'tenant_credit_refund_reconcile_last_error_check'
        )
      order by object_kind, object_name;
    `;

    const functionSignatures = db.array(
      [...RECONCILIATION_FUNCTION_SIGNATURES],
      "text",
    );
    const privilegeRows = await db<PrivilegeRow[]>`
      with role_names(role_name) as (
        values ('anon'::text), ('authenticated'::text)
      ),
      function_signatures(function_signature) as (
        select unnest(${functionSignatures})::text
      )
      select
        role_names.role_name,
        function_signatures.function_signature,
        has_function_privilege(
          role_names.role_name,
          function_signatures.function_signature,
          'EXECUTE'
        ) as can_execute
      from role_names
      cross join function_signatures
      order by role_names.role_name, function_signatures.function_signature;
    `;

    const historicalRows = await db<IssueCountRow[]>`
      select count(*)::int as issue_count
      from public.tenant_credit_refund_requests
      where status = 'refunding'
        and reconcile_next_at is null;
    `;

    const mirrorRows = await db<IssueCountRow[]>`
      select count(*)::int as issue_count
      from public.tenant_credit_refund_requests refund_request
      join public.tenant_credit_orders credit_order
        on credit_order.id = refund_request.order_id
       and credit_order.tenant_id = refund_request.tenant_id
      where refund_request.status = 'refunding'
        and (
          credit_order.refund_status is null
          or credit_order.refund_status = 'approved'
        );
    `;

    let invalidLimit = false;
    try {
      await db.begin(async (transaction) => {
        await transaction`
          select *
          from public.billing_claim_wechat_recharge_refunds(
            ${101}::integer,
            ${120}::integer,
            ${crypto.randomUUID()}::uuid,
            ${new Date().toISOString()}::timestamptz
          );
        `;
      });
    } catch (error) {
      if (!isInvalidReconciliationLimitError(error)) {
        throw new SmokeCheckError("invalid-limit check returned an unexpected error");
      }
      invalidLimit = true;
    }

    let emptyClaim = false;
    let rolledBack = false;
    const rollbackSentinel = new RollbackSentinel("private rollback sentinel");
    try {
      await db.begin(async (transaction) => {
        const rows = await transaction<unknown[]>`
          select *
          from public.billing_claim_wechat_recharge_refunds(
            ${1}::integer,
            ${120}::integer,
            ${crypto.randomUUID()}::uuid,
            ${"1970-01-01T00:00:00.000Z"}::timestamptz
          );
        `;
        if (rows.length !== 0) {
          throw new SmokeCheckError("epoch claim unexpectedly returned rows");
        }
        emptyClaim = true;
        throw rollbackSentinel;
      });
    } catch (error) {
      if (error !== rollbackSentinel) throw error;
      rolledBack = true;
    }

    return buildTenantCreditRefundReconciliationSmokeSummary({
      objects: validateObjects(objectRows),
      privileges: validatePrivileges(privilegeRows),
      historicalBackfill: readIssueCount(historicalRows) === 0,
      safeMirrorRepair: readIssueCount(mirrorRows) === 0,
      invalidLimit,
      emptyClaim,
      rolledBack,
    });
  } finally {
    await db.close();
  }
}

function allChecksPassed(
  summary: TenantCreditRefundReconciliationSmokeSummary,
): boolean {
  return Object.values(summary).every((value) => value === true);
}

export async function runTenantCreditRefundReconciliationSmokeCli(
  input: SmokeCliInput,
): Promise<0 | 1> {
  const runSmoke = input.runSmoke ?? runTenantCreditRefundReconciliationSmoke;
  const writeStdout = input.writeStdout ?? console.log;
  const writeStderr = input.writeStderr ?? console.error;

  const databaseUrl = input.databaseUrl;
  if (!databaseUrl) {
    writeStderr(TENANT_CREDIT_REFUND_RECONCILIATION_SMOKE_FAILED);
    return 1;
  }

  try {
    const summary = await runSmoke(databaseUrl);
    writeStdout(JSON.stringify(summary));
    if (allChecksPassed(summary)) return 0;
  } catch {
    writeStderr(TENANT_CREDIT_REFUND_RECONCILIATION_SMOKE_FAILED);
    return 1;
  }

  writeStderr(TENANT_CREDIT_REFUND_RECONCILIATION_SMOKE_FAILED);
  return 1;
}

async function main(): Promise<void> {
  process.exitCode = await runTenantCreditRefundReconciliationSmokeCli({
    databaseUrl: process.env.SUPABASE_DB_DIRECT_URL,
  });
}

if (import.meta.main) {
  main().catch(() => {
    console.error(TENANT_CREDIT_REFUND_RECONCILIATION_SMOKE_FAILED);
    process.exitCode = 1;
  });
}
