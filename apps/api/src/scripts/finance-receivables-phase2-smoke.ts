type EnvLike = Record<string, string | undefined>;

export type FinanceReceivablesPhase2SmokeConfig = {
  baseUrl: string;
  employeeToken: string;
  projectId: string | null;
  taskId: string | null;
  allowWrite: boolean;
  completeOutput: Record<string, unknown> | null;
};

type ParseSmokeConfigResult =
  | { ok: true; config: FinanceReceivablesPhase2SmokeConfig }
  | { ok: false; errors: string[] };

export type ReceivableWorkflowTaskCandidate = {
  taskId: string;
  projectId: string | null;
  actionKey: string;
  nodeKey: string;
  receivablePlanId: string | null;
  receivableAmount: number | null;
  receivableRemainingAmount: number | null;
  receivableStatus: string | null;
};

type SmokeCheckResult = {
  name: string;
  ok: true;
};

type RunSmokeInput = {
  config: FinanceReceivablesPhase2SmokeConfig;
  fetchImpl?: FetchLike;
};

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

const MAX_PAGE_SIZE = 100;

export function parseFinanceReceivablesPhase2SmokeConfig(
  env: EnvLike = process.env,
): ParseSmokeConfigResult {
  const errors: string[] = [];
  const baseUrl = trimOptional(env.GOOES_API_BASE_URL)?.replace(/\/+$/, "");
  const employeeToken = trimOptional(
    env.FINANCE_RECEIVABLES_SMOKE_EMPLOYEE_TOKEN,
  );
  const taskId = trimOptional(env.FINANCE_RECEIVABLES_SMOKE_TASK_ID) ?? null;
  const allowWrite = parseBoolean(
    env.FINANCE_RECEIVABLES_SMOKE_ALLOW_WRITE,
  );

  if (!baseUrl) errors.push("GOOES_API_BASE_URL is required");
  if (!employeeToken) {
    errors.push("FINANCE_RECEIVABLES_SMOKE_EMPLOYEE_TOKEN is required");
  }
  if (allowWrite && !taskId) {
    errors.push(
      "FINANCE_RECEIVABLES_SMOKE_TASK_ID is required when write smoke is enabled",
    );
  }
  const completeOutput = parseCompleteOutput(
    env.FINANCE_RECEIVABLES_SMOKE_COMPLETE_OUTPUT_JSON,
    errors,
  );
  if (errors.length > 0 || !baseUrl || !employeeToken) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    config: {
      baseUrl,
      employeeToken,
      projectId: trimOptional(env.FINANCE_RECEIVABLES_SMOKE_PROJECT_ID) ?? null,
      taskId,
      allowWrite,
      completeOutput,
    },
  };
}

export function assertReceivableWorkflowTaskCandidate(payload: unknown): void {
  assertPaginatedPayload("workflow tasks", payload);
  const list = getList(payload);
  list.forEach((item, index) => {
    const task = getRecord(item, `workflow task[${index}]`);
    const actions = Array.isArray(task.actions) ? task.actions : [];
    actions.forEach((action, actionIndex) => {
      const actionRecord = getRecord(
        action,
        `workflow task[${index}] action[${actionIndex}]`,
      );
      if (!Array.isArray(actionRecord.output_fields)) {
        throw new Error(
          `workflow task[${index}] action[${actionIndex}] missing output_fields`,
        );
      }
    });
  });
}

export function findReceivableWorkflowTaskCandidate(
  payload: unknown,
  requestedTaskId?: string | null,
): ReceivableWorkflowTaskCandidate | null {
  assertReceivableWorkflowTaskCandidate(payload);
  for (const item of getList(payload)) {
    const task = getRecord(item, "workflow task");
    const taskId = readString(task.id);
    if (!taskId || (requestedTaskId && taskId !== requestedTaskId)) {
      continue;
    }

    const actions = Array.isArray(task.actions) ? task.actions : [];
    for (const action of actions) {
      const actionRecord = getRecord(action, "workflow action");
      const businessDomain = readString(actionRecord.business_domain);
      const fields = Array.isArray(actionRecord.output_fields)
        ? actionRecord.output_fields
        : [];
      const receivableContext = fields.find((field) => {
        const record = getOptionalRecord(field);
        return record?.name === "receivable_context" &&
          record.type === "receivable_summary";
      });

      if (businessDomain !== "payment_collection" || !receivableContext) {
        continue;
      }

      const receivable = getRecord(receivableContext, "receivable context");
      return {
        taskId,
        projectId: readProjectId(task),
        actionKey: readString(actionRecord.key) ?? "complete",
        nodeKey: readString(actionRecord.node_key) ??
          readString(task.node_key) ??
          "",
        receivablePlanId: readString(receivable.receivable_plan_id),
        receivableAmount: readNumber(receivable.receivable_amount),
        receivableRemainingAmount: readNumber(
          receivable.receivable_remaining_amount,
        ),
        receivableStatus: readString(receivable.receivable_status),
      };
    }
  }

  return null;
}

