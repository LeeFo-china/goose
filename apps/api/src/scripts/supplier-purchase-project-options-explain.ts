import {
  PROJECT_OPTION_EXPLAIN_ENV,
  ProjectOptionExplainError,
  parseProjectOptionExplainConfig,
  type ProjectOptionExplainConfig,
} from "./supplier-purchase-project-options-explain-config";
import {
  LARGE_TENANT_PROJECT_CARDINALITY,
  PROJECT_OPTION_EXPLAIN_THRESHOLDS,
  assertProjectOptionExplainThresholds,
  parseProjectOptionExplainPlan,
  type ProjectOptionExplainEvidence,
  type ProjectOptionExplainQueryName,
} from "./supplier-purchase-project-options-explain-evidence";

export const PROJECT_OPTION_EXPLAIN_QUERY_NAMES = [
  "tenant_time_page",
  "tenant_time_count",
  "tenant_time_keyword_page",
  "tenant_time_keyword_count",
  "bounded_visible_page",
] as const satisfies readonly ProjectOptionExplainQueryName[];

type ExplainQuery = {
  name: ProjectOptionExplainQueryName;
  text: string;
  values: unknown[];
  limit?: number;
};

type ProjectOptionExplainSql = {
  array(values: unknown[], typeName: "uuid"): unknown;
  unsafe(text: string, values?: unknown[]): Promise<unknown>;
};

type ProjectOptionExplainDatabase = {
  begin<Result>(
    callback: (sql: ProjectOptionExplainSql) => Promise<Result>,
  ): Promise<Result>;
  close(): Promise<void>;
};

type ProjectOptionExplainDependencies = {
  createDatabase(databaseUrl: string): ProjectOptionExplainDatabase;
};

export type ProjectOptionExplainSummary = {
  gate: "supplier_purchase_project_options";
  explainQueryCount: number;
  queryNames: ProjectOptionExplainQueryName[];
  cardinalityBucket: "small" | "large";
  visibleProjectCount: number;
  thresholds: typeof PROJECT_OPTION_EXPLAIN_THRESHOLDS;
  queries: ProjectOptionExplainEvidence[];
};

export function buildProjectOptionExplainQueries(
  config: ProjectOptionExplainConfig,
): ExplainQuery[] {
  if (!Number.isSafeInteger(config.pageSize) || config.pageSize < 1 ||
    config.pageSize > 100) {
    throw new ProjectOptionExplainError(
      "INVALID_PAGE_SIZE",
      "page size must be between 1 and 100",
    );
  }
  const upperPredicate = "updatedAtTo" in config.window
    ? "project.updated_at <= $3::timestamptz"
    : "project.updated_at < $3::timestamptz";
  const upperBoundary = "updatedAtTo" in config.window
    ? config.window.updatedAtTo
    : config.window.updatedAtBefore;
  const commonWhere = `project.tenant_id = $1::uuid
      and project.updated_at >= $2::timestamptz
      and ${upperPredicate}`;
  const values = [
    config.tenantId,
    config.window.updatedAtFrom,
    upperBoundary,
  ];
  const keywordValues = [...values, ilikePattern(config.keyword)];
  const explain = "explain (analyze, buffers, settings, format json)";
  const pageSelect = "select project.id, project.name, project.status";
  const countSelect = "select count(*)::bigint as total";
  const from = "from public.projects as project";
  const order = "order by project.updated_at desc, project.id desc";
  const keyword = "and project.name ilike $4 escape E'\\\\'";
  const queries: ExplainQuery[] = [
    {
      name: "tenant_time_page",
      text: `${explain}\n${pageSelect}\n${from}\nwhere ${commonWhere}\n${order}\nlimit ${config.pageSize}`,
      values,
      limit: config.pageSize,
    },
    {
      name: "tenant_time_count",
      text: `${explain}\n${countSelect}\n${from}\nwhere ${commonWhere}`,
      values,
    },
    {
      name: "tenant_time_keyword_page",
      text: `${explain}\n${pageSelect}\n${from}\nwhere ${commonWhere}\n  ${keyword}\n${order}\nlimit ${config.pageSize}`,
      values: keywordValues,
      limit: config.pageSize,
    },
    {
      name: "tenant_time_keyword_count",
      text: `${explain}\n${countSelect}\n${from}\nwhere ${commonWhere}\n  ${keyword}`,
      values: keywordValues,
    },
  ];
  if (config.visibleProjectIds) {
    queries.push({
      name: "bounded_visible_page",
      text: `${explain}\n${pageSelect}\n${from}\nwhere ${commonWhere}\n  ${keyword}\n  and project.id = any($5::uuid[])\n${order}\nlimit ${config.pageSize}`,
      values: [...keywordValues, config.visibleProjectIds],
      limit: config.pageSize,
    });
  }
  return queries;
}

