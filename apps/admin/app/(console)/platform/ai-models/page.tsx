import { redirect } from "next/navigation";
import { AiModelRoutingPanel } from "@/components/platform-ai/ai-model-routing-panel";
import type {
  AiConfigData,
  AiProviderRecord,
  AiSceneRouteRecord,
  AiSystemSceneRecord,
  PageData,
} from "@/components/platform-ai/ai-config-types";
import { StatusAlert } from "@/components/admin/status-alert";
import { getAdminSession, getAdminToken } from "@/lib/auth";
import { buildBackendUrl, parseBackendJson } from "@/lib/backend";

const emptyPage = <T,>(): PageData<T> => ({
  list: [],
  pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
});

const emptyConfig = (): AiConfigData => ({
  counts: { providers: 0, models: 0, routes: 0 },
  credits: null,
  usage_summary: { requests_24h: 0, estimated_cost_usd_24h: 0 },
  providers: [],
  models: [],
  routes: [],
});

async function fetchBackendData<T>(token: string, path: string) {
  const response = await fetch(buildBackendUrl(path), {
    headers: { authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const payload = await parseBackendJson<T>(response);
  return payload.data;
}

async function getAiConfig() {
  const token = await getAdminToken();
  if (!token) {
    return {
      data: emptyConfig(),
      providerPage: emptyPage<AiProviderRecord>(),
      routePage: emptyPage<AiSceneRouteRecord>(),
      providerOptions: [],
      systemScenePage: emptyPage<AiSystemSceneRecord>(),
      systemSceneError: "缺少登录凭证",
      error: "缺少登录凭证",
    };
  }

  try {
    const scenesPromise = fetchBackendData<PageData<AiSystemSceneRecord>>(
      token,
      "/platform/ai-config/system-scenes?page=1&pageSize=20",
    ).then((page) => ({ page, error: null })).catch((error) => ({
      page: emptyPage<AiSystemSceneRecord>(),
      error: error instanceof Error ? error.message : "业务场景注册表加载失败",
    }));
    const [summary, providers, routes, providerOptions, scenes] = await Promise.all([
      fetchBackendData<AiConfigData>(token, "/platform/ai-config"),
      fetchBackendData<PageData<AiProviderRecord>>(token, "/platform/ai-config/providers?page=1&pageSize=20"),
      fetchBackendData<PageData<AiSceneRouteRecord>>(token, "/platform/ai-config/routes?page=1&pageSize=20"),
      fetchBackendData<PageData<AiProviderRecord>>(token, "/platform/ai-config/providers?page=1&pageSize=100"),
      scenesPromise,
    ]);
    return {
      data: {
        ...(summary || emptyConfig()),
        providers: providers?.list || [],
        models: [],
        routes: routes?.list || [],
      },
      providerPage: providers || emptyPage<AiProviderRecord>(),
      routePage: routes || emptyPage<AiSceneRouteRecord>(),
      providerOptions: providerOptions?.list || providers?.list || [],
      systemScenePage: scenes.page || emptyPage<AiSystemSceneRecord>(),
      systemSceneError: scenes.error,
      error: null,
    };
  } catch (error) {
    return {
      data: emptyConfig(),
      providerPage: emptyPage<AiProviderRecord>(),
      routePage: emptyPage<AiSceneRouteRecord>(),
      providerOptions: [],
      systemScenePage: emptyPage<AiSystemSceneRecord>(),
      systemSceneError: error instanceof Error ? error.message : "业务场景注册表加载失败",
      error: error instanceof Error ? error.message : "AI 模型路由配置加载失败",
    };
  }
}

export default async function PlatformAiModelsPage() {
  const session = await getAdminSession();
  if (!session) {
    redirect("/login");
  }

  const hasPlatformAccess = session.roles.includes("platform_admin");
  const result = hasPlatformAccess
    ? await getAiConfig()
    : {
      data: emptyConfig(),
      providerPage: emptyPage<AiProviderRecord>(),
      routePage: emptyPage<AiSceneRouteRecord>(),
      providerOptions: [],
      systemScenePage: emptyPage<AiSystemSceneRecord>(),
      systemSceneError: "当前账号不是平台超管，无法维护 AI 模型路由",
      error: "当前账号不是平台超管，无法维护 AI 模型路由",
    };

  const totalRoutes = result.data.counts?.routes ?? result.data.routes.length;
  const totalModels = result.data.counts?.models ?? result.data.models.length;
  const totalProviders = result.data.counts?.providers ?? result.data.providers.length;

  return (
    <div className="flex h-[calc(100vh-6.5625rem)] min-h-0 flex-col gap-5 overflow-hidden">
      <div className="shrink-0">
        <h1 className="text-xl font-semibold tracking-normal">AI 模型路由</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          管理场景路由、供应商连接与模型。保存配置不代表模型调用已验证。
        </p>
      </div>

      <div className="flex shrink-0 flex-wrap gap-x-5 gap-y-1 text-sm tabular-nums text-muted-foreground" aria-label="配置概览">
        <span>场景路由 {totalRoutes}</span><span>模型 {totalModels}</span><span>供应商 {totalProviders}</span>
      </div>

      {result.error ? (
        <div className="shrink-0">
          <StatusAlert>{result.error}</StatusAlert>
        </div>
      ) : null}

      {hasPlatformAccess ? (
        <AiModelRoutingPanel
          canManageProviders={session.tenant === null && session.permissions.some((item) => item.code === "platform.ai_config.manage")}
          canManageRoutes={session.tenant === null && session.permissions.some((item) => item.code === "platform.ai_config.manage")}
          providerPage={result.providerPage}
          routePage={result.routePage}
          providerOptions={result.providerOptions}
          systemScenePage={result.systemScenePage}
          systemSceneError={result.systemSceneError}
        />
      ) : null}
    </div>
  );
}