export async function runFinanceReceivablesPhase2Smoke(input: RunSmokeInput) {
  const { config } = input;
  const fetchImpl = input.fetchImpl ?? fetch;
  if (config.taskId && !config.allowWrite) {
    throw new Error(
      "Write smoke requires FINANCE_RECEIVABLES_SMOKE_ALLOW_WRITE=true",
    );
  }

  const checks: SmokeCheckResult[] = [];
  const financePayload = await fetchJson({
    fetchImpl,
    url: `${config.baseUrl}/finance/receivables?page=1&pageSize=20`,
    token: config.employeeToken,
  });
  assertPaginatedPayload("finance receivables", financePayload);
  checks.push({ name: "finance receivables", ok: true });

  if (config.projectId) {
    const projectPayload = await fetchJson({
      fetchImpl,
      url: `${config.baseUrl}/projects/${encodeURIComponent(config.projectId)}/receivables?page=1&pageSize=20`,
      token: config.employeeToken,
    });
    assertPaginatedPayload("project receivables", projectPayload);
    checks.push({ name: "project receivables", ok: true });
  }

  const workflowPayload = await fetchJson({
    fetchImpl,
    url: `${config.baseUrl}/workflow-tasks?page=1&pageSize=20&status=pending&subject_type=project`,
    token: config.employeeToken,
  });
  const candidate = findReceivableWorkflowTaskCandidate(
    workflowPayload,
    config.taskId,
  );
  checks.push({ name: "workflow tasks", ok: true });

  if (!config.allowWrite) {
    return {
      ok: true,
      mode: "read_only" as const,
      candidate,
      checks,
      status: candidate ? "candidate_found" as const : "sample_missing" as const,
    };
  }

  if (!candidate) {
    throw new Error("No receivable payment workflow task candidate found");
  }
  if (!config.completeOutput) {
    throw new Error(
      "FINANCE_RECEIVABLES_SMOKE_COMPLETE_OUTPUT_JSON is required when write smoke is enabled",
    );
  }

  const completePayload = await fetchJson({
    fetchImpl,
    method: "POST",
    url: `${config.baseUrl}/workflow-tasks/${encodeURIComponent(candidate.taskId)}/complete`,
    token: config.employeeToken,
    body: {
      action: candidate.actionKey,
      reason: null,
      output: config.completeOutput,
    },
  });
  checks.push({ name: "workflow task complete", ok: true });

  return {
    ok: true,
    mode: "write" as const,
    candidate,
    checks,
    status: "completed" as const,
    complete: completePayload,
  };
}

function assertPaginatedPayload(checkName: string, payload: unknown): void {
  const data = unwrapApiData(payload);
  const record = getRecord(data, checkName);
  const list = record.list ?? record.items;
  if (!Array.isArray(list)) {
    throw new Error(`${checkName} data.list must be an array`);
  }

  const pagination = getRecord(record.pagination, `${checkName} pagination`);
  const pageSize = pagination.pageSize;
  if (typeof pageSize !== "number" || pageSize < 1 || pageSize > MAX_PAGE_SIZE) {
    throw new Error(
      `${checkName} pagination.pageSize must be between 1 and ${MAX_PAGE_SIZE}`,
    );
  }
}

function getList(payload: unknown): unknown[] {
  const data = getRecord(unwrapApiData(payload), "response data");
  const list = data.list ?? data.items;
  return Array.isArray(list) ? list : [];
}

async function fetchJson(input: {
  fetchImpl: FetchLike;
  url: string;
  token: string;
  method?: "GET" | "POST";
  body?: Record<string, unknown>;
}): Promise<unknown> {
  const response = await input.fetchImpl(input.url, {
    method: input.method ?? "GET",
    headers: {
      authorization: `Bearer ${input.token}`,
      ...(input.body ? { "content-type": "application/json" } : {}),
    },
    ...(input.body ? { body: JSON.stringify(input.body) } : {}),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      `${input.method ?? "GET"} ${input.url} failed with HTTP ${response.status}: ${JSON.stringify(payload)}`,
    );
  }
  return payload;
}

function unwrapApiData(payload: unknown): unknown {
  const record = getRecord(payload, "response");
  if (!("data" in record)) {
    throw new Error("response missing data");
  }
  return record.data;
}

function parseCompleteOutput(
  value: string | undefined,
  errors: string[],
): Record<string, unknown> | null {
  const rawValue = trimOptional(value);
  if (!rawValue) return null;

  try {
    const parsed = JSON.parse(rawValue) as unknown;
    const record = getOptionalRecord(parsed);
    if (!record) {
      errors.push(
        "FINANCE_RECEIVABLES_SMOKE_COMPLETE_OUTPUT_JSON must be a JSON object",
      );
      return null;
    }
    return record;
  } catch {
    errors.push(
      "FINANCE_RECEIVABLES_SMOKE_COMPLETE_OUTPUT_JSON must be valid JSON",
    );
    return null;
  }
}

function parseBoolean(value: string | undefined): boolean {
  return trimOptional(value)?.toLowerCase() === "true";
}

function readProjectId(task: Record<string, unknown>): string | null {
  return readString(task.business_id) ??
    readString(getOptionalRecord(task.instance)?.subject_id);
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function getRecord(value: unknown, label = "value"): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function getOptionalRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function trimOptional(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

async function main() {
  const parsed = parseFinanceReceivablesPhase2SmokeConfig();
  if (!parsed.ok) {
    console.error(parsed.errors.join("\n"));
    console.error([
      "",
      "Required:",
      "  GOOES_API_BASE_URL",
      "  FINANCE_RECEIVABLES_SMOKE_EMPLOYEE_TOKEN",
      "",
      "Optional read-only:",
      "  FINANCE_RECEIVABLES_SMOKE_PROJECT_ID",
      "",
      "Write smoke, only for a controlled test task:",
      "  FINANCE_RECEIVABLES_SMOKE_TASK_ID",
      "  FINANCE_RECEIVABLES_SMOKE_ALLOW_WRITE=true",
      "  FINANCE_RECEIVABLES_SMOKE_COMPLETE_OUTPUT_JSON",
    ].join("\n"));
    process.exit(1);
  }

  const result = await runFinanceReceivablesPhase2Smoke({
    config: parsed.config,
  });
  console.log(JSON.stringify(result, null, 2));
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
