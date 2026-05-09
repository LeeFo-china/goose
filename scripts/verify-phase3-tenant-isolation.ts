type CheckResult = {
  name: string;
  status: "pass" | "fail" | "skip";
  detail?: string;
};

type RequestOptions = {
  token: string;
  method?: "GET" | "POST";
  body?: unknown;
};

const env = process.env;
const baseUrl = (env.API_BASE_URL || "http://127.0.0.1:3000").replace(/\/+$/, "");
const tenantAToken = env.TENANT_A_TOKEN || "";
const forbiddenIds = (env.TENANT_B_FORBIDDEN_IDS || "")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);

const results: CheckResult[] = [];

function record(result: CheckResult) {
  results.push(result);
  const icon = result.status === "pass" ? "PASS" : result.status === "skip" ? "SKIP" : "FAIL";
  console.log(`[${icon}] ${result.name}${result.detail ? ` - ${result.detail}` : ""}`);
}

function usage() {
  console.log(`
Phase 3 tenant isolation verification

Required:
  API_BASE_URL=http://127.0.0.1:3000
  TENANT_A_TOKEN=<admin or employee token for tenant A>

Recommended fixtures:
  TENANT_B_FORBIDDEN_IDS=<comma separated B tenant resource ids>
  TENANT_B_EXPENSE_REQUEST_ID=<B tenant expense request id>
  TENANT_B_PROJECT_ACCEPTANCE_ID=<B tenant acceptance id>
  TENANT_B_PROJECT_ID=<B tenant project id>
  TENANT_B_CAMERA_ID=<B tenant camera id>
  TENANT_B_SOCIAL_VIDEO_TRANSCRIPTION_ID=<B tenant transcription id>

The script checks that tenant A cannot see B tenant data in stage 3 modules.
`);
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

async function expectSuccess(name: string, path: string, validate?: (payload: unknown) => string | null) {
  if (!tenantAToken) {
    record({ name, status: "skip", detail: "TENANT_A_TOKEN is not configured" });
    return;
  }

  try {
    const { response, payload, text } = await requestJson(path, { token: tenantAToken });
    if (!response.ok) {
      record({ name, status: "fail", detail: `HTTP ${response.status}: ${text.slice(0, 200)}` });
      return;
    }

    for (const id of forbiddenIds) {
      if (text.includes(id)) {
        record({ name, status: "fail", detail: `response contains forbidden tenant B id ${id}` });
        return;
      }
    }

    const validationError = validate?.(payload);
    if (validationError) {
      record({ name, status: "fail", detail: validationError });
      return;
    }

    record({ name, status: "pass" });
  } catch (error) {
    record({ name, status: "fail", detail: error instanceof Error ? error.message : String(error) });
  }
}

async function expectForbiddenDetail(name: string, path: string, fixtureNames: string | string[]) {
  if (!tenantAToken) {
    record({ name, status: "skip", detail: "TENANT_A_TOKEN is not configured" });
    return;
  }

  const requiredFixtures = Array.isArray(fixtureNames) ? fixtureNames : [fixtureNames];
  const missingFixtures = requiredFixtures.filter((fixtureName) => !env[fixtureName]);
  if (missingFixtures.length > 0) {
    record({ name, status: "skip", detail: `${missingFixtures.join(", ")} is not configured` });
    return;
  }

  const actualPath = path.replace(/:([A-Z0-9_]+)/g, (_, fixtureName: string) =>
    encodeURIComponent(env[fixtureName] || "")
  );

  try {
    const { response, text } = await requestJson(actualPath, { token: tenantAToken });
    if ([400, 403, 404].includes(response.status)) {
      record({ name, status: "pass", detail: `HTTP ${response.status}` });
      return;
    }

    record({ name, status: "fail", detail: `expected 400/403/404, got HTTP ${response.status}: ${text.slice(0, 200)}` });
  } catch (error) {
    record({ name, status: "fail", detail: error instanceof Error ? error.message : String(error) });
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
  if (!tenantAToken) {
    usage();
  }

  await expectSuccess("expense list is tenant-scoped", "/expense-requests?page=1&pageSize=50");
  await expectSuccess("expense stats summary is tenant-scoped", "/expense-requests/stats/summary", (payload) =>
    hasPath(payload, ["data", "status_counts"]) ? null : "missing data.status_counts"
  );
  await expectForbiddenDetail(
    "tenant A cannot read tenant B expense detail",
    "/expense-requests/:TENANT_B_EXPENSE_REQUEST_ID",
    "TENANT_B_EXPENSE_REQUEST_ID",
  );

  await expectSuccess("project acceptance list is tenant-scoped", "/project-acceptances?page=1&pageSize=50");
  await expectForbiddenDetail(
    "tenant A cannot read tenant B acceptance detail",
    "/project-acceptances/:TENANT_B_PROJECT_ACCEPTANCE_ID",
    "TENANT_B_PROJECT_ACCEPTANCE_ID",
  );

  await expectSuccess("camera project groups are tenant-scoped", "/project-cameras/projects?page=1&pageSize=50");
  await expectForbiddenDetail(
    "tenant A cannot use tenant B camera play params",
    "/projects/:TENANT_B_PROJECT_ID/cameras/:TENANT_B_CAMERA_ID/play-params",
    ["TENANT_B_PROJECT_ID", "TENANT_B_CAMERA_ID"],
  );

  await expectSuccess("task center list is tenant-scoped", "/task-center/todos?page=1&pageSize=100");
  await expectSuccess(
    "task center supports project acceptance filter",
    "/task-center/todos?type=project_acceptance&page=1&pageSize=20",
  );

  await expectSuccess("social video admin scripts are tenant-scoped", "/admin/social-video/scripts?page=1&pageSize=50");
  await expectSuccess("social video usage summary is tenant-scoped", "/admin/social-video/usage-summary", (payload) =>
    hasPath(payload, ["data", "ai_calls", "total_tokens"]) ? null : "missing data.ai_calls.total_tokens"
  );
  await expectForbiddenDetail(
    "tenant A cannot read tenant B social video transcription",
    "/social-video/transcriptions/:TENANT_B_SOCIAL_VIDEO_TRANSCRIPTION_ID",
    "TENANT_B_SOCIAL_VIDEO_TRANSCRIPTION_ID",
  );

  const failed = results.filter((item) => item.status === "fail");
  const skipped = results.filter((item) => item.status === "skip");
  console.log(`\nSummary: ${results.length - failed.length - skipped.length} passed, ${failed.length} failed, ${skipped.length} skipped.`);
  if (failed.length > 0 || (env.STRICT_TENANT_VERIFY === "1" && skipped.length > 0)) {
    process.exitCode = 1;
  }
}

await main();
