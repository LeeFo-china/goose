import {
  WorkflowExplainError,
  parseWorkflowExplainConfig,
  parseWorkflowExplainEvidenceInput,
  type WorkflowExplainConfig,
  type WorkflowExplainEvidenceInput,
} from "./supplier-purchase-batch-workflow-explain-config";
import {
  WORKFLOW_EXPLAIN_MANIFEST,
  WORKFLOW_EXPLAIN_ERROR_CODES,
  WORKFLOW_EXPLAIN_QUERY_NAMES,
  WORKFLOW_EXPLAIN_THRESHOLDS,
  assertWorkflowExplainCurrentPlannerSettings,
  assertWorkflowExplainIndexMetadata,
  assertWorkflowExplainPlanEvidence,
  assertWorkflowExplainRawGate,
  classifyWorkflowCardinality,
  parseWorkflowExplainPlan,
  type WorkflowExplainIndexMetadata,
  type WorkflowExplainPlanEvidence,
  type WorkflowExplainPlannerSetting,
  type WorkflowExplainQueryName,
  type WorkflowExplainRawPlan,
} from "./supplier-purchase-batch-workflow-explain-evidence";

const EXPLAIN =
  "explain (analyze, buffers, settings, verbose, format json)";

export const WORKFLOW_EXPLAIN_QUERIES = Object.freeze({
  running_instance: `${EXPLAIN}\nselect id from public.workflow_instances\nwhere tenant_id = $1::uuid and subject_type = 'supplier_purchase_batch'\n  and subject_id = $2::text and status = 'running'\norder by created_at desc, id desc\nlimit 2`,
  pending_task: `${EXPLAIN}\nselect id from public.workflow_tasks\nwhere tenant_id = $1::uuid and instance_id = $2::uuid and status = 'pending'\norder by created_at asc, id asc\nlimit 2`,
  subject_state: `${EXPLAIN}\nselect subject_id from public.workflow_subject_states\nwhere tenant_id = $1::uuid and subject_type = 'supplier_purchase_batch'\n  and subject_id = $2::text\nlimit 2`,
} as const);

const TRANSACTION_GUARD_QUERY = `
  select
    pg_backend_pid() AS "backendPid",
    current_setting('transaction_read_only') AS "readOnly",
    current_setting('transaction_isolation') AS isolation
`;

const ROLE_QUERY = `
  select roles.rolsuper, roles.rolbypassrls AS "rolbypassrl"
  from pg_roles as roles
  where roles.rolname = current_user
`;

const PLANNER_SETTINGS_QUERY = `
  select name, current_setting(name) AS "current", setting AS "rawValue",
    boot_val AS "bootValue", category, source
  from pg_settings
  where category LIKE 'Query Tuning /%' OR name = 'plan_cache_mode'
  order by name
`;

const EVIDENCE_PREFLIGHT_QUERY = `
  select id
  from public.workflow_instances
  where id = $1::uuid
    and tenant_id = $2::uuid
    and subject_type = 'supplier_purchase_batch'
    and subject_id = $3::text
`;

const CARDINALITY_QUERIES = {
  running_instance:
    "select count(*)::integer as count from (select 1 from public.workflow_instances limit 1000) as bounded_rows",
  pending_task:
    "select count(*)::integer as count from (select 1 from public.workflow_tasks limit 1000) as bounded_rows",
  subject_state:
    "select count(*)::integer as count from (select 1 from public.workflow_subject_states limit 1000) as bounded_rows",
} as const satisfies Record<WorkflowExplainQueryName, string>;

const INDEX_METADATA_QUERY = `
  select
    index_class.relname AS "indexName",
    index_namespace.nspname as schema,
    relation_class.relname as relation,
    index_catalog.indisvalid,
    index_catalog.indisready
  from pg_index as index_catalog
  join pg_class as index_class
    on index_class.oid = index_catalog.indexrelid
  join pg_namespace as index_namespace
    on index_namespace.oid = index_class.relnamespace
  join pg_class as relation_class
    on relation_class.oid = index_catalog.indrelid
  join pg_namespace as relation_namespace
    on relation_namespace.oid = relation_class.relnamespace
  where index_class.relname in (
    'workflow_instances_running_purchase_batch_uidx',
    'workflow_instances_purchase_batch_lookup_idx',
    'idx_workflow_tasks_instance_status',
    'idx_workflow_subject_states_subject'
  )
    and index_namespace.nspname = 'public'
  order by index_class.relname
`;

