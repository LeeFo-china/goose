import { createClient } from "@supabase/supabase-js";
import {
  ProjectOperationalRiskDisplayPageSchema,
  ProjectOperationalRiskRpcPageSchema,
} from "@gooes/domain";

type Env = Record<string, string | undefined>;

export type ProjectOperationalRiskSmokeConfig = {
  tenantId: string;
  iterations: number;
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  apiUrl: string | null;
  adminToken: string | null;
};

export type ProjectOperationalRiskSmokeSample = {
  phase: "rpc" | "api";
  round: number;
  ms: number;
  ok: boolean;
  status?: number;
  total?: number;
  itemCount?: number;
  message?: string;
};

export type ProjectOperationalRiskSmokeSummary = {
  count: number;
  ok: number;
  minMs: number;
  avgMs: number;
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
};

type SupabaseRpcClient = {
  rpc(
    fn: string,
    args: Record<string, unknown>,
  ): Promise<{ data: unknown; error: { message: string } | null }>;
};

type ParsedApiRiskPayload = {
  ok: boolean;
  status: number;
  total?: number;
  itemCount?: number;
  message?: string;
};

const API_SMOKE_URL_ENV = [
  "PROJECT_HEALTH_API_URL",
  "GOOES_API_BASE_URL",
] as const;
const API_SMOKE_TOKEN_ENV = [
  "PROJECT_HEALTH_ADMIN_TOKEN",
  "ADMIN_TOKEN",
] as const;

