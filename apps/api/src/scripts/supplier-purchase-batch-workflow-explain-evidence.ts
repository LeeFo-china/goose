import { WorkflowExplainError } from
  "./supplier-purchase-batch-workflow-explain-config";

export const WORKFLOW_EXPLAIN_THRESHOLDS = {
  statementTimeoutMs: 5_000,
  planningMs: 50,
  executionMs: 250,
  sharedReadBlocks: 20_000,
  tempBlocks: 0,
} as const;

export const WORKFLOW_EXPLAIN_CARDINALITY_LIMIT = 1_000;

export const WORKFLOW_EXPLAIN_QUERY_NAMES = [
  "running_instance",
  "pending_task",
  "subject_state",
] as const;

export type WorkflowExplainQueryName =
  typeof WORKFLOW_EXPLAIN_QUERY_NAMES[number];

export const WORKFLOW_EXPLAIN_MANIFEST = {
  running_instance: {
    relation: "workflow_instances",
    indexes: [
      "workflow_instances_running_purchase_batch_uidx",
      "workflow_instances_purchase_batch_lookup_idx",
    ],
  },
  pending_task: {
    relation: "workflow_tasks",
    indexes: ["idx_workflow_tasks_instance_status"],
  },
  subject_state: {
    relation: "workflow_subject_states",
    indexes: ["idx_workflow_subject_states_subject"],
  },
} as const;

export const WORKFLOW_EXPLAIN_ERROR_CODES = [
  "INVALID_PLAN",
  "NON_DEFAULT_PLANNER",
  "INVALID_CARDINALITY",
  "INDEX_RELATION_MISMATCH",
  "INDEX_METADATA_INVALID",
  "UNKNOWN_PLAN",
  "DUPLICATE_PLAN",
  "MISSING_PLAN",
  "PLANNING_THRESHOLD",
  "EXECUTION_THRESHOLD",
  "SHARED_READ_THRESHOLD",
  "TEMP_BLOCKS",
  "LARGE_TABLE_SEQ_SCAN",
  "LARGE_TABLE_INDEX_REQUIRED",
] as const;

export type WorkflowCardinalityClass = "small" | "large";
export type WorkflowExplainSettingValue = string | number | boolean | null;
export type WorkflowExplainSettings = Record<
  string,
  WorkflowExplainSettingValue
>;

export type WorkflowExplainTargetNode = {
  nodeType: string;
  relation: string;
  schema: "public";
};

export type WorkflowExplainPlanEvidence = {
  name: WorkflowExplainQueryName;
  targetNodes: WorkflowExplainTargetNode[];
  indexNames: string[];
  nodeTypes: string[];
  settings: WorkflowExplainSettings;
  planningMs: number;
  executionMs: number;
  sharedHitBlocks: number;
  sharedReadBlocks: number;
  tempReadBlocks: number;
  tempWrittenBlocks: number;
};

export type WorkflowExplainPlannerSetting = {
  name: string;
  current: string;
  bootValue: string;
  isQueryTuning: boolean;
  isPlanCacheMode: boolean;
};

export type WorkflowExplainIndexMetadata = {
  indexName: string;
  schema: string;
  relation: string;
  indisvalid: boolean;
  indisready: boolean;
};

export type WorkflowExplainGateInput = {
  cardinalities: Record<WorkflowExplainQueryName, number>;
  indexMetadata: Record<
    WorkflowExplainQueryName,
    WorkflowExplainIndexMetadata[]
  >;
  plannerSettings: WorkflowExplainPlannerSetting[];
  plans: WorkflowExplainPlanEvidence[];
};

export function classifyWorkflowCardinality(
  value: number,
): WorkflowCardinalityClass {
  if (!Number.isSafeInteger(value) || value < 0 ||
    value > WORKFLOW_EXPLAIN_CARDINALITY_LIMIT) {
    fail("INVALID_CARDINALITY", "bounded cardinality is invalid");
  }
  return value < WORKFLOW_EXPLAIN_CARDINALITY_LIMIT ? "small" : "large";
}

export function parseWorkflowExplainPlan(
  rowsValue: unknown,
  queryName: WorkflowExplainQueryName,
): WorkflowExplainPlanEvidence {
  if (!Array.isArray(rowsValue) || rowsValue.length !== 1) {
    fail("INVALID_PLAN", "EXPLAIN must return exactly one row");
  }
  const row = record(rowsValue[0], "EXPLAIN row");
  const json = parseJson(row["QUERY PLAN"]);
  if (!Array.isArray(json) || json.length !== 1) {
    fail("INVALID_PLAN", "QUERY PLAN must contain exactly one root");
  }
  const root = record(json[0], "EXPLAIN root");
  const planningMs = finiteNumber(root["Planning Time"], "Planning Time");
  const executionMs = finiteNumber(root["Execution Time"], "Execution Time");
  const settings = parseSettings(root.Settings);
  const plan = record(root.Plan, "EXPLAIN root Plan");
  const facts = collectPlanFacts(plan, queryName);

  return {
    name: queryName,
    ...facts,
    settings,
    planningMs,
    executionMs,
    sharedHitBlocks: blocks(plan, "Shared Hit Blocks"),
    sharedReadBlocks: blocks(plan, "Shared Read Blocks"),
    tempReadBlocks: blocks(plan, "Temp Read Blocks"),
    tempWrittenBlocks: blocks(plan, "Temp Written Blocks"),
  };
}

