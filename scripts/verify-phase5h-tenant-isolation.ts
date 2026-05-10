type CheckStatus = "pass" | "fail" | "skip";

type CheckResult = {
  name: string;
  status: CheckStatus;
  detail?: string;
};

type RequestOptions = {
  token: string;
  method?: "GET" | "POST";
  body?: unknown;
};

type ListCheck = {
  name: string;
  path: string;
  fixtures?: string | string[];
  requiresPermission?: boolean;
  validate?: (payload: unknown) => string | null;
};

type DetailCheck = {
  name: string;
  path: string;
  fixtures: string | string[];
  method?: "GET" | "POST";
  body?: unknown;
};

const env = process.env;
const baseUrl = (env.API_BASE_URL || "http://127.0.0.1:3000").replace(/\/+$/, "");
const tenantToken = env.TENANT_VERIFY_TOKEN || env.TENANT_A_TOKEN || "";
const forbiddenIds = (env.TENANT_FORBIDDEN_IDS || env.TENANT_B_FORBIDDEN_IDS || "")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);
const strict = env.STRICT_TENANT_VERIFY === "1";
const results: CheckResult[] = [];

const listChecks: ListCheck[] = [
  { name: "customers list is tenant-scoped", path: "/customers?page=1&pageSize=50" },
  { name: "projects status list is tenant-scoped", path: "/projects/status?ownership=all&page=1&pageSize=50" },
  { name: "employees list is tenant-scoped", path: "/employees?page=1&pageSize=50" },
  { name: "departments list is tenant-scoped", path: "/departments?page=1&pageSize=100" },
  { name: "posts list is tenant-scoped", path: "/posts?page=1&pageSize=100" },
  { name: "roles list is tenant-scoped", path: "/roles?page=1&pageSize=100" },
  { name: "expense list is tenant-scoped", path: "/expense-requests?page=1&pageSize=50" },
  { name: "project acceptance list is tenant-scoped", path: "/project-acceptances?page=1&pageSize=50" },
  {
    name: "project logs project list is tenant-scoped",
    path: "/project_logs/projects?project_id=:TENANT_OWN_PROJECT_ID&page=1&pageSize=50",
    fixtures: ["TENANT_OWN_PROJECT_ID"],
  },
  { name: "camera project groups are tenant-scoped", path: "/project-cameras/projects?page=1&pageSize=20" },
  { name: "marketing page list is tenant-scoped", path: "/marketing-pages?page=1&pageSize=50", requiresPermission: true },
  { name: "marketing lead list is tenant-scoped", path: "/marketing-leads?page=1&pageSize=50", requiresPermission: true },
  { name: "tenant share links list is tenant-scoped", path: "/tenant-share-links?page=1&pageSize=50", requiresPermission: true },
  { name: "notifications list is tenant-scoped", path: "/notifications?page=1&pageSize=50" },
  { name: "task center list is tenant-scoped", path: "/task-center/todos?page=1&pageSize=100" },
  { name: "social video admin scripts are tenant-scoped", path: "/admin/social-video/scripts?page=1&pageSize=50" },
  {
    name: "social video usage summary is tenant-scoped",
    path: "/admin/social-video/usage-summary",
    validate: (payload) => hasPath(payload, ["data", "ai_calls"]) ? null : "missing data.ai_calls",
  },
];

