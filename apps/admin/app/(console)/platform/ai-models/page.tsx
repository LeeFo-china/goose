import { redirect } from "next/navigation";
import { Cpu, GitBranch, ServerCog } from "lucide-react";
import { AiModelRoutingPanel } from "@/components/platform-ai/ai-model-routing-panel";
import type {
  AiConfigData,
  AiProviderRecord,
  AiSceneRouteRecord,
  PageData,
} from "@/components/platform-ai/ai-config-types";
import { StatusAlert } from "@/components/admin/status-alert";
import { Card, CardContent } from "@/components/ui/card";
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
      error: "缺少登录凭证",
    };
  }

  try {
    const [summary, providers, routes, providerOptions] = await Promise.all([
      fetchBackendData<AiConfigData>(token, "/platform/ai-config"),
      fetchBackendData<PageData<AiProviderRecord>>(token, "/platform/ai-config/providers?page=1&pageSize=20"),
      fetchBackendData<PageData<AiSceneRouteRecord>>(token, "/platform/ai-config/routes?page=1&pageSize=20"),
      fetchBackendData<PageData<AiProviderRecord>>(token, "/platform/ai-config/providers?page=1&pageSize=100"),
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
      error: null,
    };
  } catch (error) {
    return {
      data: emptyConfig(),
      providerPage: emptyPage<AiProviderRecord>(),
      routePage: emptyPage<AiSceneRouteRecord>(),
      providerOptions: [],
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
      error: "当前账号不是平台超管，无法维护 AI 模型路由",
    };

  const totalRoutes = result.data.counts?.routes ?? result.data.routes.length;
  const totalModels = result.data.counts?.models ?? result.data.models.length;
  const totalProviders = result.data.counts?.providers ?? result.data.providers.length;

  return (
    <div className="flex h-[calc(100vh-6.5625rem)] min-h-0 flex-col gap-5 overflow-hidden">
      <div className="shrink-0">
        <h1 className="text-2xl font-semibold tracking-normal">AI 模型路由</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          统一维护平台 AI 供应商、模型和业务场景路由。场景配置生效后，后端按主模型调用，失败时可切换备用模型。
        </p>
      </div>

      <div className="grid shrink-0 gap-3 md:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex size-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <GitBranch className="size-5" />
            </div>
            <div>
              <div className="text-sm text-muted-foreground">场景路由</div>
              <div className="text-xl font-semibold">{totalRoutes}</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex size-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Cpu className="size-5" />
            </div>
            <div>
              <div className="text-sm text-muted-foreground">模型总数</div>
              <div className="text-xl font-semibold">{totalModels}</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex size-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <ServerCog className="size-5" />
            </div>
            <div>
              <div className="text-sm text-muted-foreground">供应商总数</div>
              <div className="text-xl font-semibold">{totalProviders}</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {result.error ? (
        <div className="shrink-0">
          <StatusAlert>{result.error}</StatusAlert>
        </div>
      ) : null}

      {hasPlatformAccess ? (
        <AiModelRoutingPanel
          providerPage={result.providerPage}
          routePage={result.routePage}
          providerOptions={result.providerOptions}
        />
      ) : null}
    </div>
  );
}