export function assertWorkflowExplainGate(
  input: WorkflowExplainGateInput,
): true {
  for (const name of WORKFLOW_EXPLAIN_QUERY_NAMES) {
    classifyWorkflowCardinality(input.cardinalities[name]);
  }
  for (const name of WORKFLOW_EXPLAIN_QUERY_NAMES) {
    assertIndexMetadata(name, input.indexMetadata[name]);
  }
  assertPlanSet(input.plans);
  assertCurrentPlannerSettings(input.plannerSettings);

  for (const name of WORKFLOW_EXPLAIN_QUERY_NAMES) {
    const plan = input.plans.find((item) => item.name === name)!;
    assertDefaultExplainSettings(plan, input.plannerSettings);
    assertRuntimeThresholds(plan);
    if (classifyWorkflowCardinality(input.cardinalities[name]) === "small") {
      continue;
    }
    if (plan.targetNodes.some((node) => node.nodeType === "Seq Scan")) {
      fail("LARGE_TABLE_SEQ_SCAN", `${name} target relation used Seq Scan`);
    }
    const approved = new Set<string>(WORKFLOW_EXPLAIN_MANIFEST[name].indexes);
    if (!plan.indexNames.some((indexName) => approved.has(indexName))) {
      fail(
        "LARGE_TABLE_INDEX_REQUIRED",
        `${name} approved index is required`,
      );
    }
  }
  return true;
}

function collectPlanFacts(
  plan: Record<string, unknown>,
  queryName: WorkflowExplainQueryName,
): Pick<
  WorkflowExplainPlanEvidence,
  "targetNodes" | "indexNames" | "nodeTypes"
> {
  const targetNodes: WorkflowExplainTargetNode[] = [];
  const indexNames: string[] = [];
  const nodeTypes: string[] = [];
  const targetRelation = WORKFLOW_EXPLAIN_MANIFEST[queryName].relation;

  function visit(
    node: Record<string, unknown>,
    isTargetBitmapDescendant: boolean,
  ): void {
    const nodeType = node["Node Type"];
    if (typeof nodeType !== "string") {
      fail("INVALID_PLAN", "plan node Node Type is required");
    }
    nodeTypes.push(nodeType);

    const isTarget = node["Relation Name"] === targetRelation;
    if (isTarget) {
      if (node.Schema !== "public") {
        fail("INVALID_PLAN", "target relation schema must be public");
      }
      targetNodes.push({
        nodeType,
        relation: targetRelation,
        schema: "public",
      });
      if (nodeType === "Index Scan" || nodeType === "Index Only Scan") {
        indexNames.push(requiredIndexName(node));
      }
    }

    const isBitmapDescendant = isTargetBitmapDescendant ||
      (isTarget && nodeType === "Bitmap Heap Scan");
    if (isTargetBitmapDescendant && nodeType === "Bitmap Index Scan") {
      indexNames.push(requiredIndexName(node));
    }

    if (node.Plans === undefined) return;
    if (!Array.isArray(node.Plans)) {
      fail("INVALID_PLAN", "plan node Plans must be an array");
    }
    for (const child of node.Plans) {
      visit(record(child, "EXPLAIN child Plan"), isBitmapDescendant);
    }
  }

  visit(plan, false);
  if (targetNodes.length === 0) {
    fail("INVALID_PLAN", `${queryName} target relation is missing`);
  }
  return {
    targetNodes,
    indexNames: [...new Set(indexNames)],
    nodeTypes: [...new Set(nodeTypes)],
  };
}

function assertIndexMetadata(
  name: WorkflowExplainQueryName,
  rows: WorkflowExplainIndexMetadata[],
): void {
  const manifest = WORKFLOW_EXPLAIN_MANIFEST[name];
  const metadata = Array.isArray(rows) ? rows : [];
  for (const indexName of manifest.indexes) {
    const matches = metadata.filter((item) => item?.indexName === indexName);
    for (const item of matches) {
      if (item.schema !== "public" || item.relation !== manifest.relation) {
        fail(
          "INDEX_RELATION_MISMATCH",
          `${indexName} relation metadata does not match the manifest`,
        );
      }
    }
    if (matches.length !== 1 || matches[0]!.indisvalid !== true ||
      matches[0]!.indisready !== true) {
      fail(
        "INDEX_METADATA_INVALID",
        `${indexName} index metadata is invalid`,
      );
    }
  }
}

