import {
  parseSupplierPurchasableSkuDevelopmentDatabaseUrl,
  redactSupplierPurchasableSkuDevelopmentDatabaseUrl,
  type SupplierPurchasableSkuDatabaseConnection,
} from "./supplier-purchasable-sku-development-database";

export type SupplierPurchasableSkuExplainConfig = {
  databaseConnection: SupplierPurchasableSkuDatabaseConnection;
  databaseHost: string;
  redactedDatabaseUrl: string;
};

export type SupplierPurchasableSkuExplainPlan = {
  indexNames: string[];
  relationAccesses: Record<
    string,
    { indexNames: string[]; nodeTypes: string[] }
  >;
  sequentialScans: string[];
  buffers: { sharedHit: number; sharedRead: number };
  hasRuntimeEvidence: boolean;
};

export const SUPPLIER_PURCHASABLE_SKU_EXPLAIN_QUERY_NAMES = [
  "currentDefault",
  "earliestFuture",
  "targetCurrentItem",
  "setBasedCopy",
] as const;
type ExplainQueryName =
  typeof SUPPLIER_PURCHASABLE_SKU_EXPLAIN_QUERY_NAMES[number];
type ExplainPlanMap = Record<ExplainQueryName, SupplierPurchasableSkuExplainPlan>;

export type SupplierPurchasableSkuExplainGateway = {
  explain(name: ExplainQueryName): Promise<unknown>;
  close(): Promise<void>;
};

export type SupplierPurchasableSkuExplainSummary = {
  indexes: Record<ExplainQueryName, string[]>;
  buffers: Record<
    ExplainQueryName,
    SupplierPurchasableSkuExplainPlan["buffers"]
  >;
  query_count: 4;
  n_plus_one: false;
};

const EXPLAIN_DATABASE_URL = "SUPPLIER_PURCHASABLE_SKU_EXPLAIN_DB_URL";
const SCOPED_PRICE_TABLES = new Set([
  "supplier_price_lists",
  "supplier_price_list_items",
]);
const EXPECTED_INDEXED_RELATIONS: Record<ExplainQueryName, string[]> = {
  currentDefault: ["supplier_price_lists", "supplier_price_list_items"],
  earliestFuture: ["supplier_price_lists", "supplier_price_list_items"],
  targetCurrentItem: ["supplier_price_list_items"],
  setBasedCopy: ["supplier_price_list_items"],
};

class SupplierPurchasableSkuExplainError extends Error {}

function object(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new SupplierPurchasableSkuExplainError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function json(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new SupplierPurchasableSkuExplainError(
      "QUERY PLAN must contain JSON",
    );
  }
}

