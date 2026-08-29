import { ProjectOptionExplainError } from
  "./supplier-purchase-project-options-explain-config";

export const PROJECT_OPTION_EXPLAIN_THRESHOLDS = {
  planningMs: 50,
  executionMs: 250,
  sharedReadBlocks: 20_000,
  tempBlocks: 0,
} as const;

export const LARGE_TENANT_PROJECT_CARDINALITY = 1_000;

const COMPOSITE_INDEX = "projects_tenant_updated_id_purchase_batch_idx";
const KEYWORD_INDEXES = new Set([
  COMPOSITE_INDEX,
  "projects_name_purchase_batch_trgm_idx",
]);

export type ProjectOptionExplainQueryName =
  | "tenant_time_page"
  | "tenant_time_count"
  | "tenant_time_keyword_page"
  | "tenant_time_keyword_count"
  | "bounded_visible_page";

export type ParsedProjectOptionExplainPlan = {
  planningMs: number;
  executionMs: number;
  indexNames: string[];
  nodeTypes: string[];
  sharedHitBlocks: number;
  sharedReadBlocks: number;
  tempReadBlocks: number;
  tempWrittenBlocks: number;
  hasExplicitSort: boolean;
};

export type ProjectOptionExplainEvidence = ParsedProjectOptionExplainPlan & {
  name: ProjectOptionExplainQueryName;
};

export function parseProjectOptionExplainPlan(
  rowsValue: unknown,
): ParsedProjectOptionExplainPlan {
  if (!Array.isArray(rowsValue) || rowsValue.length !== 1) {
    fail("INVALID_PLAN", "EXPLAIN must return exactly one row");
  }
  const row = record(rowsValue[0], "EXPLAIN row");
  const json = parseJson(row["QUERY PLAN"]);
  if (!Array.isArray(json) || json.length !== 1) {
    fail("INVALID_PLAN", "QUERY PLAN must contain exactly one plan");
  }
  const root = record(json[0], "EXPLAIN root");
  const planningMs = number(root["Planning Time"], "Planning Time");
  const executionMs = number(root["Execution Time"], "Execution Time");
  const indexNames: string[] = [];
  const nodeTypes: string[] = [];
  const plan = record(root.Plan, "EXPLAIN root Plan");
  collectPlanFacts(plan, indexNames, nodeTypes);
  return {
    planningMs,
    executionMs,
    indexNames: [...new Set(indexNames)],
    nodeTypes: [...new Set(nodeTypes)],
    sharedHitBlocks: blocks(plan, "Shared Hit Blocks"),
    sharedReadBlocks: blocks(plan, "Shared Read Blocks"),
    tempReadBlocks: blocks(plan, "Temp Read Blocks"),
    tempWrittenBlocks: blocks(plan, "Temp Written Blocks"),
    hasExplicitSort: nodeTypes.some((type) => type.endsWith("Sort")),
  };
}

export function assertProjectOptionExplainThresholds(
  plans: readonly ProjectOptionExplainEvidence[],
  tenantProjectCount: number,
): true {
  if (!Number.isSafeInteger(tenantProjectCount) || tenantProjectCount < 0) {
    fail("INVALID_CARDINALITY", "tenant project cardinality is invalid");
  }
  const byName = new Map(plans.map((plan) => [plan.name, plan]));
  for (const required of [
    "tenant_time_page",
    "tenant_time_count",
    "tenant_time_keyword_page",
    "tenant_time_keyword_count",
  ] as const) {
    if (!byName.has(required)) {
      fail("MISSING_PLAN", `${required} EXPLAIN evidence is required`);
    }
  }
  for (const plan of plans) assertRuntimeThresholds(plan);
  if (tenantProjectCount < LARGE_TENANT_PROJECT_CARDINALITY) return true;

  const timePage = byName.get("tenant_time_page")!;
  if (!timePage.indexNames.includes(COMPOSITE_INDEX)) {
    fail("INDEX_REQUIRED", `tenant_time_page must use ${COMPOSITE_INDEX}`);
  }
  if (timePage.hasExplicitSort) {
    fail("SORT_NOT_ALLOWED", "tenant_time_page must not use an explicit Sort");
  }
  for (const name of [
    "tenant_time_keyword_page",
    "tenant_time_keyword_count",
  ] as const) {
    const plan = byName.get(name)!;
    if (!plan.indexNames.some((indexName) => KEYWORD_INDEXES.has(indexName))) {
      fail("KEYWORD_INDEX_REQUIRED", `${name} keyword index is required`);
    }
  }
  return true;
}

function assertRuntimeThresholds(plan: ProjectOptionExplainEvidence): void {
  if (plan.planningMs > PROJECT_OPTION_EXPLAIN_THRESHOLDS.planningMs) {
    fail("PLANNING_THRESHOLD", `${plan.name} planning threshold exceeded`);
  }
  if (plan.executionMs > PROJECT_OPTION_EXPLAIN_THRESHOLDS.executionMs) {
    fail("EXECUTION_THRESHOLD", `${plan.name} execution threshold exceeded`);
  }
  if (plan.sharedReadBlocks >
    PROJECT_OPTION_EXPLAIN_THRESHOLDS.sharedReadBlocks) {
    fail("SHARED_READ_THRESHOLD", `${plan.name} shared read threshold exceeded`);
  }
  if (plan.tempReadBlocks + plan.tempWrittenBlocks >
    PROJECT_OPTION_EXPLAIN_THRESHOLDS.tempBlocks) {
    fail("TEMP_BLOCKS", `${plan.name} must not use temp blocks`);
  }
}

function collectPlanFacts(
  node: Record<string, unknown>,
  indexNames: string[],
  nodeTypes: string[],
): void {
  const nodeType = node["Node Type"];
  if (typeof nodeType !== "string") {
    fail("INVALID_PLAN", "plan node Node Type is required");
  }
  nodeTypes.push(nodeType);
  const indexName = node["Index Name"];
  if (indexName !== undefined && typeof indexName !== "string") {
    fail("INVALID_PLAN", "plan node Index Name must be a string");
  }
  if (typeof indexName === "string") indexNames.push(indexName);
  if (node.Plans === undefined) return;
  if (!Array.isArray(node.Plans)) {
    fail("INVALID_PLAN", "plan node Plans must be an array");
  }
  for (const child of node.Plans) {
    collectPlanFacts(record(child, "EXPLAIN child Plan"), indexNames, nodeTypes);
  }
}

function blocks(node: Record<string, unknown>, key: string): number {
  const value = node[key];
  return value === undefined ? 0 : number(value, key, true);
}

function number(value: unknown, label: string, integer = false): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 ||
    (integer && !Number.isSafeInteger(value))) {
    fail("INVALID_PLAN", `${label} must be a non-negative number`);
  }
  return value;
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail("INVALID_PLAN", `${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function parseJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    fail("INVALID_PLAN", "QUERY PLAN must contain JSON");
  }
}

function fail(code: string, message: string): never {
  throw new ProjectOptionExplainError(code, message);
}
