type SmokeCase = {
  name: string;
  path: string;
};

type SmokeResult = {
  name: string;
  round: number;
  status: number;
  ms: number;
  message?: string;
  listLength?: number;
  partialErrors?: string[];
  authMs?: number;
  stepMs?: number;
  slowestStep?: string;
  debugTiming?: unknown;
  serverTiming?: string | null;
};

type SmokeSummary = {
  name: string;
  count: number;
  ok: number;
  minMs: number;
  avgMs: number;
  p95Ms: number;
  maxMs: number;
  partialErrorRounds: number;
};

function requireEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function getListLength(body: unknown) {
  const data = (body as { data?: unknown })?.data as { list?: unknown } | undefined;
  return Array.isArray(data?.list) ? data.list.length : undefined;
}

function getTimingStats(body: unknown) {
  const timing = ((body as { data?: { debug_timing?: unknown } })?.data)
    ?.debug_timing as {
      auth_steps?: Record<string, number>;
      steps?: Record<string, number>;
      acceptance_steps?: Record<string, number>;
    } | undefined;
  if (!timing) return {};
  const steps = { ...(timing.steps || {}), ...(timing.acceptance_steps || {}) };
  const authMs = Object.values(timing.auth_steps || {}).reduce((sum, item) => sum + item, 0);
  const stepMs = Object.values(steps).reduce((sum, item) => sum + item, 0);
  const [slowestStep, slowestMs] = Object.entries(steps)
    .sort((left, right) => right[1] - left[1])[0] || [];
  return {
    authMs,
    stepMs,
    slowestStep: slowestStep ? `${slowestStep}:${slowestMs}` : undefined,
    debugTiming: timing,
  };
}

async function runCase(input: {
  baseUrl: string;
  debugTiming: boolean;
  token: string;
  round: number;
  testCase: SmokeCase;
}): Promise<SmokeResult> {
  const startedAt = performance.now();
  const url = new URL(input.testCase.path, input.baseUrl);
  if (input.debugTiming) url.searchParams.set("debug_timing", "true");
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${input.token}` },
  });
  const ms = Math.round((performance.now() - startedAt) * 100) / 100;
  const text = await response.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }

  const payload = body as {
    message?: string;
    data?: { partial_errors?: Array<{ module?: string }> };
  } | null;
  return {
    name: input.testCase.name,
    round: input.round,
    status: response.status,
    ms,
    message: payload?.message,
    listLength: getListLength(body),
    partialErrors: payload?.data?.partial_errors
      ?.map((item) => item.module || "unknown"),
    ...getTimingStats(body),
    serverTiming: response.headers.get("server-timing"),
  };
}

function roundMs(value: number) {
  return Math.round(value * 100) / 100;
}

function percentile(values: number[], ratio: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.ceil(sorted.length * ratio) - 1,
  );
  return sorted[Math.max(index, 0)] ?? 0;
}

function summarizeResults(results: SmokeResult[]): SmokeSummary[] {
  const groups = new Map<string, SmokeResult[]>();
  for (const result of results) {
    groups.set(result.name, [...(groups.get(result.name) || []), result]);
  }

  return [...groups.entries()].map(([name, items]) => {
    const values = items.map((item) => item.ms);
    return {
      name,
      count: items.length,
      ok: items.filter((item) => item.status >= 200 && item.status < 300).length,
      minMs: roundMs(Math.min(...values)),
      avgMs: roundMs(values.reduce((sum, item) => sum + item, 0) / values.length),
      p95Ms: roundMs(percentile(values, 0.95)),
      maxMs: roundMs(Math.max(...values)),
      partialErrorRounds: items.filter((item) => (item.partialErrors?.length || 0) > 0).length,
    };
  });
}

async function main() {
  const token = requireEnv("CUSTOMER_PERF_TOKEN");
  const projectId = requireEnv("CUSTOMER_PERF_PROJECT_ID");
  const baseUrl = process.env.CUSTOMER_PERF_BASE_URL?.trim() || "http://127.0.0.1:3000";
  const debugTiming = process.env.CUSTOMER_PERF_DEBUG_TIMING !== "false";
  const rounds = Number.parseInt(process.env.CUSTOMER_PERF_ROUNDS || "2", 10);
  const cases: SmokeCase[] = [
    { name: "bootstrap_inline", path: "/customer/bootstrap?projects_mode=inline" },
    { name: "detail_bootstrap", path: `/customer/projects/${projectId}/detail-bootstrap` },
    { name: "logs", path: `/customer/projects/${projectId}/logs?page=1&pageSize=10` },
    { name: "acceptances", path: `/customer/project-acceptances?project_id=${projectId}&page=1&pageSize=20` },
  ];

  const results: SmokeResult[] = [];
  for (let round = 1; round <= rounds; round += 1) {
    for (const testCase of cases) {
      results.push(await runCase({ baseUrl, debugTiming, token, round, testCase }));
    }
  }

  const summary = summarizeResults(results);
  console.table(results.map(({
    serverTiming: _serverTiming,
    debugTiming: _debugTiming,
    ...result
  }) => result));
  console.table(summary);
  console.log(JSON.stringify({ baseUrl, projectId, rounds, debugTiming, summary, results }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