export type WorkflowExplainSql = {
  unsafe(text: string, values?: unknown[]): Promise<unknown>;
};

export type WorkflowExplainDatabase = {
  begin<Result>(
    callback: (sql: WorkflowExplainSql) => Promise<Result>,
  ): Promise<Result>;
  close(): Promise<void>;
};

export type WorkflowExplainDependencies = {
  createDatabase(databaseUrl: string): WorkflowExplainDatabase;
};

export type WorkflowExplainSummary = {
  gate: "supplier_purchase_batch_workflow";
  queryCount: 3;
  thresholds: typeof WORKFLOW_EXPLAIN_THRESHOLDS;
  queries: Record<WorkflowExplainQueryName, {
    cardinality: number;
    cardinalityClass: "small" | "large";
    nodeTypes: string[];
    indexNames: string[];
    planningMs: number;
    executionMs: number;
    sharedHitBlocks: number;
    sharedReadBlocks: number;
    tempReadBlocks: number;
    tempWrittenBlocks: number;
  }>;
};

export type WorkflowExplainCliDependencies = {
  env: Record<string, string | undefined>;
  readEvidence(path: string): Promise<unknown>;
  runGate(
    config: WorkflowExplainConfig,
    evidence: WorkflowExplainEvidenceInput,
  ): Promise<WorkflowExplainSummary>;
  writeStdout(line: string): void;
  writeStderr(line: string): void;
  setExitCode(code: number): void;
};

type TransactionGuard = {
  backendPid: number;
  readOnly: "on";
  isolation: "repeatable read";
};

type TransactionEvidence = {
  cardinalities: Record<WorkflowExplainQueryName, number>;
  parsedPlans: Record<WorkflowExplainQueryName, WorkflowExplainPlanEvidence>;
  plans: WorkflowExplainRawPlan[];
};

export async function runWorkflowExplainGate(
  config: WorkflowExplainConfig,
  evidence: WorkflowExplainEvidenceInput,
  dependencies: WorkflowExplainDependencies = DEFAULT_DEPENDENCIES,
): Promise<WorkflowExplainSummary> {
  let database: WorkflowExplainDatabase;
  try {
    database = dependencies.createDatabase(config.databaseUrl);
  } catch (error) {
    throw normalizeError(error);
  }
  let primaryFailure: WorkflowExplainError | undefined;
  try {
    const result = await database.begin(async (sql) => {
      await sql.unsafe(
        "set transaction isolation level repeatable read, read only",
      );
      await sql.unsafe(
        `set local statement_timeout = '${WORKFLOW_EXPLAIN_THRESHOLDS.statementTimeoutMs}ms'`,
      );
      const startGuard = await readTransactionGuard(sql);
      await assertPrivilegedRole(sql);
      const plannerSettings = await sql.unsafe(PLANNER_SETTINGS_QUERY) as
        WorkflowExplainPlannerSetting[];
      const plannerRegistry = assertWorkflowExplainCurrentPlannerSettings(
        plannerSettings,
      );
      await assertEvidencePreflight(sql, evidence);
      const cardinalities = await readCardinalities(sql);
      const indexMetadata = await readIndexMetadata(sql);
      const { parsedPlans, plans } = await readPlans(
        sql,
        evidence,
        cardinalities,
        plannerRegistry,
      );
      const endGuard = await readTransactionGuard(sql);
      if (endGuard.backendPid !== startGuard.backendPid) {
        fail(
          "TRANSACTION_GUARD_INVALID",
          "transaction backend changed during evidence collection",
        );
      }
      assertWorkflowExplainRawGate({
        plannerSettings,
        cardinalities,
        indexMetadata,
        plans,
      });
      return { cardinalities, parsedPlans, plans };
    });
    return summarize(result);
  } catch (error) {
    primaryFailure = normalizeError(error);
    throw primaryFailure;
  } finally {
    try {
      await database.close();
    } catch {
      if (primaryFailure === undefined) {
        throw new WorkflowExplainError(
          "DATABASE_CLOSE_FAILED",
          "database close failed",
        );
      }
    }
  }
}

