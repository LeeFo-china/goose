import { MaterialNoteExplainError } from "./douyin-material-note-explain-config";

export const MATERIAL_NOTE_EXPLAIN_THRESHOLDS = {
  statementTimeoutMs: 5_000,
  planningMs: 50,
  executionMs: 250,
  sharedReadBlocks: 20_000,
  tempBlocks: 0,
} as const;

export const MATERIAL_NOTE_EXPLAIN_CARDINALITY_LIMIT = 1_000;
const MANAGED_SETTING_OVERRIDES = new Set([
  ["effective_cache_size", "128MB", "16384", "524288",
    "configuration file"].join("\0"),
  ["search_path", "\"\\$user\", public, extensions",
    "\"\\$user\", public, extensions", "\"$user\", public", "user"].join("\0"),
]);

export const MATERIAL_NOTE_EXPLAIN_QUERY_NAMES = [
  "public_list",
  "tenant_keyword_list",
  "owned_active_list",
] as const;
export type MaterialNoteExplainQueryName =
  typeof MATERIAL_NOTE_EXPLAIN_QUERY_NAMES[number];

export const MATERIAL_NOTE_EXPLAIN_MANIFEST = {
  public_list: {
    primaryRelation: "douyin_material_notes",
    relations: [
      "douyin_material_notes",
      "douyin_material_note_versions",
      "douyin_material_note_claims",
    ],
    indexes: [
      { name: "douyin_material_notes_public_idx", relation: "douyin_material_notes" },
      { name: "douyin_material_note_versions_tenant_note_idx",
        relation: "douyin_material_note_versions" },
      { name: "douyin_material_note_claims_owned_idx",
        relation: "douyin_material_note_claims" },
    ],
  },
  tenant_keyword_list: {
    primaryRelation: "douyin_material_note_versions",
    relations: ["douyin_material_notes", "douyin_material_note_versions"],
    indexes: [
      { name: "douyin_material_notes_tenant_idx", relation: "douyin_material_notes" },
      { name: "douyin_material_note_versions_title_trgm_idx",
        relation: "douyin_material_note_versions" },
      { name: "douyin_material_note_versions_summary_trgm_idx",
        relation: "douyin_material_note_versions" },
      { name: "douyin_material_note_versions_category_trgm_idx",
        relation: "douyin_material_note_versions" },
    ],
  },
  owned_active_list: {
    primaryRelation: "douyin_material_note_claims",
    relations: [
      "douyin_material_note_claims",
      "douyin_material_notes",
      "douyin_material_note_versions",
    ],
    indexes: [
      { name: "douyin_material_note_claims_owned_idx",
        relation: "douyin_material_note_claims" },
      { name: "douyin_material_note_versions_tenant_note_idx",
        relation: "douyin_material_note_versions" },
    ],
  },
} as const;

