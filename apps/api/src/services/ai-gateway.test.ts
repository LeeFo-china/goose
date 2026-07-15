import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  mock,
  test,
} from "bun:test";
import type { aiGateway as aiGatewaySingleton } from "./ai-gateway";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const originalFetch = globalThis.fetch;
const insertedAiLogs: Array<Record<string, unknown>> = [];

function createRouteQuery() {
  return {
    select() {
      return this;
    },
    eq() {
      return this;
    },
    async maybeSingle() {
      return { data: null, error: null };
    },
  };
}

function createAiCallLogQuery() {
  return {
    insert(payload: Record<string, unknown>) {
      insertedAiLogs.push(payload);
      return this;
    },
    async select() {
      return { data: [{ id: "log-1" }], error: null };
    },
  };
}

mock.module("@/utils/supabase", () => ({
  SupabaseDB: {
    getAdminClient() {
      return {
        from(table: string) {
          if (table === "ai_scene_routes") return createRouteQuery();
          if (table === "ai_call_logs") return createAiCallLogQuery();
          throw new Error(`unexpected table: ${table}`);
        },
      };
    },
  },
}));

mock.module("@/services/system-settings", () => ({
  systemSettingsService: {
    async getSecretString(key: string) {
      return key === "DEEPSEEK_API_KEY" ? "test-deepseek-key" : "";
    },
    async getString(key: string, fallback = "") {
      if (key === "AI_MODEL") return "deepseek-chat";
      return fallback;
    },
    async getNumber(_key: string, fallback: number) {
      return fallback;
    },
  },
}));

let aiGateway: typeof aiGatewaySingleton;

function installFetch(response: Response) {
  const fetchMock = mock(async () => response);
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

beforeEach(() => {
  insertedAiLogs.length = 0;
});

beforeAll(async () => {
  ({ aiGateway } = await import("./ai-gateway"));
});

afterAll(() => {
  globalThis.fetch = originalFetch;
});

describe("AiGateway.chat", () => {
  test("converts non-2xx null JSON responses into a stable gateway error", async () => {
    installFetch(new Response("null", { status: 429 }));

    await expect(
      aiGateway.chat({
        sceneCode: "project_operational_risk_summary",
        tenantId: "tenant-1",
        messages: [{ role: "user", content: "生成摘要" }],
        source: "admin",
        billable: true,
      }),
    ).rejects.toMatchObject({
      statusCode: 502,
      code: "AI_GATEWAY_REQUEST_FAILED",
      message: "AI 调用失败",
      details: { statusCode: 429 },
    });

    expect(insertedAiLogs[0]).toMatchObject({
      tenant_id: "tenant-1",
      scene_code: "project_operational_risk_summary",
      provider_code: "deepseek",
      model_code: "deepseek-chat",
      model_name: "deepseek-chat",
      status: "failure",
      error_code: "AI_GATEWAY_REQUEST_FAILED",
      source: "admin",
      billable: true,
    });
  });
});