function blockCount(node: Record<string, unknown>, key: string): number {
  const value = node[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function descendantIndexNames(value: unknown): string[] {
  const node = object(value, "EXPLAIN plan node");
  const indexes = typeof node["Index Name"] === "string"
    ? [node["Index Name"]]
    : [];
  if (!Array.isArray(node.Plans)) return indexes;
  for (const child of node.Plans) {
    indexes.push(...descendantIndexNames(child));
  }
  return indexes;
}

function collectPlanEvidence(
  value: unknown,
  evidence: Omit<SupplierPurchasableSkuExplainPlan, "hasRuntimeEvidence">,
): void {
  const node = object(value, "EXPLAIN plan node");
  const nodeType = node["Node Type"];
  if (typeof nodeType !== "string") {
    throw new SupplierPurchasableSkuExplainError("plan node type is required");
  }
  const relation = node["Relation Name"];
  if (typeof node["Index Name"] === "string") {
    evidence.indexNames.push(node["Index Name"]);
  }
  if (nodeType === "Seq Scan" && typeof relation === "string" &&
    SCOPED_PRICE_TABLES.has(relation)) {
    evidence.sequentialScans.push(relation);
  }
  if (typeof relation === "string") {
    const access = evidence.relationAccesses[relation] ??= {
      indexNames: [],
      nodeTypes: [],
    };
    access.nodeTypes.push(nodeType);
    if (typeof node["Index Name"] === "string") {
      access.indexNames.push(node["Index Name"]);
    } else if (nodeType === "Bitmap Heap Scan") {
      access.indexNames.push(...descendantIndexNames(node));
    }
  }
  evidence.buffers.sharedHit += blockCount(node, "Shared Hit Blocks");
  evidence.buffers.sharedRead += blockCount(node, "Shared Read Blocks");
  if (node.Plans === undefined) return;
  if (!Array.isArray(node.Plans)) {
    throw new SupplierPurchasableSkuExplainError("plan Plans must be an array");
  }
  for (const child of node.Plans) collectPlanEvidence(child, evidence);
}

export function resolveExplainConfig(
  env: Record<string, string | undefined>,
): SupplierPurchasableSkuExplainConfig {
  const databaseUrl = env[EXPLAIN_DATABASE_URL] ?? "";
  const parsed = parseSupplierPurchasableSkuDevelopmentDatabaseUrl(
    databaseUrl,
    EXPLAIN_DATABASE_URL,
  );
  return {
    databaseConnection: parsed.connection,
    databaseHost: parsed.connection.hostname,
    redactedDatabaseUrl: redactSupplierPurchasableSkuDevelopmentDatabaseUrl(
      databaseUrl,
      EXPLAIN_DATABASE_URL,
    ),
  };
}

export function parseSupplierPurchasableSkuExplainPlan(
  rowsValue: unknown,
): SupplierPurchasableSkuExplainPlan {
  if (!Array.isArray(rowsValue) || rowsValue.length !== 1) {
    throw new SupplierPurchasableSkuExplainError(
      "EXPLAIN must return exactly one row",
    );
  }
  const row = object(rowsValue[0], "EXPLAIN row");
  const planJson = json(row["QUERY PLAN"]);
  if (!Array.isArray(planJson) || planJson.length !== 1) {
    throw new SupplierPurchasableSkuExplainError(
      "QUERY PLAN must contain exactly one plan",
    );
  }
  const root = object(planJson[0], "EXPLAIN root");
  const evidence: SupplierPurchasableSkuExplainPlan = {
    indexNames: [],
    relationAccesses: {},
    sequentialScans: [],
    buffers: { sharedHit: 0, sharedRead: 0 },
    hasRuntimeEvidence:
      typeof root["Planning Time"] === "number" &&
      typeof root["Execution Time"] === "number",
  };
  collectPlanEvidence(root.Plan, evidence);
  evidence.indexNames = [...new Set(evidence.indexNames)];
  evidence.sequentialScans = [...new Set(evidence.sequentialScans)];
  for (const access of Object.values(evidence.relationAccesses)) {
    access.indexNames = [...new Set(access.indexNames)];
    access.nodeTypes = [...new Set(access.nodeTypes)];
  }
  return evidence;
}

export function assertSupplierPurchasableSkuExplainPlan(
  plan: SupplierPurchasableSkuExplainPlan,
  queryName: ExplainQueryName,
): true {
  if (!plan.hasRuntimeEvidence) {
    throw new SupplierPurchasableSkuExplainError(
      "EXPLAIN runtime evidence is required",
    );
  }
  const relation = plan.sequentialScans[0];
  if (relation) {
    throw new SupplierPurchasableSkuExplainError(
      `${relation} scoped Seq Scan`,
    );
  }
  for (const expectedRelation of EXPECTED_INDEXED_RELATIONS[queryName]) {
    if (!plan.relationAccesses[expectedRelation]?.indexNames.length) {
      throw new SupplierPurchasableSkuExplainError(
        `${queryName} requires indexed ${expectedRelation} access`,
      );
    }
  }
  return true;
}

export async function runSupplierPurchasableSkuExplain(
  gateway: SupplierPurchasableSkuExplainGateway,
): Promise<SupplierPurchasableSkuExplainSummary> {
  const plans = {} as ExplainPlanMap;
  try {
    for (const name of SUPPLIER_PURCHASABLE_SKU_EXPLAIN_QUERY_NAMES) {
      const plan = parseSupplierPurchasableSkuExplainPlan(
        await gateway.explain(name),
      );
      assertSupplierPurchasableSkuExplainPlan(plan, name);
      plans[name] = plan;
    }
  } finally {
    await gateway.close();
  }
  return {
    indexes: Object.fromEntries(
      SUPPLIER_PURCHASABLE_SKU_EXPLAIN_QUERY_NAMES.map((name) =>
        [name, plans[name].indexNames]
      ),
    ) as Record<ExplainQueryName, string[]>,
    buffers: Object.fromEntries(
      SUPPLIER_PURCHASABLE_SKU_EXPLAIN_QUERY_NAMES.map((name) =>
        [name, plans[name].buffers]
      ),
    ) as SupplierPurchasableSkuExplainSummary["buffers"],
    query_count: 4,
    n_plus_one: false,
  };
}

type ExplainCliOptions = {
  env: Record<string, string | undefined>;
  createGateway(config: SupplierPurchasableSkuExplainConfig):
    SupplierPurchasableSkuExplainGateway;
  writeOutput(message: string): void;
  writeError(message: string): void;
};

export async function runSupplierPurchasableSkuExplainCli(
  options: ExplainCliOptions,
): Promise<0 | 1> {
  try {
    const config = resolveExplainConfig(options.env);
    const summary = await runSupplierPurchasableSkuExplain(
      options.createGateway(config),
    );
    options.writeOutput(JSON.stringify({
      database_host: config.databaseHost,
      ...summary,
      transaction_rolled_back: true,
    }));
    return 0;
  } catch {
    options.writeError("SUPPLIER_PURCHASABLE_SKU_EXPLAIN_FAILED");
    return 1;
  }
}

if (import.meta.main) {
  void import("./supplier-purchasable-sku-explain-database").then(
    ({ DirectSupplierPurchasableSkuExplainGateway }) =>
      runSupplierPurchasableSkuExplainCli({
        env: process.env,
        createGateway: (config) =>
          new DirectSupplierPurchasableSkuExplainGateway(
            config.databaseConnection,
          ),
        writeOutput: console.log,
        writeError: console.error,
      }),
  ).then((exitCode) => {
    process.exitCode = exitCode;
  }).catch(() => {
    console.error("SUPPLIER_PURCHASABLE_SKU_EXPLAIN_FAILED");
    process.exitCode = 1;
  });
}