async function readTransactionGuard(
  sql: WorkflowExplainSql,
): Promise<TransactionGuard> {
  const rows = await sql.unsafe(TRANSACTION_GUARD_QUERY);
  if (!Array.isArray(rows) || rows.length !== 1 || !isRecord(rows[0])) {
    fail("TRANSACTION_GUARD_INVALID", "transaction guard is malformed");
  }
  const { backendPid, readOnly, isolation } = rows[0];
  if (!Number.isSafeInteger(backendPid) || Number(backendPid) <= 0 ||
    readOnly !== "on" || isolation !== "repeatable read") {
    fail("TRANSACTION_GUARD_INVALID", "transaction guard is invalid");
  }
  return {
    backendPid: backendPid as number,
    readOnly,
    isolation,
  };
}

async function assertPrivilegedRole(sql: WorkflowExplainSql): Promise<void> {
  const rows = await sql.unsafe(ROLE_QUERY);
  if (!Array.isArray(rows) || rows.length !== 1 || !isRecord(rows[0])) {
    fail("INVALID_DEV_TARGET", "development database role is invalid");
  }
  const { rolsuper, rolbypassrl } = rows[0];
  if (typeof rolsuper !== "boolean" || typeof rolbypassrl !== "boolean" ||
    (!rolsuper && !rolbypassrl)) {
    fail("INVALID_DEV_TARGET", "development database role is invalid");
  }
}

async function assertEvidencePreflight(
  sql: WorkflowExplainSql,
  evidence: WorkflowExplainEvidenceInput,
): Promise<void> {
  const rows = await sql.unsafe(EVIDENCE_PREFLIGHT_QUERY, [
    evidence.instanceId,
    evidence.tenantId,
    evidence.batchId,
  ]);
  if (!Array.isArray(rows) || rows.length !== 1 || !isRecord(rows[0]) ||
    rows[0].id !== evidence.instanceId) {
    fail("INVALID_EVIDENCE_INPUT", "fixed workflow evidence is invalid");
  }
}

async function readCardinalities(
  sql: WorkflowExplainSql,
): Promise<Record<WorkflowExplainQueryName, number>> {
  const result = {} as Record<WorkflowExplainQueryName, number>;
  for (const name of WORKFLOW_EXPLAIN_QUERY_NAMES) {
    const rows = await sql.unsafe(CARDINALITY_QUERIES[name]);
    if (!Array.isArray(rows) || rows.length !== 1 || !isRecord(rows[0]) ||
      !Number.isSafeInteger(rows[0].count) || Number(rows[0].count) < 0 ||
      Number(rows[0].count) > 1_000) {
      fail("INVALID_CARDINALITY", "bounded cardinality is invalid");
    }
    result[name] = rows[0].count as number;
  }
  return result;
}

async function readIndexMetadata(
  sql: WorkflowExplainSql,
): Promise<Record<WorkflowExplainQueryName, WorkflowExplainIndexMetadata[]>> {
  const value = await sql.unsafe(INDEX_METADATA_QUERY);
  const rows = Array.isArray(value) ? value : [];
  const result = {} as Record<
    WorkflowExplainQueryName,
    WorkflowExplainIndexMetadata[]
  >;
  for (const name of WORKFLOW_EXPLAIN_QUERY_NAMES) {
    const approved = new Set<string>(WORKFLOW_EXPLAIN_MANIFEST[name].indexes);
    result[name] = rows.filter(
      (row) => isRecord(row) && typeof row.indexName === "string" &&
        approved.has(row.indexName),
    ) as WorkflowExplainIndexMetadata[];
  }
  for (const name of WORKFLOW_EXPLAIN_QUERY_NAMES) {
    assertWorkflowExplainIndexMetadata(name, result[name]);
  }
  return result;
}

async function readPlans(
  sql: WorkflowExplainSql,
  evidence: WorkflowExplainEvidenceInput,
  cardinalities: Record<WorkflowExplainQueryName, number>,
  plannerRegistry: Map<string, string>,
): Promise<Pick<TransactionEvidence, "parsedPlans" | "plans">> {
  const values: Record<WorkflowExplainQueryName, unknown[]> = {
    running_instance: [evidence.tenantId, evidence.batchId],
    pending_task: [evidence.tenantId, evidence.instanceId],
    subject_state: [evidence.tenantId, evidence.batchId],
  };
  const plans: WorkflowExplainRawPlan[] = [];
  const parsedPlans = {} as Record<
    WorkflowExplainQueryName,
    WorkflowExplainPlanEvidence
  >;
  for (const name of WORKFLOW_EXPLAIN_QUERY_NAMES) {
    const rawPlan = {
      name,
      rows: await sql.unsafe(WORKFLOW_EXPLAIN_QUERIES[name], values[name]),
    };
    plans.push(rawPlan);
    const parsedPlan = parseWorkflowExplainPlan(rawPlan.rows, name);
    assertWorkflowExplainPlanEvidence(
      parsedPlan,
      cardinalities[name],
      plannerRegistry,
    );
    parsedPlans[name] = parsedPlan;
  }
  return { parsedPlans, plans };
}