export async function runProjectOptionExplainGate(
  config: ProjectOptionExplainConfig,
  dependencies: ProjectOptionExplainDependencies = DEFAULT_DEPENDENCIES,
): Promise<ProjectOptionExplainSummary> {
  const database = dependencies.createDatabase(config.databaseUrl);
  let primaryFailure: unknown;
  try {
    const result = await database.begin(async (sql) => {
      await sql.unsafe("set transaction read only");
      const tenantProjectCount = await readTenantProjectCount(sql, config);
      const plans: ProjectOptionExplainEvidence[] = [];
      for (const query of buildProjectOptionExplainQueries(config)) {
        const values = query.name === "bounded_visible_page"
          ? [
              ...query.values.slice(0, -1),
              sql.array(config.visibleProjectIds!, "uuid"),
            ]
          : query.values;
        plans.push({
          name: query.name,
          ...parseProjectOptionExplainPlan(
            await sql.unsafe(query.text, values),
          ),
        });
      }
      return { tenantProjectCount, plans };
    });
    assertProjectOptionExplainThresholds(
      result.plans,
      result.tenantProjectCount,
    );
    return summarize(config, result.tenantProjectCount, result.plans);
  } catch (error) {
    primaryFailure = normalizeError(error);
    throw primaryFailure;
  } finally {
    try {
      await database.close();
    } catch {
      if (primaryFailure === undefined) {
        throw new ProjectOptionExplainError(
          "DATABASE_CLOSE_FAILED",
          "database close failed",
        );
      }
    }
  }
}

async function readTenantProjectCount(
  sql: ProjectOptionExplainSql,
  config: ProjectOptionExplainConfig,
): Promise<number> {
  const rows = await sql.unsafe(`
    select count(*)::integer as count
    from public.projects as project
    where project.tenant_id = $1::uuid
  `, [config.tenantId]);
  if (!Array.isArray(rows) || rows.length !== 1 ||
    typeof rows[0] !== "object" || rows[0] === null ||
    !Number.isSafeInteger((rows[0] as { count?: unknown }).count) ||
    Number((rows[0] as { count: number }).count) < 0) {
    throw new ProjectOptionExplainError(
      "INVALID_CARDINALITY",
      "tenant project cardinality query returned invalid evidence",
    );
  }
  return (rows[0] as { count: number }).count;
}

function summarize(
  config: ProjectOptionExplainConfig,
  tenantProjectCount: number,
  plans: ProjectOptionExplainEvidence[],
): ProjectOptionExplainSummary {
  return {
    gate: "supplier_purchase_project_options",
    explainQueryCount: plans.length,
    queryNames: plans.map((plan) => plan.name),
    cardinalityBucket: tenantProjectCount >= LARGE_TENANT_PROJECT_CARDINALITY
      ? "large"
      : "small",
    visibleProjectCount: config.visibleProjectIds?.length ?? 0,
    thresholds: PROJECT_OPTION_EXPLAIN_THRESHOLDS,
    queries: plans,
  };
}

function ilikePattern(keyword: string): string {
  return `%${keyword
    .replaceAll("\\", "\\\\")
    .replaceAll("%", "\\%")
    .replaceAll("_", "\\_")}%`;
}

function normalizeError(error: unknown): ProjectOptionExplainError {
  return error instanceof ProjectOptionExplainError
    ? error
    : new ProjectOptionExplainError("DATABASE_FAILURE", "database query failed");
}

const DEFAULT_DEPENDENCIES: ProjectOptionExplainDependencies = {
  createDatabase(databaseUrl) {
    return new Bun.SQL(databaseUrl, {
      max: 1,
      prepare: false,
      connectionTimeout: 10,
    }) as unknown as ProjectOptionExplainDatabase;
  },
};

async function main(): Promise<void> {
  try {
    const config = parseProjectOptionExplainConfig(process.env);
    console.log(JSON.stringify(await runProjectOptionExplainGate(config)));
  } catch (error) {
    const code = error instanceof ProjectOptionExplainError
      ? error.code
      : "UNEXPECTED_FAILURE";
    console.error(`SUPPLIER_PURCHASE_PROJECT_OPTIONS_EXPLAIN_FAILED:${code}`);
    process.exitCode = 1;
  }
}

if (import.meta.main) void main();

export { PROJECT_OPTION_EXPLAIN_ENV };
