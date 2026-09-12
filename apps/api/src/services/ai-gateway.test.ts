import {
  beforeAll,
  beforeEach,
  describe,
  expect,
  mock,
  test,
} from "bun:test";
import type { AiGatewayDependencies, aiGateway as aiGatewaySingleton } from "./ai-gateway";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";
const insertedAiLogs: Array<Record<string, unknown>> = [];
let routeData: Record<string, unknown> | null = null;
let routeSelection = "";
let legacyEndpoint = "";
let routeSecret = "test-route-key";
const legacySettingReads: string[] = [];
let fetchImpl: NonNullable<AiGatewayDependencies["fetchImpl"]> = globalThis.fetch;
function createRouteQuery() {
  return {
    select(selection: string) {
      routeSelection = selection;
      return this;
    },
    eq() {
      return this;
    },
    async maybeSingle() {
      return { data: routeData, error: null };
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

const client = {
  from(table: string) {
    if (table === "ai_scene_routes") return createRouteQuery();
    if (table === "ai_call_logs") return createAiCallLogQuery();
    throw new Error(`unexpected table: ${table}`);
  },
};
const settingsService = {
  async getSecretString(key: string) {
    if (key === "ROUTE_API_KEY") return routeSecret;
    legacySettingReads.push(key);
    return key === "DEEPSEEK_API_KEY" ? "test-deepseek-key" : "";
  },
  async getString(key: string, fallback = "") {
    legacySettingReads.push(key);
    if (key === "AI_MODEL") return "deepseek-chat";
    if (key === "AI_CHAT_COMPLETIONS_URL") return legacyEndpoint;
    return fallback;
  },
  async getNumber(key: string, fallback: number) {
    legacySettingReads.push(key);
    return fallback;
  },
};

let aiGateway: typeof aiGatewaySingleton;
let requestDecorationQaStream: typeof import("./decoration-qa/legacy/chat")["requestQaStream"];

function installFetch(response: Response) {
  const fetchMock = mock(async (_input: string | URL | Request, _init?: RequestInit) => response);
  fetchImpl = fetchMock;
  return fetchMock;
}

async function buildTestHeaders(apiKey: string, providerType: "openai_compatible" | "openrouter") {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
    ...(providerType === "openrouter"
      ? { "HTTP-Referer": "https://gooes.local", "X-Title": "gooes-decoration-qa" }
      : {}),
  };
}

beforeEach(() => {
  insertedAiLogs.length = 0;
  routeData = null;
  routeSelection = "";
  legacyEndpoint = "";
  routeSecret = "test-route-key";
  legacySettingReads.length = 0;
});

beforeAll(async () => {
  const { AiGateway } = await import("./ai-gateway");
  aiGateway = new AiGateway({
    client: client as unknown as AiGatewayDependencies["client"],
    fetchImpl: (input, init) => fetchImpl(input, init),
    settingsService,
  });
  ({ requestQaStream: requestDecorationQaStream } = await import("./decoration-qa/legacy/chat"));
});

describe("AiGateway.chat", () => {
  test("builds the text inference URL from the resolved provider Base URL", async () => {
    routeData = {
      scene_code: "decoration_qa",
      temperature: 0.7,
      response_format: null,
      timeout_ms: 60000,
      primary_model: {
        code: "openrouter.openai_gpt_4o",
        model_name: "openai/gpt-4o",
        modality: "text",
        status: "active",
        provider: {
          code: "openrouter",
          provider_type: "openrouter",
          status: "active",
          endpoint_url: "https://api.example.com/v1",
          api_key_setting_key: "DEEPSEEK_API_KEY",
        },
      },
    };
    const fetchMock = installFetch(Response.json({
      id: "chatcmpl-1",
      choices: [{ message: { content: "ok" } }],
    }));

    const resolved = await aiGateway.resolveChatConfig({ sceneCode: "decoration_qa" });
    expect(resolved).toMatchObject({
      providerType: "openrouter",
      endpoint: "https://api.example.com/v1/chat/completions",
    });

    await aiGateway.chat({
      sceneCode: "decoration_qa",
      messages: [{ role: "user", content: "test" }],
    });

    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.example.com/v1/chat/completions");
    expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get("X-Title"))
      .toBe("gooes-ai-gateway");
    expect(routeSelection).toContain("modality");
    expect(routeSelection).toContain("provider_type");
  });

  test("does not duplicate a legacy stored chat completions path", async () => {
    routeData = {
      scene_code: "decoration_qa",
      temperature: 0.7,
      response_format: null,
      timeout_ms: 60000,
      primary_model: {
        code: "deepseek-chat",
        model_name: "deepseek-chat",
        modality: "text",
        status: "active",
        provider: {
          code: "deepseek",
          provider_type: "openai_compatible",
          status: "active",
          endpoint_url: "https://api.example.com/v1/chat/completions",
          api_key_setting_key: "DEEPSEEK_API_KEY",
        },
      },
    };
    const fetchMock = installFetch(Response.json({
      id: "chatcmpl-1",
      choices: [{ message: { content: "ok" } }],
    }));

    await aiGateway.chat({
      sceneCode: "decoration_qa",
      messages: [{ role: "user", content: "test" }],
    });

    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.example.com/v1/chat/completions");
  });

  test("preserves OpenRouter compatibility headers for the legacy endpoint setting", async () => {
    legacyEndpoint = "https://openrouter.ai/api/v1";
    const fetchMock = installFetch(Response.json({
      id: "chatcmpl-1",
      choices: [{ message: { content: "ok" } }],
    }));

    await aiGateway.chat({
      sceneCode: "decoration_qa",
      messages: [{ role: "user", content: "test" }],
    });

    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://openrouter.ai/api/v1/chat/completions");
    const headers = new Headers(fetchMock.mock.calls[0]?.[1]?.headers);
    expect(headers.get("HTTP-Referer")).toBe("https://gooes.local");
    expect(headers.get("X-Title")).toBe("gooes-ai-gateway");
  });

  test.each(["image", "video", "speech"] as const)(
    "rejects non-text %s routes at the chat boundary before fetching",
    async (modality) => {
      routeData = {
        scene_code: "unsupported_scene",
        temperature: null,
        response_format: null,
        timeout_ms: 60000,
        primary_model: {
          code: `model-${modality}`,
          model_name: `model-${modality}`,
          modality,
          status: "active",
          provider: {
            code: "provider",
            provider_type: "openai_compatible",
            status: "active",
            endpoint_url: "https://api.example.com/v1",
            api_key_setting_key: "DEEPSEEK_API_KEY",
          },
        },
      };
      const fetchMock = installFetch(Response.json({ choices: [] }));

      await expect(aiGateway.chat({
        sceneCode: "unsupported_scene",
        messages: [{ role: "user", content: "test" }],
      })).rejects.toMatchObject({
        statusCode: 400,
        code: "AI_MODALITY_RUNTIME_UNSUPPORTED",
      });
      expect(fetchMock).toHaveBeenCalledTimes(0);
    },
  );

  test.each((["image", "video", "speech"] as const).flatMap((modality) => [
    { modality, entrypoint: "chat" as const, useFallback: false },
    { modality, entrypoint: "resolveChatConfig" as const, useFallback: false },
    { modality, entrypoint: "resolveChatConfig" as const, useFallback: true },
  ]))("rejects an empty-model $modality route via $entrypoint (fallback=$useFallback)", async ({ modality, entrypoint, useFallback }) => {
    legacyEndpoint = "https://legacy.example.com/v1";
    routeData = {
      scene_code: "unsupported_scene", modality,
      temperature: null, response_format: null, timeout_ms: 60000,
      primary_model: null, fallback_model: null,
    };
    const fetchMock = installFetch(Response.json({ choices: [{ message: { content: "legacy" } }] }));
    const operation = entrypoint === "chat"
      ? aiGateway.chat({ sceneCode: "unsupported_scene", messages: [{ role: "user", content: "test" }] })
      : aiGateway.resolveChatConfig({ sceneCode: "unsupported_scene", useFallback });
    await expect(operation).rejects.toMatchObject({ statusCode: 400, code: "AI_MODALITY_RUNTIME_UNSUPPORTED" });
    expect(routeSelection).toMatch(/scene_code,\s+modality,\s+temperature/);
    expect(fetchMock).toHaveBeenCalledTimes(0);
    expect(legacySettingReads).toEqual([]);
  });

  test.each(
    (["image", "video", "speech"] as const).flatMap((modality) =>
      ([
        ["missing endpoint", null, "ROUTE_API_KEY", "test-route-key"],
        ["missing key reference", "https://api.example.com/v1", null, "test-route-key"],
        ["empty resolved secret", "https://api.example.com/v1", "ROUTE_API_KEY", ""],
      ] as const).flatMap(([gap, endpointUrl, apiKeySettingKey, secret]) =>
        (["chat", "resolveChatConfig"] as const).map((entrypoint) => ({
          modality, gap, endpointUrl, apiKeySettingKey, secret, entrypoint,
        })),
      ),
    ),
  )("rejects configured $modality via $entrypoint before $gap can fall back", async ({
    modality, endpointUrl, apiKeySettingKey, secret, entrypoint,
  }) => {
    routeSecret = secret;
    legacyEndpoint = "https://legacy.example.com/v1";
    routeData = {
      scene_code: "unsupported_scene",
      temperature: null,
      response_format: null,
      timeout_ms: 60000,
      primary_model: {
        code: `model-${modality}`,
        model_name: `model-${modality}`,
        modality,
        status: "active",
        provider: {
          code: "provider",
          provider_type: "openai_compatible",
          status: "active",
          endpoint_url: endpointUrl,
          api_key_setting_key: apiKeySettingKey,
        },
      },
    };
    const fetchMock = installFetch(Response.json({
      id: "chatcmpl-legacy",
      choices: [{ message: { content: "legacy" } }],
    }));
    const operation = entrypoint === "chat"
      ? aiGateway.chat({ sceneCode: "unsupported_scene", messages: [{ role: "user", content: "test" }] })
      : aiGateway.resolveChatConfig({ sceneCode: "unsupported_scene" });

    await expect(operation).rejects.toMatchObject({
      statusCode: 400,
      code: "AI_MODALITY_RUNTIME_UNSUPPORTED",
    });
    expect(fetchMock).toHaveBeenCalledTimes(0);
    expect(legacySettingReads).toEqual([]);
  });

  test("keeps legacy fallback for a text model with incomplete provider configuration", async () => {
    legacyEndpoint = "https://legacy.example.com/v1";
    routeData = {
      scene_code: "decoration_qa",
      temperature: null,
      response_format: null,
      timeout_ms: 60000,
      primary_model: {
        code: "text-model",
        model_name: "text-model",
        modality: "text",
        status: "active",
        provider: {
          code: "provider",
          provider_type: "openai_compatible",
          status: "active",
          endpoint_url: null,
          api_key_setting_key: "ROUTE_API_KEY",
        },
      },
    };
    const fetchMock = installFetch(Response.json({ choices: [{ message: { content: "legacy" } }] }));

    await aiGateway.chat({
      sceneCode: "decoration_qa",
      messages: [{ role: "user", content: "test" }],
    });

    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://legacy.example.com/v1/chat/completions");
  });

  test("keeps legacy fallback for a text route without a model", async () => {
    legacyEndpoint = "https://legacy.example.com/v1";
    routeData = {
      scene_code: "decoration_qa", modality: "text",
      temperature: null, response_format: null, timeout_ms: 60000,
      primary_model: null, fallback_model: null,
    };
    const fetchMock = installFetch(Response.json({ choices: [{ message: { content: "legacy" } }] }));

    await aiGateway.chat({
      sceneCode: "decoration_qa",
      messages: [{ role: "user", content: "test" }],
    });

    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://legacy.example.com/v1/chat/completions");
  });

  test("maps an invalid provider Base URL to a stable runtime error before fetching", async () => {
    routeData = {
      scene_code: "decoration_qa",
      temperature: null,
      response_format: null,
      timeout_ms: 60000,
      primary_model: {
        code: "deepseek-chat",
        model_name: "deepseek-chat",
        modality: "text",
        status: "active",
        provider: {
          code: "deepseek",
          provider_type: "openai_compatible",
          status: "active",
          endpoint_url: "https://api.example.com/v1?token=private",
          api_key_setting_key: "DEEPSEEK_API_KEY",
        },
      },
    };
    const fetchMock = installFetch(Response.json({ choices: [] }));

    await expect(aiGateway.chat({
      sceneCode: "decoration_qa",
      messages: [{ role: "user", content: "test" }],
    })).rejects.toMatchObject({
      statusCode: 500,
      code: "AI_PROVIDER_ENDPOINT_INVALID",
      message: "AI 供应商基础地址配置无效",
    });
    expect(fetchMock).toHaveBeenCalledTimes(0);
  });

  test("fails closed when route model is inactive", async () => {
    routeData = {
      scene_code: "decoration_qa",
      temperature: 0.7,
      response_format: null,
      timeout_ms: 60000,
      primary_model: {
        code: "openrouter.openai_gpt_4o",
        model_name: "openai/gpt-4o",
        modality: "text",
        status: "inactive",
        provider: {
          code: "openrouter",
          provider_type: "openrouter",
          status: "active",
          endpoint_url: "https://openrouter.ai/api/v1/chat/completions",
          api_key_setting_key: "DEEPSEEK_API_KEY",
        },
      },
    };
    installFetch(new Response(JSON.stringify({
      id: "chatcmpl-1",
      choices: [{ message: { content: "ok" } }],
    }), { status: 200 }));

    await expect(aiGateway.chat({
      sceneCode: "decoration_qa",
      messages: [{ role: "user", content: "test" }],
    })).rejects.toMatchObject({
      statusCode: 409,
      code: "AI_MODEL_INACTIVE",
    });
  });

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

describe("decoration QA streaming headers", () => {
  test("uses the resolved OpenRouter provider type on a custom domain", async () => {
    const fetchMock = installFetch(new Response("data: [DONE]\n"));
    const request = await requestDecorationQaStream(
      "https://api.example.com/v1/chat/completions",
      "test-key",
      { model: "test-model", temperature: 0.7, messages: [], stream: true },
      1_000,
      undefined,
      "openrouter",
      { fetchImpl, buildHeaders: buildTestHeaders },
    );
    request.clearTimeout();
    await request.body.cancel();

    const headers = new Headers(fetchMock.mock.calls[0]?.[1]?.headers);
    expect(headers.get("HTTP-Referer")).toBe("https://gooes.local");
    expect(headers.get("X-Title")).toBe("gooes-decoration-qa");
  });

  test("does not infer OpenRouter from an openai-compatible hostname", async () => {
    const fetchMock = installFetch(new Response("data: [DONE]\n"));
    const request = await requestDecorationQaStream(
      "https://openrouter.ai.attacker.example/v1/chat/completions",
      "test-key",
      { model: "test-model", temperature: 0.7, messages: [], stream: true },
      1_000,
      undefined,
      "openai_compatible",
      { fetchImpl, buildHeaders: buildTestHeaders },
    );
    request.clearTimeout();
    await request.body.cancel();

    const headers = new Headers(fetchMock.mock.calls[0]?.[1]?.headers);
    expect(headers.get("HTTP-Referer")).toBeNull();
    expect(headers.get("X-Title")).toBeNull();
  });
});