function requireEnv(env: Env, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function readOptionalEnv(env: Env, name: string): string | null {
  const value = env[name]?.trim();
  return value || null;
}

function readFirstOptionalEnv(env: Env, names: readonly string[]): string | null {
  for (const name of names) {
    const value = readOptionalEnv(env, name);
    if (value) return value;
  }
  return null;
}

function parseIterations(value: string | undefined): number {
  const parsed = Number.parseInt(value || "20", 10);
  if (!Number.isFinite(parsed) || parsed < 1) return 20;
  return Math.min(parsed, 200);
}

function roundMs(value: number): number {
  return Math.round(value * 100) / 100;
}

export function percentile(values: number[], ratio: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.max(0, Math.ceil(sorted.length * ratio) - 1);
  return sorted[Math.min(index, sorted.length - 1)] ?? 0;
}

export function summarizeSamples(
  samples: ProjectOperationalRiskSmokeSample[],
): ProjectOperationalRiskSmokeSummary {
  if (samples.length === 0) {
    return {
      count: 0,
      ok: 0,
      minMs: 0,
      avgMs: 0,
      p50Ms: 0,
      p95Ms: 0,
      maxMs: 0,
    };
  }

  const values = samples.map((item) => item.ms);
  return {
    count: samples.length,
    ok: samples.filter((item) => item.ok).length,
    minMs: roundMs(Math.min(...values)),
    avgMs: roundMs(values.reduce((sum, item) => sum + item, 0) / values.length),
    p50Ms: roundMs(percentile(values, 0.5)),
    p95Ms: roundMs(percentile(values, 0.95)),
    maxMs: roundMs(Math.max(...values)),
  };
}

export function normalizeSmokeConfig(env: Env): ProjectOperationalRiskSmokeConfig {
  return {
    tenantId: requireEnv(env, "PROJECT_HEALTH_TENANT_ID"),
    iterations: parseIterations(env.PROJECT_HEALTH_SMOKE_ITERATIONS),
    supabaseUrl: requireEnv(env, "SUPABASE_URL"),
    supabaseServiceRoleKey: requireEnv(env, "SUPABASE_SERVICE_ROLE_KEY"),
    apiUrl: readFirstOptionalEnv(env, API_SMOKE_URL_ENV),
    adminToken: readFirstOptionalEnv(env, API_SMOKE_TOKEN_ENV),
  };
}

export function parseApiRiskPayload(input: {
  payload: unknown;
  responseOk: boolean;
  status: number;
}): ParsedApiRiskPayload {
  const data = (input.payload as { data?: unknown } | null)?.data;
  const parsed = ProjectOperationalRiskDisplayPageSchema.safeParse(data);
  if (!input.responseOk || !parsed.success) {
    return {
      ok: false,
      status: input.status,
      message: input.responseOk
        ? "API payload format invalid"
        : `API status ${input.status}`,
    };
  }

  return {
    ok: true,
    status: input.status,
    total: parsed.data.pagination.total,
    itemCount: parsed.data.items.length,
  };
}

async function runRpcSample(
  client: SupabaseRpcClient,
  config: ProjectOperationalRiskSmokeConfig,
  round: number,
): Promise<ProjectOperationalRiskSmokeSample> {
  const startedAt = performance.now();
  const { data, error } = await client.rpc("get_project_operational_risk_page", {
    p_tenant_id: config.tenantId,
    p_page: 1,
    p_page_size: 20,
    p_risk_type: null,
    p_severity: null,
    p_keyword: null,
    p_timezone_name: "Asia/Shanghai",
  });
  const ms = roundMs(performance.now() - startedAt);

  if (error) {
    return { phase: "rpc", round, ms, ok: false, message: error.message };
  }

  const parsed = ProjectOperationalRiskRpcPageSchema.safeParse(data);
  if (!parsed.success) {
    return {
      phase: "rpc",
      round,
      ms,
      ok: false,
      message: "RPC payload format invalid",
    };
  }

  return {
    phase: "rpc",
    round,
    ms,
    ok: true,
    total: parsed.data.pagination.total,
    itemCount: parsed.data.items.length,
  };
}

async function runApiSample(
  config: ProjectOperationalRiskSmokeConfig,
  round: number,
): Promise<ProjectOperationalRiskSmokeSample> {
  if (!config.apiUrl || !config.adminToken) {
    return {
      phase: "api",
      round,
      ms: 0,
      ok: true,
      message:
        "API smoke skipped: configure PROJECT_HEALTH_API_URL or GOOES_API_BASE_URL, and PROJECT_HEALTH_ADMIN_TOKEN or ADMIN_TOKEN",
    };
  }

  const url = new URL("/project-health/risks", config.apiUrl);
  url.searchParams.set("page", "1");
  url.searchParams.set("pageSize", "20");
  const startedAt = performance.now();
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${config.adminToken}` },
  });
  const ms = roundMs(performance.now() - startedAt);
  const text = await response.text();

  let payload: unknown = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    return {
      phase: "api",
      round,
      ms,
      ok: false,
      status: response.status,
      message: "API response is not JSON",
    };
  }

  const parsed = parseApiRiskPayload({
    payload,
    responseOk: response.ok,
    status: response.status,
  });
  if (!parsed.ok) {
    return {
      phase: "api",
      round,
      ms,
      ok: false,
      status: parsed.status,
      message: parsed.message,
    };
  }

  return {
    phase: "api",
    round,
    ms,
    ok: true,
    status: parsed.status,
    total: parsed.total,
    itemCount: parsed.itemCount,
  };
}

function groupByPhase(samples: ProjectOperationalRiskSmokeSample[]) {
  return {
    rpc: samples.filter((item) => item.phase === "rpc"),
    api: samples.filter((item) => item.phase === "api" && item.ms > 0),
  };
}

async function main(): Promise<void> {
  const config = normalizeSmokeConfig(process.env);
  const client = createClient(
    config.supabaseUrl,
    config.supabaseServiceRoleKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  ) as unknown as SupabaseRpcClient;

  const samples: ProjectOperationalRiskSmokeSample[] = [];
  for (let round = 1; round <= config.iterations; round += 1) {
    samples.push(await runRpcSample(client, config, round));
    if (config.apiUrl && config.adminToken) {
      samples.push(await runApiSample(config, round));
    }
  }

  const byPhase = groupByPhase(samples);
  const summary = {
    rpc: summarizeSamples(byPhase.rpc),
    api: summarizeSamples(byPhase.api),
  };

  console.table(samples);
  console.log(JSON.stringify({
    tenantId: config.tenantId,
    iterations: config.iterations,
    apiMeasured: Boolean(config.apiUrl && config.adminToken),
    summary,
  }, null, 2));

  if (samples.some((item) => !item.ok)) {
    process.exitCode = 1;
  }
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
