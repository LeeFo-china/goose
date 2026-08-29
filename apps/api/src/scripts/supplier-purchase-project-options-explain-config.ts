export const PROJECT_OPTION_EXPLAIN_CONFIRMATION = "development-read-only";

export const PROJECT_OPTION_EXPLAIN_ENV = {
  confirmation: "SUPPLIER_PURCHASE_PROJECT_OPTIONS_EXPLAIN_CONFIRM",
  databaseUrl: "SUPPLIER_PURCHASE_PROJECT_OPTIONS_EXPLAIN_DB_URL",
  tenantId: "SUPPLIER_PURCHASE_PROJECT_OPTIONS_EXPLAIN_TENANT_ID",
  updatedAtFrom:
    "SUPPLIER_PURCHASE_PROJECT_OPTIONS_EXPLAIN_UPDATED_AT_FROM",
  updatedAtTo: "SUPPLIER_PURCHASE_PROJECT_OPTIONS_EXPLAIN_UPDATED_AT_TO",
  updatedAtBefore:
    "SUPPLIER_PURCHASE_PROJECT_OPTIONS_EXPLAIN_UPDATED_AT_BEFORE",
  keyword: "SUPPLIER_PURCHASE_PROJECT_OPTIONS_EXPLAIN_KEYWORD",
  visibleProjectIds:
    "SUPPLIER_PURCHASE_PROJECT_OPTIONS_EXPLAIN_VISIBLE_PROJECT_IDS",
  pageSize: "SUPPLIER_PURCHASE_PROJECT_OPTIONS_EXPLAIN_PAGE_SIZE",
} as const;

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const MAX_KEYWORD_LENGTH = 100;
const MAX_VISIBLE_PROJECT_IDS = 100;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class ProjectOptionExplainError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ProjectOptionExplainError";
    this.code = code;
  }
}

type ProjectOptionExplainWindow =
  | {
    updatedAtFrom: string;
    updatedAtTo: string;
    updatedAtBefore?: never;
  }
  | {
    updatedAtFrom: string;
    updatedAtBefore: string;
    updatedAtTo?: never;
  };

export type ProjectOptionExplainConfig = {
  databaseUrl: string;
  tenantId: string;
  window: ProjectOptionExplainWindow;
  keyword: string;
  visibleProjectIds: string[] | null;
  pageSize: number;
};

export function parseProjectOptionExplainConfig(
  env: Record<string, string | undefined>,
): ProjectOptionExplainConfig {
  if (env[PROJECT_OPTION_EXPLAIN_ENV.confirmation] !==
    PROJECT_OPTION_EXPLAIN_CONFIRMATION) {
    fail("CONFIRMATION_REQUIRED", "development read-only confirmation is required");
  }
  const databaseUrl = parseDatabaseUrl(required(env, "databaseUrl"));
  const tenantId = parseUuid(required(env, "tenantId"), "tenant UUID");
  const updatedAtFrom = parseIso(required(env, "updatedAtFrom"), "lower boundary");
  const updatedAtToValue = env[PROJECT_OPTION_EXPLAIN_ENV.updatedAtTo];
  const updatedAtBeforeValue = env[PROJECT_OPTION_EXPLAIN_ENV.updatedAtBefore];
  if (Boolean(updatedAtToValue) === Boolean(updatedAtBeforeValue)) {
    fail("INVALID_WINDOW", "exactly one upper boundary is required");
  }
  const window = updatedAtToValue
    ? closedWindow(updatedAtFrom, parseIso(updatedAtToValue, "closed upper boundary"))
    : halfOpenWindow(
        updatedAtFrom,
        parseIso(updatedAtBeforeValue!, "half-open upper boundary"),
      );
  const keyword = required(env, "keyword").trim();
  if (keyword.length === 0 || keyword.length > MAX_KEYWORD_LENGTH) {
    fail("INVALID_KEYWORD", "keyword must contain 1 to 100 characters");
  }
  return {
    databaseUrl,
    tenantId,
    window,
    keyword,
    visibleProjectIds: parseVisibleProjectIds(
      env[PROJECT_OPTION_EXPLAIN_ENV.visibleProjectIds],
    ),
    pageSize: parsePageSize(env[PROJECT_OPTION_EXPLAIN_ENV.pageSize]),
  };
}

function required(
  env: Record<string, string | undefined>,
  key: keyof typeof PROJECT_OPTION_EXPLAIN_ENV,
): string {
  const value = env[PROJECT_OPTION_EXPLAIN_ENV[key]];
  if (!value) fail("MISSING_CONFIG", `${key} is required`);
  return value;
}

function parseDatabaseUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    fail("INVALID_DATABASE_URL", "database URL must be valid");
  }
  if (!(["postgres:", "postgresql:"] as string[]).includes(url.protocol) ||
    !url.hostname || url.pathname === "/") {
    fail("INVALID_DATABASE_URL", "database URL must be an explicit PostgreSQL URL");
  }
  return value;
}

function parseUuid(value: string, label: string): string {
  if (!UUID_PATTERN.test(value)) fail("INVALID_UUID", `${label} is invalid`);
  return value;
}

function parseIso(value: string, label: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== value) {
    fail("INVALID_BOUNDARY", `${label} must be a canonical UTC ISO timestamp`);
  }
  return value;
}

function closedWindow(
  updatedAtFrom: string,
  updatedAtTo: string,
): ProjectOptionExplainWindow {
  assertIncreasingWindow(updatedAtFrom, updatedAtTo);
  return { updatedAtFrom, updatedAtTo };
}

function halfOpenWindow(
  updatedAtFrom: string,
  updatedAtBefore: string,
): ProjectOptionExplainWindow {
  assertIncreasingWindow(updatedAtFrom, updatedAtBefore);
  return { updatedAtFrom, updatedAtBefore };
}

function assertIncreasingWindow(lower: string, upper: string): void {
  if (Date.parse(lower) >= Date.parse(upper)) {
    fail("INVALID_WINDOW", "lower boundary must precede upper boundary");
  }
}

function parseVisibleProjectIds(value: string | undefined): string[] | null {
  if (value === undefined) return null;
  const ids = value.split(",").map((item) => item.trim());
  if (ids.length === 0 || ids.length > MAX_VISIBLE_PROJECT_IDS ||
    ids.some((id) => !UUID_PATTERN.test(id)) ||
    new Set(ids).size !== ids.length) {
    fail("INVALID_VISIBLE_PROJECT_IDS", "visible project UUID list is invalid");
  }
  return ids;
}

function parsePageSize(value: string | undefined): number {
  if (value === undefined) return DEFAULT_PAGE_SIZE;
  if (!/^\d+$/.test(value)) fail("INVALID_PAGE_SIZE", "page size is invalid");
  const pageSize = Number(value);
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 ||
    pageSize > MAX_PAGE_SIZE) {
    fail("INVALID_PAGE_SIZE", "page size must be between 1 and 100");
  }
  return pageSize;
}

function fail(code: string, message: string): never {
  throw new ProjectOptionExplainError(code, message);
}
