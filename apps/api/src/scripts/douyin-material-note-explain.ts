import {
  MATERIAL_NOTE_EXPLAIN_FIXTURE_TAG,
  MaterialNoteExplainError,
  parseMaterialNoteExplainConfig,
  type MaterialNoteExplainConfig,
} from "./douyin-material-note-explain-config";
import {
  MATERIAL_NOTE_EXPLAIN_ERROR_CODES,
  MATERIAL_NOTE_EXPLAIN_MANIFEST,
  MATERIAL_NOTE_EXPLAIN_QUERY_NAMES,
  MATERIAL_NOTE_EXPLAIN_THRESHOLDS,
  assertMaterialNoteExplainCurrentPlannerSettings,
  assertMaterialNoteExplainIndexMetadata,
  assertMaterialNoteExplainPlanEvidence,
  classifyMaterialNoteCardinality,
  parseMaterialNoteExplainPlan,
  type MaterialNoteExplainIndexMetadata,
  type MaterialNoteExplainPlanEvidence,
  type MaterialNoteExplainPlannerSetting,
  type MaterialNoteExplainQueryName,
} from "./douyin-material-note-explain-evidence";

export { MATERIAL_NOTE_EXPLAIN_QUERIES }
  from "./douyin-material-note-explain-sql";
import {
  CARDINALITY_QUERIES,
  CLAIM_PREFLIGHT_QUERY,
  FIXTURE_PREFLIGHT_QUERY,
  INDEX_METADATA_QUERY,
  MATERIAL_NOTE_EXPLAIN_QUERIES,
  PLANNER_SETTINGS_QUERY,
  ROLE_QUERY,
  TRANSACTION_GUARD_QUERY,
} from "./douyin-material-note-explain-sql";

export interface MaterialNoteExplainSql {
  unsafe(text: string, values?: unknown[]): Promise<unknown>;
}

export interface MaterialNoteExplainDatabase {
  begin<Result>(
    callback: (sql: MaterialNoteExplainSql) => Promise<Result>,
  ): Promise<Result>;
  close(): Promise<void>;
}

export interface MaterialNoteExplainDependencies {
  createDatabase(databaseUrl: string): MaterialNoteExplainDatabase;
}

export interface MaterialNoteExplainSummary {
  readonly gate: "douyin_material_note_queries";
  readonly fixtureTag: typeof MATERIAL_NOTE_EXPLAIN_FIXTURE_TAG;
  readonly queryCount: 3;
  readonly thresholds: typeof MATERIAL_NOTE_EXPLAIN_THRESHOLDS;
  readonly queries: Record<MaterialNoteExplainQueryName, {
    readonly cardinality: number;
    readonly cardinalityClass: "small" | "large";
    readonly nodeTypes: string[];
    readonly indexNames: string[];
    readonly planningMs: number;
    readonly executionMs: number;
    readonly actualRows: number;
    readonly actualLoops: number;
    readonly sharedHitBlocks: number;
    readonly sharedReadBlocks: number;
    readonly tempReadBlocks: number;
    readonly tempWrittenBlocks: number;
  }>;
}

export interface MaterialNoteExplainCliDependencies {
  readonly env: Record<string, string | undefined>;
  runGate(config: MaterialNoteExplainConfig): Promise<MaterialNoteExplainSummary>;
  writeStdout(line: string): void;
  writeStderr(line: string): void;
  setExitCode(code: number): void;
}

interface Fixture {
  readonly noteId: string;
  readonly tenantId: string;
  readonly installationId: string;
}

interface TransactionGuard {
  readonly backendPid: number;
  readonly readOnly: "on";
  readonly isolation: "repeatable read";
}

interface TransactionEvidence {
  readonly cardinalities: Record<MaterialNoteExplainQueryName, number>;
  readonly plans: Record<MaterialNoteExplainQueryName, MaterialNoteExplainPlanEvidence>;
}