const detailChecks: DetailCheck[] = [
  {
    name: "tenant cannot read another tenant customer detail",
    path: "/customers/:TENANT_OTHER_CUSTOMER_ID/detail",
    fixtures: ["TENANT_OTHER_CUSTOMER_ID"],
  },
  {
    name: "tenant cannot read another tenant project detail",
    path: "/projects/:TENANT_OTHER_PROJECT_ID",
    fixtures: ["TENANT_OTHER_PROJECT_ID"],
  },
  {
    name: "tenant cannot read another tenant expense detail",
    path: "/expense-requests/:TENANT_OTHER_EXPENSE_REQUEST_ID",
    fixtures: ["TENANT_OTHER_EXPENSE_REQUEST_ID"],
  },
  {
    name: "tenant cannot read another tenant acceptance detail",
    path: "/project-acceptances/:TENANT_OTHER_PROJECT_ACCEPTANCE_ID",
    fixtures: ["TENANT_OTHER_PROJECT_ACCEPTANCE_ID"],
  },
  {
    name: "tenant cannot read another tenant marketing page",
    path: "/marketing-pages/:TENANT_OTHER_MARKETING_PAGE_ID",
    fixtures: ["TENANT_OTHER_MARKETING_PAGE_ID"],
  },
  {
    name: "tenant cannot read another tenant social video transcription",
    path: "/social-video/transcriptions/:TENANT_OTHER_SOCIAL_VIDEO_TRANSCRIPTION_ID",
    fixtures: ["TENANT_OTHER_SOCIAL_VIDEO_TRANSCRIPTION_ID"],
  },
  {
    name: "tenant cannot use another tenant camera play params",
    path: "/projects/:TENANT_OTHER_PROJECT_ID/cameras/:TENANT_OTHER_CAMERA_ID/play-params",
    fixtures: ["TENANT_OTHER_PROJECT_ID", "TENANT_OTHER_CAMERA_ID"],
    method: "POST",
    body: { protocol: "hls" },
  },
];

const platformForbiddenChecks: DetailCheck[] = [
  { name: "tenant cannot access platform tenant list", path: "/platform/tenants?page=1&pageSize=20", fixtures: [] },
  { name: "tenant cannot access platform lead list", path: "/platform/leads?page=1&pageSize=20", fixtures: [] },
  { name: "tenant cannot access platform audit list", path: "/platform/audit-logs?page=1&pageSize=20", fixtures: [] },
];

function usage() {
  console.log(`
Phase 5H tenant isolation verification

Required:
  API_BASE_URL=http://127.0.0.1:3000
  TENANT_VERIFY_TOKEN=<admin or employee token for the tenant being verified>

Recommended:
  TENANT_FORBIDDEN_IDS=<comma separated IDs that must not appear in list responses>
  TENANT_OWN_PROJECT_ID=<project id from the tenant being verified>
  TENANT_OTHER_CUSTOMER_ID=<customer id from another tenant or default tenant>
  TENANT_OTHER_PROJECT_ID=<project id from another tenant or default tenant>
  TENANT_OTHER_EXPENSE_REQUEST_ID=<expense request id from another tenant>
  TENANT_OTHER_PROJECT_ACCEPTANCE_ID=<acceptance id from another tenant>
  TENANT_OTHER_CAMERA_ID=<camera id from another tenant>
  TENANT_OTHER_MARKETING_PAGE_ID=<marketing page id from another tenant>
  TENANT_OTHER_SOCIAL_VIDEO_TRANSCRIPTION_ID=<transcription id from another tenant>

Compatible aliases:
  TENANT_A_TOKEN, TENANT_B_FORBIDDEN_IDS, TENANT_B_* from phase 3 scripts.

Strict mode:
  STRICT_TENANT_VERIFY=1 makes skipped checks fail the process.
`);
}

function record(result: CheckResult) {
  results.push(result);
  const label = result.status === "pass" ? "PASS" : result.status === "skip" ? "SKIP" : "FAIL";
  console.log(`[${label}] ${result.name}${result.detail ? ` - ${result.detail}` : ""}`);
}

async function requestJson(path: string, options: RequestOptions) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method || "GET",
    headers: {
      authorization: `Bearer ${options.token}`,
      "content-type": "application/json",
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  let payload: unknown = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }

  return { response, payload, text };
}

function resolvePath(path: string) {
  return path.replace(/:([A-Z0-9_]+)/g, (_, fixtureName: string) =>
    encodeURIComponent(env[fixtureName] || env[`TENANT_B_${fixtureName.replace(/^TENANT_OTHER_/, "")}`] || "")
  );
}

