type Phase5SmokeConfig = {
  baseUrl: string;
  employeeToken: string;
  customerToken: string | null;
  customerProjectId: string | null;
  projectId: string | null;
};

type Phase5SmokeCheck = {
  name: string;
  url: string;
  token: string;
};

type ParsePhase5SmokeConfigResult =
  | { ok: true; config: Phase5SmokeConfig }
  | { ok: false; errors: string[] };

type EnvLike = Record<string, string | undefined>;

const MAX_PAGE_SIZE = 100;

export function parsePhase5SmokeConfig(
  env: EnvLike = process.env,
): ParsePhase5SmokeConfigResult {
  const errors: string[] = [];
  const baseUrl = trimOptional(env.GOOES_API_BASE_URL)?.replace(/\/+$/, "");
  const employeeToken = trimOptional(env.PHASE5_SMOKE_EMPLOYEE_TOKEN);

  if (!baseUrl) errors.push("GOOES_API_BASE_URL is required");
  if (!employeeToken) errors.push("PHASE5_SMOKE_EMPLOYEE_TOKEN is required");
  if (!baseUrl || !employeeToken) return { ok: false, errors };

  return {
    ok: true,
    config: {
      baseUrl,
      employeeToken,
      customerToken: trimOptional(env.PHASE5_SMOKE_CUSTOMER_TOKEN) ?? null,
      customerProjectId: trimOptional(env.PHASE5_SMOKE_CUSTOMER_PROJECT_ID) ?? null,
      projectId: trimOptional(env.PHASE5_SMOKE_PROJECT_ID) ?? null,
    },
  };
}

export function buildPhase5SmokeChecks(
  config: Phase5SmokeConfig,
): Phase5SmokeCheck[] {
  const checks: Phase5SmokeCheck[] = [
    {
      name: "workflow tasks",
      url: `${config.baseUrl}/workflow-tasks?page=1&pageSize=20`,
      token: config.employeeToken,
    },
    {
      name: "task center todos",
      url: `${config.baseUrl}/task-center/todos?page=1&pageSize=20`,
      token: config.employeeToken,
    },
  ];

  if (config.customerToken) {
    checks.push({
      name: "customer bootstrap",
      url: `${config.baseUrl}/customer/bootstrap?page=1&pageSize=20`,
      token: config.customerToken,
    });
  }

  if (config.customerToken && config.customerProjectId) {
    checks.push({
      name: "customer project detail bootstrap",
      url: `${config.baseUrl}/customer/projects/${encodeURIComponent(config.customerProjectId)}/detail-bootstrap`,
      token: config.customerToken,
    });
  }

  if (config.projectId) {
    checks.push({
      name: "project workflow state",
      url: `${config.baseUrl}/workflow-subjects/project/${encodeURIComponent(config.projectId)}/state`,
      token: config.employeeToken,
    });
  }

  return checks;
}

export function assertPhase5SmokePayload(
  checkName: string,
  payload: unknown,
): void {
  const data = unwrapApiData(payload);

  if (checkName === "workflow tasks") {
    assertPaginatedList(checkName, data);
    const list = getRecord(data).list as unknown[];
    list.forEach((item, itemIndex) => {
      const itemRecord = getRecord(item, `${checkName} item[${itemIndex}]`);
      const actions = Array.isArray(itemRecord.actions) ? itemRecord.actions : [];
      actions.forEach((action, actionIndex) => {
        assertWorkflowActionMetadata(
          `${checkName} action[${actionIndex}]`,
          action,
        );
      });
    });
    return;
  }

  if (checkName === "task center todos") {
    assertPaginatedList(checkName, data);
    return;
  }

  if (checkName === "customer bootstrap") {
    assertCustomerBootstrap(data);
    return;
  }

  if (checkName === "customer project detail bootstrap") {
    assertWorkflowStateCarrier(checkName, data);
    return;
  }

  if (checkName === "project workflow state") {
    assertWorkflowStateCarrier(checkName, data);
  }
}

export async function runPhase5WorkflowSmoke(
  config: Phase5SmokeConfig,
): Promise<Array<{ name: string; ok: true }>> {
  const results: Array<{ name: string; ok: true }> = [];
  for (const check of buildPhase5SmokeChecks(config)) {
    const response = await fetch(check.url, {
      headers: { authorization: `Bearer ${check.token}` },
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(`${check.name} failed with HTTP ${response.status}: ${JSON.stringify(payload)}`);
    }
    assertPhase5SmokePayload(check.name, payload);
    results.push({ name: check.name, ok: true });
  }
  return results;
}

function assertPaginatedList(checkName: string, data: unknown): void {
  const record = getRecord(data, checkName);
  if (!Array.isArray(record.list)) {
    throw new Error(`${checkName} data.list must be an array`);
  }

  const pagination = getRecord(record.pagination, `${checkName} pagination`);
  const pageSize = pagination.pageSize;
  if (typeof pageSize !== "number" || pageSize < 1 || pageSize > MAX_PAGE_SIZE) {
    throw new Error(`${checkName} pagination.pageSize must be between 1 and ${MAX_PAGE_SIZE}`);
  }
}

function assertCustomerBootstrap(data: unknown): void {
  const record = getRecord(data, "customer bootstrap");
  const projects = getRecord(record.projects, "customer bootstrap projects");
  assertPaginatedList("customer bootstrap projects", projects);
  const list = getRecord(projects).list as unknown[];
  list.forEach((item, index) => {
    assertWorkflowStateCarrier(`customer bootstrap project[${index}]`, item);
  });
}

function assertWorkflowStateCarrier(checkName: string, data: unknown): void {
  const record = getRecord(data, checkName);
  if (!("workflow_state" in record)) {
    throw new Error(`${checkName} missing workflow_state`);
  }
}

function assertWorkflowActionMetadata(
  label: string,
  action: unknown,
): void {
  const record = getRecord(action, label);
  for (const key of [
    "key",
    "label",
    "task_id",
    "node_key",
    "node_type",
    "requires_reason",
    "disabled",
  ] as const) {
    if (!(key in record)) {
      throw new Error(`${label} missing ${key}`);
    }
  }
  if (!("business_domain" in record)) {
    throw new Error(`${label} missing business_domain`);
  }
  if (!("business_action" in record)) {
    throw new Error(`${label} missing business_action`);
  }
  if (!Array.isArray(record.output_fields)) {
    throw new Error(`${label} missing output_fields`);
  }
}

function unwrapApiData(payload: unknown): unknown {
  const record = getRecord(payload, "response");
  if (!("data" in record)) {
    throw new Error("response missing data");
  }
  return record.data;
}

function getRecord(value: unknown, label = "value"): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function trimOptional(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

async function main() {
  const parsed = parsePhase5SmokeConfig();
  if (!parsed.ok) {
    console.error(parsed.errors.join("\n"));
    console.error([
      "",
      "Required:",
      "  GOOES_API_BASE_URL",
      "  PHASE5_SMOKE_EMPLOYEE_TOKEN",
      "",
      "Optional:",
      "  PHASE5_SMOKE_CUSTOMER_TOKEN",
      "  PHASE5_SMOKE_CUSTOMER_PROJECT_ID",
      "  PHASE5_SMOKE_PROJECT_ID",
    ].join("\n"));
    process.exit(1);
  }

  const results = await runPhase5WorkflowSmoke(parsed.config);
  console.log(JSON.stringify({ ok: true, results }, null, 2));
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