export async function runMaterialNoteExplainGate(
  config: MaterialNoteExplainConfig,
  dependencies: MaterialNoteExplainDependencies = DEFAULT_DEPENDENCIES,
): Promise<MaterialNoteExplainSummary> {
  let database: MaterialNoteExplainDatabase;
  try {
    database = dependencies.createDatabase(config.databaseUrl);
  } catch (error) {
    throw normalizeError(error);
  }

  let primaryFailure: MaterialNoteExplainError | undefined;
  try {
    const evidence = await database.begin(async (sql) => {
      await sql.unsafe(
        "set transaction isolation level repeatable read, read only",
      );
      await sql.unsafe(
        "set local statement_timeout = '" +
          MATERIAL_NOTE_EXPLAIN_THRESHOLDS.statementTimeoutMs + "ms'",
      );
      const startGuard = await readTransactionGuard(sql);
      await assertPrivilegedRole(sql);
      const plannerSettings = await sql.unsafe(PLANNER_SETTINGS_QUERY) as
        MaterialNoteExplainPlannerSetting[];
      const plannerRegistry = assertMaterialNoteExplainCurrentPlannerSettings(
        plannerSettings,
      );
      const fixture = await readFixture(sql);
      const subjectHash = await readSubjectHash(sql, fixture);
      const cardinalities = await readCardinalities(sql);
      await readAndAssertIndexMetadata(sql);
      const plans = await readPlans(
        sql,
        fixture,
        subjectHash,
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
      return { cardinalities, plans };
    });
    return summarize(evidence);
  } catch (error) {
    primaryFailure = normalizeError(error);
    throw primaryFailure;
  } finally {
    try {
      await database.close();
    } catch {
      if (primaryFailure === undefined) {
        throw new MaterialNoteExplainError(
          "DATABASE_CLOSE_FAILED",
          "database close failed",
        );
      }
    }
  }
}

async function readTransactionGuard(
  sql: MaterialNoteExplainSql,
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

async function assertPrivilegedRole(
  sql: MaterialNoteExplainSql,
): Promise<void> {
  const rows = await sql.unsafe(ROLE_QUERY);
  if (!Array.isArray(rows) || rows.length !== 1 || !isRecord(rows[0])) {
    fail("INVALID_DEV_TARGET", "development database role is invalid");
  }
  const { rolsuper, rolbypassrl } = rows[0];
  if (typeof rolsuper !== "boolean" ||
    typeof rolbypassrl !== "boolean" ||
    (!rolsuper && !rolbypassrl)) {
    fail("INVALID_DEV_TARGET", "development database role is invalid");
  }
}

async function readFixture(sql: MaterialNoteExplainSql): Promise<Fixture> {
  const rows = await sql.unsafe(
    FIXTURE_PREFLIGHT_QUERY,
    [MATERIAL_NOTE_EXPLAIN_FIXTURE_TAG],
  );
  if (!Array.isArray(rows) || rows.length !== 1 || !isRecord(rows[0])) {
    fail("INVALID_FIXTURE", "fixed material note fixture is invalid");
  }
  const { noteId, tenantId, installationId } = rows[0];
  if (!isUuid(noteId) || !isUuid(tenantId) || !isUuid(installationId)) {
    fail("INVALID_FIXTURE", "fixed material note fixture is invalid");
  }
  return { noteId, tenantId, installationId };
}

async function readSubjectHash(
  sql: MaterialNoteExplainSql,
  fixture: Fixture,
): Promise<string> {
  const rows = await sql.unsafe(CLAIM_PREFLIGHT_QUERY, [
    fixture.tenantId,
    fixture.installationId,
    fixture.noteId,
  ]);
  if (Array.isArray(rows) && rows.length === 0) {
    fail(
      "REPRESENTATIVE_CLAIM_MISSING",
      "representative active claim is required",
    );
  }
  if (!Array.isArray(rows) || rows.length !== 1 || !isRecord(rows[0]) ||
    typeof rows[0].subjectHash !== "string" ||
    !/^[0-9a-f]{64}$/.test(rows[0].subjectHash)) {
    fail("INVALID_FIXTURE", "representative active claim is invalid");
  }
  return rows[0].subjectHash;
}

async function readCardinalities(
  sql: MaterialNoteExplainSql,
): Promise<Record<MaterialNoteExplainQueryName, number>> {
  const cardinalities = {} as Record<MaterialNoteExplainQueryName, number>;
  for (const name of MATERIAL_NOTE_EXPLAIN_QUERY_NAMES) {
    const rows = await sql.unsafe(CARDINALITY_QUERIES[name]);
    if (!Array.isArray(rows) || rows.length !== 1 || !isRecord(rows[0])) {
      fail("INVALID_CARDINALITY", "bounded cardinality is invalid");
    }
    const value = rows[0].count;
    classifyMaterialNoteCardinality(
      typeof value === "number" ? value : Number.NaN,
    );
    cardinalities[name] = value as number;
  }
  return cardinalities;
}

async function readAndAssertIndexMetadata(
  sql: MaterialNoteExplainSql,
): Promise<void> {
  const value = await sql.unsafe(INDEX_METADATA_QUERY);
  const rows = Array.isArray(value) ? value : [];
  for (const name of MATERIAL_NOTE_EXPLAIN_QUERY_NAMES) {
    const approved = new Set<string>(
      MATERIAL_NOTE_EXPLAIN_MANIFEST[name].indexes.map((index) => index.name),
    );
    const metadata = rows.filter(
      (row) => isRecord(row) && typeof row.indexName === "string" &&
        approved.has(row.indexName),
    ) as MaterialNoteExplainIndexMetadata[];
    assertMaterialNoteExplainIndexMetadata(name, metadata);
  }
}

async function readPlans(
  sql: MaterialNoteExplainSql,
  fixture: Fixture,
  subjectHash: string,
  cardinalities: Record<MaterialNoteExplainQueryName, number>,
  plannerRegistry: Map<string, string>,
): Promise<Record<MaterialNoteExplainQueryName, MaterialNoteExplainPlanEvidence>> {
  const bindings: Record<MaterialNoteExplainQueryName, unknown[]> = {
    public_list: [fixture.tenantId, fixture.installationId, subjectHash],
    tenant_keyword_list: [
      fixture.tenantId,
      "%" + MATERIAL_NOTE_EXPLAIN_FIXTURE_TAG + "%",
    ],
    owned_active_list: [
      fixture.tenantId,
      fixture.installationId,
      subjectHash,
    ],
  };
  const plans = {} as Record<
    MaterialNoteExplainQueryName,
    MaterialNoteExplainPlanEvidence
  >;
  for (const name of MATERIAL_NOTE_EXPLAIN_QUERY_NAMES) {
    const rows = await sql.unsafe(
      MATERIAL_NOTE_EXPLAIN_QUERIES[name],
      bindings[name],
    );
    const plan = parseMaterialNoteExplainPlan(rows, name);
    assertMaterialNoteExplainPlanEvidence(
      plan,
      cardinalities[name],
      plannerRegistry,
    );
    plans[name] = plan;
  }
  return plans;
}

function summarize(
  evidence: TransactionEvidence,
): MaterialNoteExplainSummary {
  const queries = {} as MaterialNoteExplainSummary["queries"];
  for (const name of MATERIAL_NOTE_EXPLAIN_QUERY_NAMES) {
    const plan = evidence.plans[name];
    queries[name] = {
      cardinality: evidence.cardinalities[name],
      cardinalityClass: classifyMaterialNoteCardinality(
        evidence.cardinalities[name],
      ),
      nodeTypes: plan.nodeTypes,
      indexNames: plan.indexNames,
      planningMs: plan.planningMs,
      executionMs: plan.executionMs,
      actualRows: plan.actualRows,
      actualLoops: plan.actualLoops,
      sharedHitBlocks: plan.sharedHitBlocks,
      sharedReadBlocks: plan.sharedReadBlocks,
      tempReadBlocks: plan.tempReadBlocks,
      tempWrittenBlocks: plan.tempWrittenBlocks,
    };
  }
  return {
    gate: "douyin_material_note_queries",
    fixtureTag: MATERIAL_NOTE_EXPLAIN_FIXTURE_TAG,
    queryCount: 3,
    thresholds: MATERIAL_NOTE_EXPLAIN_THRESHOLDS,
    queries,
  };
}

const STABLE_ERROR_CODES = new Set<string>([
  "CONFIRMATION_REQUIRED",
  "MISSING_CONFIG",
  "INVALID_DATABASE_URL",
  ...MATERIAL_NOTE_EXPLAIN_ERROR_CODES,
  "INVALID_FIXTURE",
  "REPRESENTATIVE_CLAIM_MISSING",
  "TRANSACTION_GUARD_INVALID",
  "INVALID_DEV_TARGET",
  "QUERY_TIMEOUT",
  "DATABASE_FAILURE",
  "DATABASE_CLOSE_FAILED",
]);

function normalizeError(error: unknown): MaterialNoteExplainError {
  if (error instanceof MaterialNoteExplainError &&
    STABLE_ERROR_CODES.has(error.code)) {
    return error;
  }
  if (isRecord(error) && error.code === "57014") {
    return new MaterialNoteExplainError(
      "QUERY_TIMEOUT",
      "database statement timed out",
    );
  }
  return new MaterialNoteExplainError(
    "DATABASE_FAILURE",
    "database query failed",
  );
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
      .test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fail(code: string, message: string): never {
  throw new MaterialNoteExplainError(code, message);
}

const DEFAULT_DEPENDENCIES: MaterialNoteExplainDependencies = {
  createDatabase(databaseUrl) {
    return new Bun.SQL(databaseUrl, {
      max: 1,
      prepare: false,
      connectionTimeout: 10,
    }) as unknown as MaterialNoteExplainDatabase;
  },
};

export async function runMaterialNoteExplainCli(
  dependencies: MaterialNoteExplainCliDependencies,
): Promise<void> {
  try {
    const config = parseMaterialNoteExplainConfig(dependencies.env);
    dependencies.writeStdout(JSON.stringify(
      await dependencies.runGate(config),
    ));
  } catch (error) {
    const failure = normalizeError(error);
    dependencies.writeStderr(
      "DOUYIN_MATERIAL_NOTE_EXPLAIN_FAILED:" + failure.code,
    );
    dependencies.setExitCode(1);
  }
}

const DEFAULT_CLI_DEPENDENCIES: MaterialNoteExplainCliDependencies = {
  env: process.env,
  runGate(config) {
    return runMaterialNoteExplainGate(config);
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

if (import.meta.main) {
  void runMaterialNoteExplainCli(DEFAULT_CLI_DEPENDENCIES);
}