export const MATERIAL_NOTE_EXPLAIN_ERROR_CODES = [
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

export type MaterialNoteExplainErrorCode =
  typeof MATERIAL_NOTE_EXPLAIN_ERROR_CODES[number];
export type MaterialNoteCardinalityClass = "small" | "large";
export type MaterialNoteExplainSettingValue = string | number | boolean | null;
export type MaterialNoteExplainSettings = Record<string, MaterialNoteExplainSettingValue>;
export type MaterialNoteExplainTargetNode = {
  nodeType: string;
  relation: string;
  schema: "public";
};
export type MaterialNoteExplainPlanEvidence = {
  name: MaterialNoteExplainQueryName;
  targetNodes: MaterialNoteExplainTargetNode[];
  indexNames: string[];
  nodeTypes: string[];
  settings: MaterialNoteExplainSettings;
  planningMs: number;
  executionMs: number;
  sharedHitBlocks: number;
  sharedReadBlocks: number;
  tempReadBlocks: number;
  tempWrittenBlocks: number;
  actualRows: number;
  actualLoops: number;
};

export type MaterialNoteExplainPlannerSetting = {
  name: string;
  current: string;
  rawValue: string;
  bootValue: string;
  category: string;
  source: string;
};

export type MaterialNoteExplainIndexMetadata = {
  indexName: string;
  schema: string;
  relation: string;
  indisvalid: boolean;
  indisready: boolean;
};
export function classifyMaterialNoteCardinality(
  value: number,
): MaterialNoteCardinalityClass {
  if (!Number.isSafeInteger(value) || value < 0 ||
    value > MATERIAL_NOTE_EXPLAIN_CARDINALITY_LIMIT) {
    fail("INVALID_CARDINALITY", "bounded cardinality is invalid");
  }
  return value < MATERIAL_NOTE_EXPLAIN_CARDINALITY_LIMIT ? "small" : "large";
}

export function parseMaterialNoteExplainPlan(
  rowsValue: unknown,
  queryName: MaterialNoteExplainQueryName,
): MaterialNoteExplainPlanEvidence {
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

export function assertMaterialNoteExplainPlanEvidence(
  plan: MaterialNoteExplainPlanEvidence,
  cardinality: number,
  plannerRegistry: Map<string, string>,
): void {
  assertDefaultExplainSettings(plan, plannerRegistry);
  assertRuntimeThresholds(plan);
  if (classifyMaterialNoteCardinality(cardinality) === "small") return;
  if (plan.targetNodes.some((node) => node.nodeType === "Seq Scan")) {
    fail("LARGE_TABLE_SEQ_SCAN", `${plan.name} target relation used Seq Scan`);
  }
  const approved = new Set(
    MATERIAL_NOTE_EXPLAIN_MANIFEST[plan.name].indexes
      .filter((index) => index.relation ===
        MATERIAL_NOTE_EXPLAIN_MANIFEST[plan.name].primaryRelation)
      .map((index) => index.name),
  );
  if (!plan.indexNames.some((indexName) => approved.has(indexName))) {
    fail("LARGE_TABLE_INDEX_REQUIRED", `${plan.name} approved index is required`);
  }
}

function collectPlanFacts(
  plan: Record<string, unknown>,
  queryName: MaterialNoteExplainQueryName,
): Pick<
  MaterialNoteExplainPlanEvidence,
  "targetNodes" | "indexNames" | "nodeTypes" | "actualRows" | "actualLoops"
> {
  const targetNodes: MaterialNoteExplainTargetNode[] = [];
  const indexNames: string[] = [];
  const nodeTypes: string[] = [];
  let actualRows = 0;
  let actualLoops = 0;
  const targetRelation = MATERIAL_NOTE_EXPLAIN_MANIFEST[queryName].primaryRelation;

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
      actualRows += blocks(node, "Actual Rows");
      actualLoops += blocks(node, "Actual Loops");
      if (nodeType === "Index Scan" || nodeType === "Index Only Scan") {
        indexNames.push(requiredIndexName(node));
      }
    }

    const hasNoRelation = node["Relation Name"] === undefined;
    const isBitmapConnector = hasNoRelation &&
      (nodeType === "BitmapAnd" || nodeType === "BitmapOr");
    const childHasTargetBitmapContext =
      (isTarget && nodeType === "Bitmap Heap Scan") ||
      (isTargetBitmapDescendant && isBitmapConnector);
    if (isTargetBitmapDescendant && hasNoRelation &&
      nodeType === "Bitmap Index Scan") {
      indexNames.push(requiredIndexName(node));
    }

    if (node.Plans === undefined) return;
    if (!Array.isArray(node.Plans)) {
      fail("INVALID_PLAN", "plan node Plans must be an array");
    }
    for (const child of node.Plans) {
      visit(record(child, "EXPLAIN child Plan"), childHasTargetBitmapContext);
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
    actualRows,
    actualLoops,
  };
}

export function assertMaterialNoteExplainIndexMetadata(
  name: MaterialNoteExplainQueryName,
  rows: MaterialNoteExplainIndexMetadata[],
): void {
  const manifest = MATERIAL_NOTE_EXPLAIN_MANIFEST[name];
  const metadata = Array.isArray(rows) ? rows : [];
  for (const expected of manifest.indexes) {
    const matches = metadata.filter(
      (item) => item?.indexName === expected.name,
    );
    for (const item of matches) {
      if (item.schema !== "public" ||
        item.relation !== expected.relation) {
        fail(
          "INDEX_RELATION_MISMATCH",
          `${expected.name} relation metadata does not match the manifest`,
        );
      }
    }
    if (matches.length !== 1 || matches[0]!.indisvalid !== true ||
      matches[0]!.indisready !== true) {
      fail(
        "INDEX_METADATA_INVALID",
        `${expected.name} index metadata is invalid`,
      );
    }
  }
}

export function assertMaterialNoteExplainCurrentPlannerSettings(
  settings: unknown,
): Map<string, string> {
  if (!Array.isArray(settings)) {
    fail("NON_DEFAULT_PLANNER", "planner setting evidence must be an array");
  }
  const registry = new Map<string, string>();
  let planCacheModeCount = 0;
  let queryTuningCount = 0;
  for (const value of settings) {
    const setting = plannerSetting(value);
    if (registry.has(setting.name)) {
      fail("NON_DEFAULT_PLANNER", "planner setting names must be unique");
    }
    const managedOverride = MANAGED_SETTING_OVERRIDES.has([
      setting.name, setting.current, setting.rawValue,
      setting.bootValue, setting.source,
    ].join("\0"));
    const sourceAllowed = setting.source === "default" ||
      setting.source === "configuration file" || managedOverride;
    if (!sourceAllowed ||
      (setting.rawValue !== setting.bootValue && !managedOverride)) {
      fail("NON_DEFAULT_PLANNER", "current planner setting is not default");
    }
    if (setting.name === "plan_cache_mode") planCacheModeCount += 1;
    if (setting.name !== "plan_cache_mode" &&
      setting.category.startsWith("Query Tuning /")) {
      queryTuningCount += 1;
    }
    registry.set(setting.name, setting.current);
  }
  if (planCacheModeCount !== 1 || queryTuningCount === 0) {
    fail("NON_DEFAULT_PLANNER", "planner setting evidence is incomplete");
  }
  return registry;
}

function assertDefaultExplainSettings(
  plan: MaterialNoteExplainPlanEvidence,
  plannerRegistry: Map<string, string>,
): void {
  for (const [name, value] of Object.entries(plan.settings)) {
    if (name === "statement_timeout") continue;
    if (!plannerRegistry.has(name) ||
      String(value) !== plannerRegistry.get(name)) {
      fail("NON_DEFAULT_PLANNER", `${plan.name} planner setting is not default`);
    }
  }
}

function plannerSetting(value: unknown): MaterialNoteExplainPlannerSetting {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail("NON_DEFAULT_PLANNER", "planner setting row must be an object");
  }
  const row = value as Record<string, unknown>;
  const { name, current, rawValue, bootValue, category, source } = row;
  if (typeof name !== "string" || name.trim().length === 0 ||
    typeof current !== "string" || typeof rawValue !== "string" ||
    typeof bootValue !== "string" || typeof category !== "string" ||
    typeof source !== "string") {
    fail("NON_DEFAULT_PLANNER", "planner setting row is malformed");
  }
  if (!category.startsWith("Query Tuning /") &&
    name !== "plan_cache_mode" && name !== "search_path") {
    fail("NON_DEFAULT_PLANNER", "planner setting scope is invalid");
  }
  return { name, current, rawValue, bootValue, category, source };
}