function assertPlanSet(plans: WorkflowExplainPlanEvidence[]): void {
  const allowed = new Set<string>(WORKFLOW_EXPLAIN_QUERY_NAMES);
  if (plans.some((plan) => !allowed.has(plan.name))) {
    fail("UNKNOWN_PLAN", "unknown EXPLAIN plan name");
  }
  for (const name of WORKFLOW_EXPLAIN_QUERY_NAMES) {
    if (plans.filter((plan) => plan.name === name).length > 1) {
      fail("DUPLICATE_PLAN", `${name} EXPLAIN plan is duplicated`);
    }
  }
  for (const name of WORKFLOW_EXPLAIN_QUERY_NAMES) {
    if (!plans.some((plan) => plan.name === name)) {
      fail("MISSING_PLAN", `${name} EXPLAIN plan is required`);
    }
  }
}

function assertCurrentPlannerSettings(
  settings: WorkflowExplainPlannerSetting[],
): void {
  const planCacheMode = settings.filter((setting) =>
    setting.name === "plan_cache_mode" && setting.isPlanCacheMode
  );
  if (planCacheMode.length !== 1 ||
    !settings.some((setting) => setting.isQueryTuning)) {
    fail("NON_DEFAULT_PLANNER", "planner setting evidence is incomplete");
  }
  for (const setting of settings) {
    if ((isRequiredPlannerSetting(setting)) &&
      setting.current !== setting.bootValue) {
      fail("NON_DEFAULT_PLANNER", "current planner setting is not default");
    }
  }
}

function assertDefaultExplainSettings(
  plan: WorkflowExplainPlanEvidence,
  currentSettings: WorkflowExplainPlannerSetting[],
): void {
  const bootValues = new Map(currentSettings
    .filter(isRequiredPlannerSetting)
    .map((setting) => [setting.name, setting.bootValue]));
  for (const [name, value] of Object.entries(plan.settings)) {
    if (!bootValues.has(name) && name !== "plan_cache_mode") continue;
    if (String(value) !== bootValues.get(name)) {
      fail("NON_DEFAULT_PLANNER", `${plan.name} planner setting is not default`);
    }
  }
}

function isRequiredPlannerSetting(
  setting: WorkflowExplainPlannerSetting,
): boolean {
  return setting.isQueryTuning || setting.isPlanCacheMode ||
    setting.name === "plan_cache_mode";
}

function assertRuntimeThresholds(plan: WorkflowExplainPlanEvidence): void {
  if (plan.planningMs > WORKFLOW_EXPLAIN_THRESHOLDS.planningMs) {
    fail("PLANNING_THRESHOLD", `${plan.name} planning threshold exceeded`);
  }
  if (plan.executionMs > WORKFLOW_EXPLAIN_THRESHOLDS.executionMs) {
    fail("EXECUTION_THRESHOLD", `${plan.name} execution threshold exceeded`);
  }
  if (plan.sharedReadBlocks >
    WORKFLOW_EXPLAIN_THRESHOLDS.sharedReadBlocks) {
    fail("SHARED_READ_THRESHOLD", `${plan.name} shared reads exceeded`);
  }
  if (plan.tempReadBlocks + plan.tempWrittenBlocks >
    WORKFLOW_EXPLAIN_THRESHOLDS.tempBlocks) {
    fail("TEMP_BLOCKS", `${plan.name} must not use temp blocks`);
  }
}

function parseSettings(value: unknown): WorkflowExplainSettings {
  if (value === undefined) return {};
  const settings = record(value, "EXPLAIN Settings");
  const parsed: WorkflowExplainSettings = {};
  for (const key of Reflect.ownKeys(settings)) {
    if (typeof key !== "string") {
      fail("INVALID_PLAN", "EXPLAIN Settings keys must be strings");
    }
    const setting = settings[key];
    if (!isSafeScalar(setting)) {
      fail("INVALID_PLAN", "EXPLAIN Settings values must be safe scalars");
    }
    parsed[key] = setting;
  }
  return parsed;
}

function requiredIndexName(node: Record<string, unknown>): string {
  const indexName = node["Index Name"];
  if (typeof indexName !== "string" || indexName.length === 0) {
    fail("INVALID_PLAN", "index scan Index Name is required");
  }
  return indexName;
}

function blocks(node: Record<string, unknown>, key: string): number {
  const value = node[key];
  if (value === undefined) return 0;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    fail("INVALID_PLAN", `${key} must be a non-negative safe integer`);
  }
  return value;
}

function finiteNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    fail("INVALID_PLAN", `${label} must be a non-negative finite number`);
  }
  return value;
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail("INVALID_PLAN", `${label} must be a plain object`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    fail("INVALID_PLAN", `${label} must be a plain object`);
  }
  return value as Record<string, unknown>;
}

function parseJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    fail("INVALID_PLAN", "QUERY PLAN must contain valid JSON");
  }
}

function isSafeScalar(value: unknown): value is WorkflowExplainSettingValue {
  return value === null || typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value));
}

function fail(code: string, message: string): never {
  throw new WorkflowExplainError(code, message);
}
