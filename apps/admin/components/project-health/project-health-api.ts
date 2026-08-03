import type {
  ProjectOperationalRiskAiSummary,
  ProjectOperationalRiskDisplayPage,
} from "@gooes/domain";
import {
  ProjectOperationalRiskAiSummarySchema,
  ProjectOperationalRiskDisplayPageSchema,
} from "@gooes/domain";
import {
  buildProjectHealthBackendQuery,
  type ProjectHealthQueryState,
} from "./project-health-query";

type BackendPayload<T> = {
  success?: boolean;
  data?: T;
  message?: string;
  error?: string;
  code?: string;
  requestId?: string;
};

export type ProjectHealthFetcher = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

type ProjectHealthRequestOptions = {
  signal?: AbortSignal;
  fetcher?: ProjectHealthFetcher;
};

type ParseResult<T> =
  | { success: true; data: T }
  | { success: false };

type SafeParseSchema<T> = {
  safeParse(data: unknown): ParseResult<T>;
};

function getPayloadMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === "object") {
    const record = payload as { message?: unknown };
    if (typeof record.message === "string" && record.message.trim()) {
      return record.message;
    }
  }

  return fallback;
}

async function parseProjectHealthPayload<T>(
  response: Response,
  fallbackMessage: string,
  missingDataMessage: string,
): Promise<T> {
  const payload = (await response.json().catch(() => ({}))) as BackendPayload<T>;

  if (!response.ok || payload.success === false) {
    throw new Error(
      getPayloadMessage(payload, fallbackMessage || `请求失败(${response.status})`),
    );
  }

  if (payload.data === undefined || payload.data === null) {
    throw new Error(missingDataMessage);
  }

  return payload.data;
}

function parseDomainData<T>(
  data: unknown,
  schema: SafeParseSchema<T>,
  invalidDataMessage: string,
): T {
  const result = schema.safeParse(data);
  if (!result.success) throw new Error(invalidDataMessage);
  return result.data;
}

function defaultFetcher(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  return fetch(input, init);
}

function buildAiSummaryBody(query: ProjectHealthQueryState): string {
  const body: Record<string, string> = {};
  if (query.severity) body.severity = query.severity;
  if (query.riskType) body.risk_type = query.riskType;

  const keyword = query.keyword?.trim();
  if (keyword) body.keyword = keyword;

  return JSON.stringify(body);
}

export async function fetchProjectHealthRisks(
  query: ProjectHealthQueryState,
  options: ProjectHealthRequestOptions = {},
): Promise<ProjectOperationalRiskDisplayPage> {
  const fetcher = options.fetcher ?? defaultFetcher;
  const response = await fetcher(
    `/api/backend/project-health/risks?${buildProjectHealthBackendQuery(query)}`,
    { signal: options.signal },
  );

  const data = await parseProjectHealthPayload<ProjectOperationalRiskDisplayPage>(
    response,
    "风险列表加载失败",
    "风险列表响应缺少 data",
  );

  return parseDomainData(
    data,
    ProjectOperationalRiskDisplayPageSchema,
    "风险列表响应格式异常",
  );
}

export async function fetchProjectHealthAiSummary(
  query: ProjectHealthQueryState,
  options: ProjectHealthRequestOptions = {},
): Promise<ProjectOperationalRiskAiSummary> {
  const fetcher = options.fetcher ?? defaultFetcher;
  const response = await fetcher("/api/backend/project-health/ai-summary", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: buildAiSummaryBody(query),
    signal: options.signal,
  });

  const data = await parseProjectHealthPayload<ProjectOperationalRiskAiSummary>(
    response,
    "AI 摘要生成失败",
    "AI 摘要响应缺少 data",
  );

  return parseDomainData(
    data,
    ProjectOperationalRiskAiSummarySchema,
    "AI 摘要响应格式异常",
  );
}