function assertRuntimeThresholds(plan: MaterialNoteExplainPlanEvidence): void {
  if (plan.planningMs > MATERIAL_NOTE_EXPLAIN_THRESHOLDS.planningMs) {
    fail("PLANNING_THRESHOLD", `${plan.name} planning threshold exceeded`);
  }
  if (plan.executionMs > MATERIAL_NOTE_EXPLAIN_THRESHOLDS.executionMs) {
    fail("EXECUTION_THRESHOLD", `${plan.name} execution threshold exceeded`);
  }
  if (plan.sharedReadBlocks >
    MATERIAL_NOTE_EXPLAIN_THRESHOLDS.sharedReadBlocks) {
    fail("SHARED_READ_THRESHOLD", `${plan.name} shared reads exceeded`);
  }
  if (plan.tempReadBlocks + plan.tempWrittenBlocks >
    MATERIAL_NOTE_EXPLAIN_THRESHOLDS.tempBlocks) {
    fail("TEMP_BLOCKS", `${plan.name} must not use temp blocks`);
  }
}

function parseSettings(value: unknown): MaterialNoteExplainSettings {
  if (value === undefined) return {};
  const settings = record(value, "EXPLAIN Settings");
  const parsed: MaterialNoteExplainSettings = {};
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

function isSafeScalar(value: unknown): value is MaterialNoteExplainSettingValue {
  return value === null || typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value));
}

function fail(code: MaterialNoteExplainErrorCode, message: string): never {
  throw new MaterialNoteExplainError(code, message);
}