function summarize(result: TransactionEvidence): WorkflowExplainSummary {
  const queries = {} as WorkflowExplainSummary["queries"];
  for (const name of WORKFLOW_EXPLAIN_QUERY_NAMES) {
    const plan = result.parsedPlans[name];
    queries[name] = {
      cardinality: result.cardinalities[name],
      cardinalityClass: classifyWorkflowCardinality(
        result.cardinalities[name],
      ),
      nodeTypes: plan.nodeTypes,
      indexNames: plan.indexNames,
      planningMs: plan.planningMs,
      executionMs: plan.executionMs,
      sharedHitBlocks: plan.sharedHitBlocks,
      sharedReadBlocks: plan.sharedReadBlocks,
      tempReadBlocks: plan.tempReadBlocks,
      tempWrittenBlocks: plan.tempWrittenBlocks,
    };
  }
  return {
    gate: "supplier_purchase_batch_workflow",
    queryCount: 3,
    thresholds: WORKFLOW_EXPLAIN_THRESHOLDS,
    queries,
  };
}

const STABLE_ERROR_CODES = new Set<string>([
  "CONFIRMATION_REQUIRED",
  "MISSING_CONFIG",
  "INVALID_DATABASE_URL",
  "INVALID_EVIDENCE_INPUT",
  ...WORKFLOW_EXPLAIN_ERROR_CODES,
  "TRANSACTION_GUARD_INVALID",
  "INVALID_DEV_TARGET",
  "STATEMENT_TIMEOUT",
  "DATABASE_FAILURE",
  "DATABASE_CLOSE_FAILED",
]);

function normalizeError(error: unknown): WorkflowExplainError {
  if (error instanceof WorkflowExplainError &&
    STABLE_ERROR_CODES.has(error.code)) {
    return error;
  }
  if (isRecord(error) && error.code === "57014") {
    return new WorkflowExplainError(
      "STATEMENT_TIMEOUT",
      "database statement timed out",
    );
  }
  return new WorkflowExplainError("DATABASE_FAILURE", "database query failed");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fail(code: string, message: string): never {
  throw new WorkflowExplainError(code, message);
}

const DEFAULT_DEPENDENCIES: WorkflowExplainDependencies = {
  createDatabase(databaseUrl) {
    return new Bun.SQL(databaseUrl, {
      max: 1,
      prepare: false,
      connectionTimeout: 10,
    }) as unknown as WorkflowExplainDatabase;
  },
};

export async function runWorkflowExplainCli(
  dependencies: WorkflowExplainCliDependencies,
): Promise<void> {
  try {
    const config = parseWorkflowExplainConfig(dependencies.env);
    const evidence = parseWorkflowExplainEvidenceInput(
      await dependencies.readEvidence(config.evidenceFile),
    );
    dependencies.writeStdout(JSON.stringify(
      await dependencies.runGate(config, evidence),
    ));
  } catch (error) {
    const failure = normalizeError(error);
    dependencies.writeStderr(
      `SUPPLIER_PURCHASE_WORKFLOW_EXPLAIN_FAILED:${failure.code}`,
    );
    dependencies.setExitCode(1);
  }
}

const DEFAULT_CLI_DEPENDENCIES: WorkflowExplainCliDependencies = {
  env: process.env,
  readEvidence(path) {
    return Bun.file(path).json();
  },
  runGate(config, evidence) {
    return runWorkflowExplainGate(config, evidence);
  },
  writeStdout(line) {
    console.log(line);
  },
  writeStderr(line) {
    console.error(line);
  },
  setExitCode(code) {
    process.exitCode = code;
  },
};

if (import.meta.main) void runWorkflowExplainCli(DEFAULT_CLI_DEPENDENCIES);
