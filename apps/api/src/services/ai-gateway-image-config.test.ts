import { beforeAll, beforeEach, describe, expect, test } from "bun:test";
import type { AiGatewayDependencies, aiGateway as aiGatewaySingleton } from "./ai-gateway";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

let routeData: Record<string, unknown> | null = null;
let routeSecret = "test-route-key";
const settingReads: string[] = [];
const client = {
  from(table: string) {
    if (table !== "ai_scene_routes") throw new Error(`unexpected table: ${table}`);
    return {
      select() { return this; },
      eq() { return this; },
      async maybeSingle() { return { data: routeData, error: null }; },
    };
  },
};
const settingsService = {
  async getSecretString(key: string) {
    if (key === "ROUTE_API_KEY") return routeSecret;
    settingReads.push(key);
    return "";
  },
  async getString(_key: string, fallback = "") { return fallback; },
  async getNumber(key: string, fallback: number) {
    settingReads.push(key);
    return fallback;
  },
};

let aiGateway: typeof aiGatewaySingleton;

beforeAll(async () => {
  const { AiGateway } = await import("./ai-gateway");
  aiGateway = new AiGateway({
    client: client as unknown as AiGatewayDependencies["client"],
    settingsService,
  });
});

beforeEach(() => {
  routeData = null;
  routeSecret = "test-route-key";
  settingReads.length = 0;
});

function imageRoute(patch: Record<string, unknown> = {}) {
  return {
    scene_code: "decoration_raw_drawing",
    modality: "image",
    temperature: null,
    response_format: null,
    timeout_ms: 60000,
    primary_model: {
      code: "ark.doubao_seedream_5_0_pro_260628",
      model_name: "doubao-seedream-5-0-pro-260628",
      modality: "image",
      status: "active",
      provider: {
        code: "volcengine_ark",
        provider_type: "openai_compatible",
        status: "active",
        endpoint_url: "https://ark.cn-beijing.volces.com/api/v3",
        api_key_setting_key: "ROUTE_API_KEY",
      },
    },
    ...patch,
  };
}

describe("AiGateway.resolveImageConfig", () => {
  test("resolves an active Ark image route without legacy text fallback", async () => {
    routeData = imageRoute();

    expect(await aiGateway.resolveImageConfig({
      sceneCode: "decoration_raw_drawing",
    })).toEqual({
      providerCode: "volcengine_ark",
      providerType: "openai_compatible",
      modelCode: "ark.doubao_seedream_5_0_pro_260628",
      modelName: "doubao-seedream-5-0-pro-260628",
      baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
      apiKey: "test-route-key",
      timeoutMs: 60000,
    });
    expect(settingReads).toEqual(["AI_REQUEST_TIMEOUT_MS"]);
  });

  test.each([
    { label: "wrong route modality", routeModality: "text", modelModality: "image", providerType: "openai_compatible", modelStatus: "active", providerStatus: "active", secret: "test-route-key", code: "AI_MODALITY_RUNTIME_UNSUPPORTED" },
    { label: "wrong model modality", routeModality: "image", modelModality: "text", providerType: "openai_compatible", modelStatus: "active", providerStatus: "active", secret: "test-route-key", code: "AI_MODALITY_RUNTIME_UNSUPPORTED" },
    { label: "unsupported provider", routeModality: "image", modelModality: "image", providerType: "openrouter", modelStatus: "active", providerStatus: "active", secret: "test-route-key", code: "AI_PROVIDER_PROTOCOL_UNSUPPORTED" },
    { label: "inactive model", routeModality: "image", modelModality: "image", providerType: "openai_compatible", modelStatus: "inactive", providerStatus: "active", secret: "test-route-key", code: "AI_MODEL_INACTIVE" },
    { label: "inactive provider", routeModality: "image", modelModality: "image", providerType: "openai_compatible", modelStatus: "active", providerStatus: "inactive", secret: "test-route-key", code: "AI_PROVIDER_INACTIVE" },
    { label: "empty secret", routeModality: "image", modelModality: "image", providerType: "openai_compatible", modelStatus: "active", providerStatus: "active", secret: "", code: "AI_CONFIG_MISSING" },
  ] as const)("rejects $label", async ({
    routeModality, modelModality, providerType, modelStatus, providerStatus, secret, code,
  }) => {
    routeSecret = secret;
    const route = imageRoute();
    const model = route.primary_model;
    routeData = {
      ...route,
      modality: routeModality,
      primary_model: {
        ...model,
        modality: modelModality,
        status: modelStatus,
        provider: {
          ...model.provider,
          provider_type: providerType,
          status: providerStatus,
        },
      },
    };

    await expect(aiGateway.resolveImageConfig({
      sceneCode: "decoration_raw_drawing",
    })).rejects.toMatchObject({ code });
    expect(settingReads).toEqual([]);
  });

  test("rejects an invalid Ark base URL without exposing the configured secret", async () => {
    routeSecret = "ark-sensitive-value";
    const route = imageRoute();
    routeData = {
      ...route,
      primary_model: {
        ...route.primary_model,
        provider: {
          ...route.primary_model.provider,
          endpoint_url: "https://ark.cn-beijing.volces.com/api/v3?key=leak",
        },
      },
    };

    let message = "";
    try {
      await aiGateway.resolveImageConfig({ sceneCode: "decoration_raw_drawing" });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toBe("效果图服务配置无效");
    expect(message).not.toContain(routeSecret);
  });
});