function missingFixtures(fixtures: string | string[]) {
  const names = Array.isArray(fixtures) ? fixtures : [fixtures];
  return names.filter((name) => {
    if (!name) return false;
    if (env[name]) return false;
    const phase3Alias = `TENANT_B_${name.replace(/^TENANT_OTHER_/, "")}`;
    return !env[phase3Alias];
  });
}

function responseContainsForbiddenId(text: string) {
  return forbiddenIds.find((id) => id && text.includes(id)) || null;
}

async function expectScopedList(check: ListCheck) {
  if (!tenantToken) {
    record({ name: check.name, status: "skip", detail: "TENANT_VERIFY_TOKEN is not configured" });
    return;
  }

  if (check.fixtures) {
    const missing = missingFixtures(check.fixtures);
    if (missing.length > 0) {
      record({ name: check.name, status: "skip", detail: `${missing.join(", ")} is not configured` });
      return;
    }
  }

  try {
    const { response, payload, text } = await requestJson(resolvePath(check.path), { token: tenantToken });
    if (response.status === 403 && check.requiresPermission) {
      record({ name: check.name, status: "skip", detail: "token does not have required permission" });
      return;
    }
    if (!response.ok) {
      record({ name: check.name, status: "fail", detail: `HTTP ${response.status}: ${text.slice(0, 220)}` });
      return;
    }

    const forbiddenId = responseContainsForbiddenId(text);
    if (forbiddenId) {
      record({ name: check.name, status: "fail", detail: `response contains forbidden id ${forbiddenId}` });
      return;
    }

    const validationError = check.validate?.(payload);
    if (validationError) {
      record({ name: check.name, status: "fail", detail: validationError });
      return;
    }

    record({ name: check.name, status: "pass" });
  } catch (error) {
    record({ name: check.name, status: "fail", detail: error instanceof Error ? error.message : String(error) });
  }
}

async function expectForbidden(check: DetailCheck) {
  if (!tenantToken) {
    record({ name: check.name, status: "skip", detail: "TENANT_VERIFY_TOKEN is not configured" });
    return;
  }

  const missing = missingFixtures(check.fixtures);
  if (missing.length > 0) {
    record({ name: check.name, status: "skip", detail: `${missing.join(", ")} is not configured` });
    return;
  }

  try {
    const { response, text } = await requestJson(resolvePath(check.path), {
      token: tenantToken,
      method: check.method,
      body: check.body,
    });
    if ([400, 403, 404].includes(response.status)) {
      record({ name: check.name, status: "pass", detail: `HTTP ${response.status}` });
      return;
    }

    record({
      name: check.name,
      status: "fail",
      detail: `expected 400/403/404, got HTTP ${response.status}: ${text.slice(0, 220)}`,
    });
  } catch (error) {
    record({ name: check.name, status: "fail", detail: error instanceof Error ? error.message : String(error) });
  }
}

function hasPath(payload: unknown, keys: string[]) {
  let cursor = payload as Record<string, unknown> | null;
  for (const key of keys) {
    if (!cursor || typeof cursor !== "object" || !(key in cursor)) return false;
    cursor = cursor[key] as Record<string, unknown> | null;
  }
  return true;
}

async function main() {
  if (!tenantToken) {
    usage();
  }

  for (const check of listChecks) {
    await expectScopedList(check);
  }

  for (const check of detailChecks) {
    await expectForbidden(check);
  }

  for (const check of platformForbiddenChecks) {
    await expectForbidden(check);
  }

  const failed = results.filter((item) => item.status === "fail");
  const skipped = results.filter((item) => item.status === "skip");
  const passed = results.length - failed.length - skipped.length;
  console.log(`\nSummary: ${passed} passed, ${failed.length} failed, ${skipped.length} skipped.`);

  if (failed.length > 0 || (strict && skipped.length > 0)) {
    process.exitCode = 1;
  }
}

await main();
